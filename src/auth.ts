import * as vscode from "vscode";
import { randomBytes } from "crypto";
import { SyncUser } from "./types";
import { describeError, log } from "./log";

const TOKEN_KEY = "workspace-todo.authToken";
const USER_KEY = "workspace-todo.authUser";
const SESSION_KEY = "workspace-todo.session";
const OUR_SECRET_KEYS = new Set([TOKEN_KEY, USER_KEY, SESSION_KEY]);

/**
 * Thrown once the session is genuinely unrecoverable — i.e. a renewal was
 * attempted and the server rejected it. Kept as a sentinel message rather than
 * an error class so existing callers keep working unchanged.
 */
export const AUTH_EXPIRED = "AUTH_EXPIRED";

export function authExpiredError(): Error {
  return new Error(AUTH_EXPIRED);
}

export function isAuthExpired(err: unknown): boolean {
  return err instanceof Error && err.message === AUTH_EXPIRED;
}

/** Renew this far ahead of the real expiry so requests never race it. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;
/** Floor between renewals. Guards against a skewed clock causing a loop. */
const MIN_RENEWAL_INTERVAL_MS = 60 * 1000;
/** Single-flight means one hung renewal blocks every waiter, so bound it. */
const RENEWAL_TIMEOUT_MS = 10 * 1000;
/**
 * After a transient renewal failure, fail fast for this long. Without it every
 * request would pay RENEWAL_TIMEOUT_MS while the server is unreachable.
 */
const RENEWAL_BACKOFF_MS = 30 * 1000;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
/** Fallback when a server omits both expiry fields. Matches the documented TTL. */
const ASSUMED_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

interface StoredSession {
  v: 1;
  refreshToken: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
}

interface TokenResponse {
  token?: string;
  expiresAt?: number;
  expiresIn?: number;
  refreshToken?: string;
  sessionExpiresAt?: number;
  user?: SyncUser;
}

export type AuthState = "signed-out" | "expired" | "active";

type Credentials =
  | { kind: "none" }
  /** Installed before sliding sessions existed: a long-lived token, no session. */
  | { kind: "legacy"; accessToken: string }
  | {
      kind: "sliding";
      accessToken?: string;
      refreshToken: string;
      expiresAt: number;
    };

interface PendingSignIn {
  nonce: string;
  resolve: (result: { code: string; state: string }) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

function parseSession(raw: string | undefined): StoredSession | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed?.v === 1 && typeof parsed.refreshToken === "string") {
      return parsed;
    }
  } catch {
    // Corrupt entry — treat as absent; the legacy/none paths recover from here.
  }
  return undefined;
}

/**
 * Prefer `expiresIn` over `expiresAt`: a machine with a skewed clock reads a
 * freshly minted token as already expired and would renew on every request.
 */
function accessTokenExpiry(res: TokenResponse): number {
  if (typeof res.expiresIn === "number" && res.expiresIn > 0) {
    return Date.now() + res.expiresIn * 1000;
  }
  if (typeof res.expiresAt === "number") return res.expiresAt;
  return Date.now() + ASSUMED_ACCESS_TOKEN_TTL_MS;
}

export class AuthService {
  private readonly _onDidChangeAuth = new vscode.EventEmitter<AuthState>();
  readonly onDidChangeAuth = this._onDidChangeAuth.event;

  private _pending?: PendingSignIn;
  private _cached?: Credentials;
  private _loadInFlight?: Promise<Credentials>;
  /** Bumped whenever stored secrets change, so an in-flight read can't cache stale state. */
  private _cacheGeneration = 0;
  private _renewalInFlight?: Promise<string>;
  private _lastRenewalAt = 0;
  private _renewalBackoffUntil = 0;
  private _lastRenewalFailure?: string;
  /** Set when the server has no renewal endpoints. In-memory is the right TTL. */
  private _renewalUnsupported = false;

  constructor(private readonly _context: vscode.ExtensionContext) {
    // Secrets are one keychain entry shared by every window of this extension,
    // so another window's renewal must invalidate our cache. This subscription
    // is what makes the design multi-window correct.
    _context.subscriptions.push(
      _context.secrets.onDidChange((e) => {
        if (!OUR_SECRET_KEYS.has(e.key)) return;
        this._cached = undefined;
        this._cacheGeneration++;
      }),
      this._onDidChangeAuth
    );
  }

  private get _clientLabel(): string {
    const version = this._context.extension?.packageJSON?.version ?? "unknown";
    return `vscode ${version}`;
  }

  // ---------------------------------------------------------------- sign in

  async signIn(apiBaseUrl: string): Promise<void> {
    // Supersede any attempt still waiting on the browser.
    if (this._pending) {
      clearTimeout(this._pending.timer);
      this._pending.reject(new Error("Superseded by a newer sign-in"));
      this._pending = undefined;
    }

    const nonce = randomBytes(32).toString("hex");
    let pending!: PendingSignIn;

    try {
      const { code } = await new Promise<{ code: string; state: string }>(
        (resolve, reject) => {
          const timer = setTimeout(() => {
            if (this._pending === pending) this._pending = undefined;
            reject(new Error("Sign-in timed out"));
          }, SIGN_IN_TIMEOUT_MS);
          pending = { nonce, resolve, reject, timer };
          this._pending = pending;
          vscode.env.openExternal(
            vscode.Uri.parse(`${apiBaseUrl}/auth/vscode-start?state=${nonce}`)
          );
        }
      );

      await this.handleCallback(code, apiBaseUrl);
    } finally {
      clearTimeout(pending.timer);
      // Only clear if this attempt is still the live one — never clobber a newer.
      if (this._pending === pending) this._pending = undefined;
    }
  }

  /**
   * Resolves the in-flight sign-in. The nonce is compared here so a stale
   * browser tab is simply ignored rather than failing a live attempt with a
   * misleading "possible CSRF attack".
   */
  handleOAuthCallback(code: string, state: string): void {
    const pending = this._pending;
    if (!pending) return;
    if (state !== pending.nonce) {
      log("ignoring auth callback with a stale state nonce");
      return;
    }
    this._pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve({ code, state });
  }

  async handleCallback(code: string, apiBaseUrl: string): Promise<void> {
    const res = await fetch(`${apiBaseUrl}/api/auth/vscode-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `capabilities` opts in to sliding sessions. A server that predates them
      // ignores the extra keys and returns a legacy token, which we handle below.
      body: JSON.stringify({
        code,
        capabilities: ["refresh"],
        client: this._clientLabel,
      }),
    });

    if (!res.ok) {
      throw new Error(`Auth failed: ${await res.text()}`);
    }

    const payload = (await res.json()) as TokenResponse;
    if (!payload.token || !payload.user) {
      throw new Error("Auth failed: malformed response");
    }

    if (payload.refreshToken) {
      await this._storeSession(
        payload.token,
        payload.refreshToken,
        accessTokenExpiry(payload)
      );
      log("signed in with a sliding session");
    } else {
      // Server predates sliding sessions. Use the long-lived token as-is and
      // skip the doomed upgrade probe for the rest of this window.
      await this._context.secrets.store(TOKEN_KEY, payload.token);
      this._cached = { kind: "legacy", accessToken: payload.token };
      this._renewalUnsupported = true;
      log("signed in with a legacy token (server has no sliding sessions)");
    }

    await this._context.secrets.store(USER_KEY, JSON.stringify(payload.user));
    this._onDidChangeAuth.fire("active");
  }

  // --------------------------------------------------------------- sign out

  async signOut(apiBaseUrl?: string): Promise<void> {
    const creds = await this._load();
    if (apiBaseUrl && creds.kind === "sliding") {
      // Fire-and-forget: the refresh token should die server-side too, but a
      // failure here must never block signing out locally.
      void this._revoke(apiBaseUrl, creds.refreshToken);
    }
    await this._clearCredentials();
    this._onDidChangeAuth.fire("signed-out");
  }

  private async _revoke(apiBaseUrl: string, refreshToken: string): Promise<void> {
    try {
      await this._postJson(`${apiBaseUrl}/api/auth/session/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (err) {
      log(`session revoke failed (ignored): ${describeError(err)}`);
    }
  }

  // ----------------------------------------------------------------- tokens

  /**
   * Returns the token to send with a request, renewing first when the current
   * one is close to expiry. Throws AUTH_EXPIRED only when renewal was attempted
   * and rejected.
   */
  async getAccessToken(apiBaseUrl: string): Promise<string | undefined> {
    const creds = await this._load();

    switch (creds.kind) {
      case "none":
        return undefined;

      case "legacy": {
        // One-time migration onto a sliding session, on the first request after
        // updating. Falls back to the legacy token if the server can't do it.
        if (this._renewalUnsupported) return creds.accessToken;
        try {
          return await this._renewSingleFlight(apiBaseUrl);
        } catch (err) {
          if (isAuthExpired(err)) throw err;
          return creds.accessToken;
        }
      }

      case "sliding": {
        const fresh =
          creds.accessToken && Date.now() < creds.expiresAt - REFRESH_SKEW_MS;
        if (fresh) return creds.accessToken;
        if (this._renewalUnsupported) return creds.accessToken;
        if (
          creds.accessToken &&
          Date.now() - this._lastRenewalAt < MIN_RENEWAL_INTERVAL_MS
        ) {
          // Just renewed and it still reads as near-expiry: the clock is off.
          // Use what we have rather than renewing in a loop.
          return creds.accessToken;
        }
        try {
          return await this._renewSingleFlight(apiBaseUrl);
        } catch (err) {
          if (isAuthExpired(err)) throw err;
          // Renewal unreachable. The current token may still be genuinely valid
          // (we renew 5 minutes early), so prefer it over failing the request.
          if (creds.accessToken && Date.now() < creds.expiresAt) {
            return creds.accessToken;
          }
          throw err;
        }
      }
    }
  }

  /**
   * Called after a request came back 401. Resolves once a usable token is in
   * place; throws AUTH_EXPIRED if the session is dead.
   */
  async refreshAfter401(
    staleToken: string | undefined,
    apiBaseUrl: string
  ): Promise<void> {
    const creds = await this._load();
    if (creds.kind === "none") throw authExpiredError();

    // Compare-and-swap: N parallel requests that 401 on different event-loop
    // turns cost exactly one renewal. Whoever finds a token other than the one
    // they sent just retries with it.
    if (creds.accessToken && creds.accessToken !== staleToken) return;

    if (this._renewalUnsupported) throw authExpiredError();
    await this._renewSingleFlight(apiBaseUrl);
  }

  /** Cheap synchronous check so doomed requests skip the network entirely. */
  canRenew(): boolean {
    if (this._renewalUnsupported) return false;
    const creds = this._cached;
    if (!creds) return true; // unknown; let _renew decide from stored state
    return creds.kind !== "none";
  }

  /**
   * The mutex. The assignment below is synchronous and lands before the caller's
   * next await, so every caller arriving on the same event-loop turn — exactly
   * what a `for` loop of un-awaited requests produces — shares one promise.
   * Clearing in `finally` *before* awaiters resume is deliberate: a request
   * arriving afterwards re-checks, finds a valid token, and never renews.
   */
  private _renewSingleFlight(apiBaseUrl: string): Promise<string> {
    if (this._renewalInFlight) return this._renewalInFlight;

    if (Date.now() < this._renewalBackoffUntil) {
      // A recent attempt failed for transient reasons, so fail fast rather than
      // making every subsequent request wait out the renewal timeout.
      return Promise.reject(
        new Error(this._lastRenewalFailure ?? "Token renewal unavailable")
      );
    }

    this._renewalInFlight = this._renew(apiBaseUrl)
      .catch((err: unknown) => {
        // AUTH_EXPIRED is terminal and already cleared credentials; there is
        // nothing to back off from.
        if (!isAuthExpired(err)) {
          this._renewalBackoffUntil = Date.now() + RENEWAL_BACKOFF_MS;
          this._lastRenewalFailure = describeError(err);
        }
        throw err;
      })
      .finally(() => {
        this._renewalInFlight = undefined;
      });
    return this._renewalInFlight;
  }

  /**
   * Renews the access token, or migrates a legacy install onto a session.
   *
   * Uses bare fetch rather than going through ApiClient on purpose: a 401 from
   * the renewal endpoint must not re-enter the 401 handler.
   */
  private async _renew(apiBaseUrl: string): Promise<string> {
    const creds = await this._load();
    if (creds.kind === "none") throw authExpiredError();

    const isUpgrade = creds.kind === "legacy";
    const what = isUpgrade ? "session upgrade" : "token refresh";
    const url = isUpgrade
      ? `${apiBaseUrl}/api/auth/session/upgrade`
      : `${apiBaseUrl}/api/auth/refresh`;
    const init: RequestInit =
      creds.kind === "legacy"
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${creds.accessToken}`,
            },
            body: JSON.stringify({ client: this._clientLabel }),
          }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: creds.refreshToken }),
          };

    let status: number;
    let body: TokenResponse | undefined;
    try {
      ({ status, body } = await this._postJson(url, init));
    } catch (err) {
      // Network failure or timeout. Credentials are deliberately left untouched:
      // a transient outage must never sign the user out.
      log(`${what} unreachable: ${describeError(err)}`);
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (status === 401) {
      // The only authoritative "this session is dead" signal in the system.
      log(`${what} rejected (401) — session is dead`);
      await this._clearCredentials();
      this._onDidChangeAuth.fire("expired");
      throw authExpiredError();
    }

    if (status === 404 || status === 405) {
      // Server predates these endpoints. Keep credentials and keep working.
      this._renewalUnsupported = true;
      log(`${what} unavailable on this server (${status}) — staying on the current token`);
      throw new Error(`${what} unavailable: ${status}`);
    }

    if (status !== 200 || !body?.token) {
      throw new Error(`${what} failed: ${status}`);
    }

    const refreshToken =
      body.refreshToken ??
      (creds.kind === "sliding" ? creds.refreshToken : undefined);
    if (!refreshToken) {
      // Accepted us but issued no refresh token: an older server than expected.
      this._renewalUnsupported = true;
      throw new Error(`${what} returned no refresh token`);
    }

    const expiresAt = accessTokenExpiry(body);
    await this._storeSession(body.token, refreshToken, expiresAt);
    this._lastRenewalAt = Date.now();
    this._renewalBackoffUntil = 0;
    this._lastRenewalFailure = undefined;
    log(
      `${what} succeeded; access token valid for ${Math.round(
        (expiresAt - Date.now()) / 1000
      )}s`
    );
    // Deliberately does NOT fire "active". A dead session wipes credentials, so
    // renewal can only ever succeed on a routine refresh — never as a recovery.
    // Announcing it would make listeners re-run their sign-in flow hourly.
    return body.token;
  }

  private async _postJson(
    url: string,
    init: RequestInit
  ): Promise<{ status: number; body: TokenResponse | undefined }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RENEWAL_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      // Read the body inside the timeout window — a server that sends headers
      // and then stalls would otherwise hang forever.
      const text = await res.text();
      let body: TokenResponse | undefined;
      try {
        body = text ? (JSON.parse(text) as TokenResponse) : undefined;
      } catch {
        body = undefined;
      }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------------ state

  async getUser(): Promise<SyncUser | null> {
    const raw = await this._context.secrets.get(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SyncUser;
    } catch {
      return null;
    }
  }

  async isSignedIn(): Promise<boolean> {
    return (await this._load()).kind !== "none";
  }

  /**
   * Single-flighted so a burst of parallel requests costs one pair of keychain
   * reads rather than two per request.
   */
  private _load(): Promise<Credentials> {
    if (this._cached) return Promise.resolve(this._cached);
    if (this._loadInFlight) return this._loadInFlight;
    this._loadInFlight = this._readCredentials().finally(() => {
      this._loadInFlight = undefined;
    });
    return this._loadInFlight;
  }

  private async _readCredentials(): Promise<Credentials> {
    const generation = this._cacheGeneration;

    const [token, sessionRaw] = await Promise.all([
      this._context.secrets.get(TOKEN_KEY),
      this._context.secrets.get(SESSION_KEY),
    ]);
    const session = parseSession(sessionRaw);

    let creds: Credentials;
    if (session) {
      creds = {
        kind: "sliding",
        accessToken: token,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
      };
    } else if (token) {
      creds = { kind: "legacy", accessToken: token };
    } else {
      creds = { kind: "none" };
    }

    // If secrets changed while we were reading, return what we read but do not
    // cache it — the next caller re-reads.
    if (generation === this._cacheGeneration) this._cached = creds;
    return creds;
  }

  /**
   * The access token and the session live under separate keys so that rolling
   * back to a pre-sliding build still finds a usable token under authToken
   * instead of a JSON blob it would send as a bearer and get 401'd on. The two
   * writes are not atomic, but both torn states self-heal: a session without a
   * token renews, and a token without a session looks legacy and upgrades.
   */
  private async _storeSession(
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): Promise<void> {
    const session: StoredSession = { v: 1, refreshToken, expiresAt };
    await this._context.secrets.store(TOKEN_KEY, accessToken);
    await this._context.secrets.store(SESSION_KEY, JSON.stringify(session));
    this._cached = { kind: "sliding", accessToken, refreshToken, expiresAt };
  }

  private async _clearCredentials(): Promise<void> {
    await this._context.secrets.delete(TOKEN_KEY);
    await this._context.secrets.delete(SESSION_KEY);
    await this._context.secrets.delete(USER_KEY);
    this._cached = { kind: "none" };
  }
}

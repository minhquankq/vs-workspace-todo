import * as vscode from "vscode";
import { SyncUser } from "./types";

const TOKEN_KEY = "workspace-todo.authToken";
const USER_KEY = "workspace-todo.authUser";

// Google doesn't allow vscode:// URIs as redirect URIs.
// We proxy through the website: /auth/callback → 302 → vscode://...
function getRedirectUri(apiBaseUrl: string): string {
  return `${apiBaseUrl}/auth/callback`;
}

export class AuthService {
  private _pendingAuthResolve?: (code: string) => void;

  async signIn(
    context: vscode.ExtensionContext,
    apiBaseUrl: string
  ): Promise<void> {
    const clientId = await this._getGoogleClientId();
    const redirectUri = getRedirectUri(apiBaseUrl);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
      state: "vscode",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    const code = await new Promise<string>((resolve, reject) => {
      this._pendingAuthResolve = resolve;
      vscode.env.openExternal(vscode.Uri.parse(authUrl));

      // Timeout after 5 minutes
      setTimeout(() => {
        this._pendingAuthResolve = undefined;
        reject(new Error("Sign-in timed out"));
      }, 5 * 60 * 1000);
    });

    await this.handleCallback(code, context, apiBaseUrl);
  }

  handleOAuthCallback(code: string): void {
    if (this._pendingAuthResolve) {
      this._pendingAuthResolve(code);
      this._pendingAuthResolve = undefined;
    }
  }

  async handleCallback(
    code: string,
    context: vscode.ExtensionContext,
    apiBaseUrl: string
  ): Promise<void> {
    const res = await fetch(`${apiBaseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirectUri: getRedirectUri(apiBaseUrl) }),
    });

    if (!res.ok) {
      throw new Error(`Auth failed: ${await res.text()}`);
    }

    const { token, user } = await res.json() as { token: string; user: SyncUser };
    await context.secrets.store(TOKEN_KEY, token);
    await context.secrets.store(USER_KEY, JSON.stringify(user));
  }

  async signOut(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(TOKEN_KEY);
    await context.secrets.delete(USER_KEY);
  }

  async getToken(context: vscode.ExtensionContext): Promise<string | undefined> {
    return context.secrets.get(TOKEN_KEY);
  }

  async getUser(context: vscode.ExtensionContext): Promise<SyncUser | null> {
    const raw = await context.secrets.get(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SyncUser;
    } catch {
      return null;
    }
  }

  async isSignedIn(context: vscode.ExtensionContext): Promise<boolean> {
    const token = await this.getToken(context);
    return !!token;
  }

  private _getGoogleClientId(): string {
    const config = vscode.workspace.getConfiguration("workspace-todo");
    const clientId = config.get<string>("googleClientId");
    if (clientId) return clientId;
    throw new Error(
      "Google Client ID not configured. Set workspace-todo.googleClientId in settings."
    );
  }
}

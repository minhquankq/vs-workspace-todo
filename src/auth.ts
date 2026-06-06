import * as vscode from "vscode";
import { SyncUser } from "./types";

const TOKEN_KEY = "workspace-todo.authToken";
const USER_KEY = "workspace-todo.authUser";

export class AuthService {
  private _pendingAuthResolve?: (result: { code: string; state: string }) => void;
  private _pendingNonce?: string;

  async signIn(
    context: vscode.ExtensionContext,
    apiBaseUrl: string
  ): Promise<void> {
    const { randomFillSync } = await import("crypto");
    const buf = Buffer.alloc(32);
    randomFillSync(buf);
    const nonce = buf.toString("hex");
    this._pendingNonce = nonce;

    const { code, state } = await new Promise<{ code: string; state: string }>(
      (resolve, reject) => {
        this._pendingAuthResolve = resolve;
        vscode.env.openExternal(
          vscode.Uri.parse(`${apiBaseUrl}/auth/vscode-start?state=${nonce}`)
        );

        setTimeout(() => {
          this._pendingAuthResolve = undefined;
          this._pendingNonce = undefined;
          reject(new Error("Sign-in timed out"));
        }, 5 * 60 * 1000);
      }
    );

    if (state !== this._pendingNonce) {
      this._pendingNonce = undefined;
      throw new Error("State mismatch — possible CSRF attack");
    }
    this._pendingNonce = undefined;

    await this.handleCallback(code, context, apiBaseUrl);
  }

  handleOAuthCallback(code: string, state: string): void {
    if (this._pendingAuthResolve) {
      this._pendingAuthResolve({ code, state });
      this._pendingAuthResolve = undefined;
    }
  }

  async handleCallback(
    code: string,
    context: vscode.ExtensionContext,
    apiBaseUrl: string
  ): Promise<void> {
    const res = await fetch(`${apiBaseUrl}/api/auth/vscode-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      throw new Error(`Auth failed: ${await res.text()}`);
    }

    const { token, user } = (await res.json()) as {
      token: string;
      user: SyncUser;
    };
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
}

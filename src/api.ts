import * as vscode from "vscode";
import { AuthService } from "./auth";
import { TodoItem, Settings, SyncUser, WorkspaceInfo } from "./types";

export interface SyncPayload {
  workspaceName: string;
  todos: TodoItem[];
  settings: Settings;
  lastSyncedAt?: number;
}

export interface SyncResponse {
  todos: TodoItem[];
  settings: Settings;
  syncedAt: number;
}

export class ApiClient {
  constructor(
    private readonly authService: AuthService,
    private readonly context: vscode.ExtensionContext
  ) {}

  get baseUrl(): string {
    return vscode.workspace
      .getConfiguration("workspace-todo")
      .get<string>("apiBaseUrl", "https://vs-todo-website.vercel.app");
  }

  private async _fetch(
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    const token = await this.authService.getToken(this.context);
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401) {
      await this.authService.signOut(this.context);
      throw new Error("AUTH_EXPIRED");
    }

    return res;
  }

  async getMe(): Promise<SyncUser> {
    const res = await this._fetch("/api/auth/me");
    if (!res.ok) throw new Error(`getMe failed: ${res.status}`);
    const { user } = await res.json() as { user: SyncUser };
    return user;
  }

  async pushSync(payload: SyncPayload): Promise<SyncResponse> {
    const res = await this._fetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`pushSync failed: ${res.status}`);
    return res.json() as unknown as SyncResponse;
  }

  async pullSync(
    workspaceName: string,
    since?: number
  ): Promise<SyncResponse> {
    const params = new URLSearchParams({ workspaceName });
    if (since !== undefined) params.set("since", String(since));
    const res = await this._fetch(`/api/sync/pull?${params}`);
    if (!res.ok) throw new Error(`pullSync failed: ${res.status}`);
    return res.json() as unknown as SyncResponse;
  }

  async deleteWorkspace(workspaceName: string): Promise<void> {
    const params = new URLSearchParams({ workspaceName });
    const res = await this._fetch(`/api/sync/workspace?${params}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204)
      throw new Error(`deleteWorkspace failed: ${res.status}`);
  }

  async getWorkspaces(): Promise<WorkspaceInfo[]> {
    const res = await this._fetch("/api/workspaces");
    if (!res.ok) throw new Error(`getWorkspaces failed: ${res.status}`);
    const list = await res.json() as Array<{ id: string; name: string; todos: unknown[] }>;
    return list.map((w) => ({ id: w.id, name: w.name, todoCount: w.todos.length }));
  }

  async createWorkspace(name: string): Promise<{ id: string; name: string }> {
    const res = await this._fetch("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`createWorkspace failed: ${res.status}`);
    return res.json() as Promise<{ id: string; name: string }>;
  }
}

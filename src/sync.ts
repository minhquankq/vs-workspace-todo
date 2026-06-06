import * as vscode from "vscode";
import { ApiClient } from "./api";
import { getTodos, saveTodos, getSettings, getLastSyncedAt, saveLastSyncedAt, getSyncedWorkspaceName, saveSyncedWorkspaceName } from "./storage";
import { TodoItem } from "./types";

type SyncStatus = "syncing" | "synced" | "offline" | "error";

export class SyncService {
  private _periodicTimer?: ReturnType<typeof setInterval>;
  private _debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly apiClient: ApiClient,
    private readonly context: vscode.ExtensionContext,
    private readonly onStateChange: () => void,
    private readonly onStatusChange: (status: SyncStatus, error?: string) => void
  ) {}

  private get _workspaceState() {
    return this.context.workspaceState;
  }

  private _getWorkspaceName(): string | undefined {
    // Try stored name first, then fall back to current workspace folder
    const stored = getSyncedWorkspaceName(this._workspaceState);
    if (stored) return stored;

    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.name;
  }

  async ensureWorkspaceName(): Promise<string | undefined> {
    const name = this._getWorkspaceName();
    if (name) {
      await saveSyncedWorkspaceName(this._workspaceState, name);
    }
    return name;
  }

  push(): void {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._doPush(), 500);
  }

  private async _doPush(): Promise<void> {
    const workspaceName = await this.ensureWorkspaceName();
    if (!workspaceName) return;

    try {
      this.onStatusChange("syncing");
      const todos = getTodos(this._workspaceState);
      const settings = getSettings(this._workspaceState);
      const lastSyncedAt = getLastSyncedAt(this._workspaceState);

      const response = await this.apiClient.pushSync({
        workspaceName,
        todos,
        settings,
        lastSyncedAt,
      });

      await this._mergeServerResponse(response.todos);
      await saveLastSyncedAt(this._workspaceState, response.syncedAt);
      this.onStateChange();
      this.onStatusChange("synced");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "AUTH_EXPIRED") {
        this.onStatusChange("error", "Session expired. Please sign in again.");
      } else {
        this.onStatusChange("offline");
      }
    }
  }

  async pull(): Promise<void> {
    const workspaceName = await this.ensureWorkspaceName();
    if (!workspaceName) return;

    try {
      this.onStatusChange("syncing");
      const since = getLastSyncedAt(this._workspaceState);
      const response = await this.apiClient.pullSync(workspaceName, since);

      await this._mergeServerResponse(response.todos);
      await saveLastSyncedAt(this._workspaceState, response.syncedAt);
      this.onStateChange();
      this.onStatusChange("synced");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "AUTH_EXPIRED") {
        this.onStatusChange("error", "Session expired. Please sign in again.");
      } else {
        this.onStatusChange("offline");
      }
    }
  }

  async fullSync(): Promise<void> {
    await this._doPush();
  }

  startPeriodicSync(): void {
    this.stopPeriodicSync();
    this._periodicTimer = setInterval(() => this.pull(), 5 * 60 * 1000);
  }

  stopPeriodicSync(): void {
    if (this._periodicTimer) {
      clearInterval(this._periodicTimer);
      this._periodicTimer = undefined;
    }
  }

  private async _mergeServerResponse(serverTodos: TodoItem[]): Promise<void> {
    const localTodos = getTodos(this._workspaceState);
    const localMap = new Map(localTodos.map((t) => [t.id, t]));

    for (const serverTodo of serverTodos) {
      const local = localMap.get(serverTodo.id);
      if (!local || serverTodo.updatedAt > local.updatedAt) {
        localMap.set(serverTodo.id, serverTodo);
      }
    }

    await saveTodos(this._workspaceState, Array.from(localMap.values()));
  }
}

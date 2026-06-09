import * as vscode from "vscode";
import { ApiClient } from "./api";
import {
  getTodos,
  saveTodos,
  getSettings,
  getLastSyncedAt,
  saveLastSyncedAt,
  getSyncedWorkspaceName,
  saveSyncedWorkspaceName,
  getLinkedWorkspaceId,
  getHasPendingSync,
  saveHasPendingSync,
} from "./storage";
import { TodoItem } from "./types";

type SyncStatus = "syncing" | "synced" | "offline" | "error";

export class SyncService {
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
    const stored = getSyncedWorkspaceName(this._workspaceState);
    if (stored) return stored;
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.name;
  }

  private _getWorkspaceId(): string | undefined {
    return getLinkedWorkspaceId(this._workspaceState);
  }

  async ensureWorkspaceName(): Promise<string | undefined> {
    const name = this._getWorkspaceName();
    if (name) {
      await saveSyncedWorkspaceName(this._workspaceState, name);
    }
    return name;
  }

  async push(): Promise<void> {
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
      await saveHasPendingSync(this._workspaceState, false);
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

  async syncOnOpen(): Promise<void> {
    const pending = getHasPendingSync(this._workspaceState);
    if (pending) {
      await this.push();
    } else {
      await this.pull();
    }
  }

  private async _handleCrudError(err: unknown): Promise<void> {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "AUTH_EXPIRED") {
      this.onStatusChange("error", "Session expired. Please sign in again.");
    } else {
      await saveHasPendingSync(this._workspaceState, true);
      this.onStatusChange("offline");
    }
  }

  async tryCreate(todo: TodoItem): Promise<void> {
    const workspaceId = this._getWorkspaceId();
    if (!workspaceId) return;

    try {
      this.onStatusChange("syncing");
      await this.apiClient.createTodo(workspaceId, todo.content, todo.order);
      this.onStatusChange("synced");
    } catch (err) {
      await this._handleCrudError(err);
    }
  }

  async tryUpdate(
    id: string,
    changes: { content?: string; completed?: boolean }
  ): Promise<void> {
    try {
      this.onStatusChange("syncing");
      await this.apiClient.updateTodo(id, changes);
      this.onStatusChange("synced");
    } catch (err) {
      await this._handleCrudError(err);
    }
  }

  async tryDelete(id: string): Promise<void> {
    try {
      this.onStatusChange("syncing");
      await this.apiClient.deleteTodo(id);
      this.onStatusChange("synced");
    } catch (err) {
      await this._handleCrudError(err);
    }
  }

  async tryReorder(order: { id: string; order: number }[]): Promise<void> {
    const workspaceId = this._getWorkspaceId();
    if (!workspaceId) return;

    try {
      this.onStatusChange("syncing");
      await this.apiClient.reorderTodos(workspaceId, order);
      this.onStatusChange("synced");
    } catch (err) {
      await this._handleCrudError(err);
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

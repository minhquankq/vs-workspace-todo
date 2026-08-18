import * as vscode from "vscode";
import { ApiClient } from "./api";
import {
  getTodos,
  saveTodos,
  getSettings,
  getLastSyncedAt,
  saveLastSyncedAt,
  clearLastSyncedAt,
  getSyncedWorkspaceName,
  saveSyncedWorkspaceName,
  getLinkedWorkspaceId,
  getHasPendingSync,
  saveHasPendingSync,
} from "./storage";
import { TodoItem } from "./types";
import { isAuthExpired } from "./auth";
import { describeError, log } from "./log";

type SyncStatus = "syncing" | "synced" | "offline" | "error";

/**
 * How stale local data must be before an activity trigger actually syncs. This
 * is the debounce shared by activation, window focus and panel visibility.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;

export class SyncService {
  constructor(
    private readonly apiClient: ApiClient,
    private readonly context: vscode.ExtensionContext,
    private readonly onStateChange: () => void,
    private readonly onStatusChange: (status: SyncStatus, error?: string) => void,
    private readonly onItemSynced: (id: string) => Promise<void>
  ) {}

  /**
   * The sync currently in flight, if any. Holding the promise rather than a
   * boolean means concurrent callers can await the running sync instead of
   * silently returning, which matters for resetAndPull.
   */
  private _inFlight?: Promise<void>;

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

  /**
   * Concurrent syncs coalesce onto the one already running. The assignment is
   * synchronous, so callers arriving on the same event-loop turn all see it.
   */
  push(): Promise<void> {
    if (this._inFlight) return this._inFlight;
    this._inFlight = this._push().finally(() => {
      this._inFlight = undefined;
    });
    return this._inFlight;
  }

  private async _push(): Promise<void> {
    try {
      const workspaceName = await this.ensureWorkspaceName();
      if (!workspaceName) return;

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
      // Unlike pull, a failed push always leaves unsent local work behind.
      await this._handleError(err, true);
    }
  }

  pull(): Promise<void> {
    if (this._inFlight) return this._inFlight;
    this._inFlight = this._pull().finally(() => {
      this._inFlight = undefined;
    });
    return this._inFlight;
  }

  private async _pull(): Promise<void> {
    try {
      const workspaceName = await this.ensureWorkspaceName();
      if (!workspaceName) return;

      this.onStatusChange("syncing");
      const since = getLastSyncedAt(this._workspaceState);
      const response = await this.apiClient.pullSync(workspaceName, since);

      await this._mergeServerResponse(response.todos);
      await saveLastSyncedAt(this._workspaceState, response.syncedAt);
      this.onStateChange();
      this.onStatusChange("synced");
    } catch (err: unknown) {
      // A failed pull has nothing local to replay, and marking pending here
      // would wrongly turn the next sync into a push. Staleness is already
      // recorded by lastSyncedAt.
      await this._handleError(err, false);
    }
  }

  /**
   * The single throttled entry point for every activity trigger: activation,
   * window focus, and the panel becoming visible. Each of those is also what
   * keeps the session sliding forward, since any request renews a near-expired
   * access token on its way out.
   */
  async syncOnOpen(): Promise<void> {
    const pending = getHasPendingSync(this._workspaceState);
    if (pending) {
      await this.push();
      return;
    }

    const lastSyncedAt = getLastSyncedAt(this._workspaceState);
    if (lastSyncedAt && Date.now() - lastSyncedAt < STALE_AFTER_MS) {
      return;
    }

    await this.pull();
  }

  /**
   * `markPending` says whether local work was left unsent. AUTH_EXPIRED always
   * marks it, so edits made while the session was dead replay after re-auth.
   */
  private async _handleError(err: unknown, markPending: boolean): Promise<void> {
    if (isAuthExpired(err)) {
      await saveHasPendingSync(this._workspaceState, true);
      this.onStatusChange("error", "Session expired. Please sign in again.");
      return;
    }
    log(`sync failed: ${describeError(err)}`);
    if (markPending) await saveHasPendingSync(this._workspaceState, true);
    this.onStatusChange("offline");
  }

  async tryCreate(todo: TodoItem): Promise<void> {
    const workspaceId = this._getWorkspaceId();
    if (!workspaceId) return;

    try {
      this.onStatusChange("syncing");
      await this.apiClient.createTodo(workspaceId, todo.content, todo.order, todo.id);
      await this.onItemSynced(todo.id);
      this.onStatusChange("synced");
    } catch (err) {
      await this._handleError(err, true);
    }
  }

  async tryUpdate(
    id: string,
    changes: { content?: string; completed?: boolean }
  ): Promise<void> {
    try {
      this.onStatusChange("syncing");
      await this.apiClient.updateTodo(id, changes);
      await this.onItemSynced(id);
      this.onStatusChange("synced");
    } catch (err) {
      await this._handleError(err, true);
    }
  }

  async tryDelete(id: string): Promise<void> {
    try {
      this.onStatusChange("syncing");
      await this.apiClient.deleteTodo(id);
      this.onStatusChange("synced");
    } catch (err) {
      await this._handleError(err, true);
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
      await this._handleError(err, true);
    }
  }

  async resetAndPull(): Promise<void> {
    // Let any in-flight sync settle first, so the pull below is not coalesced
    // away — otherwise the user would be left looking at an empty list.
    await this._inFlight?.catch(() => undefined);
    await saveTodos(this._workspaceState, []);
    await clearLastSyncedAt(this._workspaceState);
    await saveHasPendingSync(this._workspaceState, false);
    this.onStateChange();
    await this.pull();
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

    // Clear pendingSync on all items — server is now in sync
    const merged = Array.from(localMap.values()).map(({ pendingSync: _, ...t }) => t);
    await saveTodos(this._workspaceState, merged);
  }
}

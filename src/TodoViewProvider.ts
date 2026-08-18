import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import { getTodos, saveTodos, getSettings, saveSettings, getLinkedWorkspaceId, saveLinkedWorkspaceId, saveSyncedWorkspaceName, clearLinkedWorkspace, getHasPendingSync, saveHasPendingSync, getSyncedUserId, saveSyncedUserId } from "./storage";
import { TodoItem, Settings, WebviewMessage, ExtensionMessage, WorkspaceInfo } from "./types";
import { AuthService, AuthState } from "./auth";
import { ApiClient } from "./api";
import { SyncService } from "./sync";
import { log } from "./log";

export class TodoViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workspace-todo.mainView";

  private _view?: vscode.WebviewView;
  private _syncService?: SyncService;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _authService: AuthService,
    private readonly _apiClient: ApiClient
  ) {
    _context.subscriptions.push(
      _authService.onDidChangeAuth((state) => {
        void this._handleAuthStateChange(state);
      })
    );
  }

  public async initSync(): Promise<void> {
    const signedIn = await this._authService.isSignedIn();
    if (!signedIn) return;

    const workspaceId = getLinkedWorkspaceId(this._context.workspaceState);
    if (!workspaceId) return;

    this._syncService = new SyncService(
      this._apiClient,
      this._context,
      () => this._pushState(),
      (status, error) => this._emitSyncStatus(status, error),
      (id) => this._handleItemSynced(id)
    );
  }

  private async _checkAndPromptWorkspaceLink(): Promise<void> {
    const signedIn = await this._authService.isSignedIn();
    if (!signedIn) return;

    // If sync is already running, no need to re-check
    if (this._syncService) return;

    let workspaces: WorkspaceInfo[] = [];
    try {
      workspaces = await this._apiClient.getWorkspaces();
    } catch {
      // Network error — don't block UI, user can retry later via sync badge
      return;
    }

    const storedId = getLinkedWorkspaceId(this._context.workspaceState);
    if (storedId) {
      const match = workspaces.find((w) => w.id === storedId);
      if (match) {
        // Workspace still valid — auto-link and start sync
        await saveSyncedWorkspaceName(this._context.workspaceState, match.name);
        await this.initSync();
        // Cast needed: TS narrows _syncService to undefined via the guard above,
        // but initSync() sets it when conditions are met.
        (this._syncService as SyncService | undefined)?.syncOnOpen();
        return;
      }
      // Stored workspace no longer exists — fall through to show link UI
    }

    const defaultName =
      vscode.workspace.workspaceFolders?.[0]?.name ?? "My Workspace";
    const msg: ExtensionMessage = {
      type: "showLinkView",
      workspaces,
      defaultName,
    };
    this._view?.webview.postMessage(msg);
  }

  public async stopSync(): Promise<void> {
    this._syncService = undefined;
  }

  public async resetLocalData(): Promise<void> {
    if (!this._syncService) {
      vscode.window.showWarningMessage("Workspace Todo: not linked to a workspace — nothing to reset.");
      return;
    }
    await this._syncService.resetAndPull();
  }

  /**
   * Throttled sync used by every activity trigger (activation, window focus,
   * panel visibility). Also what keeps the session sliding: any request renews a
   * near-expired access token on its way out, so being active is enough.
   */
  public syncOnActivity(): void {
    void this._syncService?.syncOnOpen();
  }

  /**
   * Only interactive sign-in reports "active" — routine token refreshes stay
   * silent, so this runs exactly when the account may have changed.
   */
  private async _handleAuthStateChange(state: AuthState): Promise<void> {
    if (state === "expired") {
      await this._handleSessionExpired();
      return;
    }
    if (state === "active") {
      await this._handleSignedIn();
    }
  }

  /**
   * Teardown after a renewal was rejected. Deliberately narrower than
   * _handleSignOut: the linked workspace, its name and lastSyncedAt all survive,
   * because that is exactly what lets queued edits replay after re-auth.
   */
  private async _handleSessionExpired(): Promise<void> {
    log("session expired — pausing sync, local edits kept for replay");
    await saveHasPendingSync(this._context.workspaceState, true);
    this._syncService = undefined;
    this._emitSyncStatus("error", "Session expired. Please sign in again.");
    await this._pushState();
  }

  private async _handleSignedIn(): Promise<void> {
    const user = await this._authService.getUser();
    if (!user) return;

    const previousOwner = getSyncedUserId(this._context.workspaceState);
    if (previousOwner && previousOwner !== user.id) {
      // Different account. /api/sync/push finds-or-creates the remote workspace
      // by NAME, so replaying here would copy the previous account's todos into
      // this one. Drop the link instead and let the user pick a workspace.
      log("signed in as a different account — dropping the workspace link");
      await saveHasPendingSync(this._context.workspaceState, false);
      await clearLinkedWorkspace(this._context.workspaceState);
      await this._pushState();
      await this._checkAndPromptWorkspaceLink();
      return;
    }

    if (!getLinkedWorkspaceId(this._context.workspaceState)) {
      await this._pushState();
      await this._checkAndPromptWorkspaceLink();
      return;
    }

    await saveSyncedUserId(this._context.workspaceState, user.id);
    await this.initSync();
    await this._pushState();

    // A single push IS the whole replay: it sends every todo including the
    // soft-deleted ones, and the server merges last-write-wins.
    if (getHasPendingSync(this._context.workspaceState)) {
      log("replaying queued local changes");
      void this._syncService?.push();
    } else {
      this.syncOnActivity();
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath, "dist")),
      ],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible) return;
      void this._pushState();
      this.syncOnActivity();
    }, undefined, this._context.subscriptions);

    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.type) {
          case "ready":
            await this._pushState();
            break;
          case "addTodo":
            await this._handleAddTodo(message.content);
            break;
          case "updateTodo":
            await this._handleUpdateTodo(
              message.id,
              message.content,
              message.completed
            );
            break;
          case "deleteTodo":
            await this._handleDeleteTodo(message.id);
            break;
          case "reorderTodos":
            await this._handleReorderTodos(message.ids);
            break;
          case "updateSettings":
            await this._handleUpdateSettings(message.settings);
            break;
          case "clearCompleted":
            await this._handleClearCompleted();
            break;
          case "signIn":
            await this._handleSignIn();
            break;
          case "signOut":
            await this._handleSignOut();
            break;
          case "linkWorkspace":
            await this._handleLinkWorkspace(message.workspaceId, message.workspaceName);
            break;
          case "createWorkspace":
            await this._handleCreateWorkspace(message.name);
            break;
          case "dismissLinkView":
            // User closed the link view; stays offline until they link later
            break;
          case "resetLocalData":
            await this.resetLocalData();
            break;
          case "syncNow":
            await this.syncNow();
            break;
        }
      },
      undefined,
      this._context.subscriptions
    );
  }

  /** Explicit user-initiated sync, shared by the badge and the command. */
  public async syncNow(): Promise<void> {
    if (!this._syncService) {
      await this._checkAndPromptWorkspaceLink();
      return;
    }
    if (getHasPendingSync(this._context.workspaceState)) {
      await this._syncService.push();
    } else {
      await this._syncService.pull();
    }
  }

  public async clearCompleted(): Promise<void> {
    await this._handleClearCompleted();
  }

  private async _handleSignIn(): Promise<void> {
    try {
      // Success fires onDidChangeAuth("active"), which pushes state, re-links
      // and replays any queued changes. Nothing to duplicate here.
      await this._authService.signIn(this._apiClient.baseUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Sign in failed: ${msg}`);
    }
  }

  private async _handleItemSynced(id: string): Promise<void> {
    const todos = getTodos(this._context.workspaceState).map((t) =>
      t.id === id ? { ...t, pendingSync: undefined } : t
    );
    await saveTodos(this._context.workspaceState, todos);
    await this._pushState();
  }

  private async _handleSignOut(): Promise<void> {
    await this.stopSync();
    await this._authService.signOut(this._apiClient.baseUrl);
    await clearLinkedWorkspace(this._context.workspaceState);
    // Clear any pending indicators since sync is no longer active
    const todos = getTodos(this._context.workspaceState).map(({ pendingSync: _, ...t }) => t);
    await saveTodos(this._context.workspaceState, todos);
    await this._pushState();
  }

  private async _handleLinkWorkspace(workspaceId: string, workspaceName: string): Promise<void> {
    await saveLinkedWorkspaceId(this._context.workspaceState, workspaceId);
    await saveSyncedWorkspaceName(this._context.workspaceState, workspaceName);
    const user = await this._authService.getUser();
    if (user) await saveSyncedUserId(this._context.workspaceState, user.id);
    await this.initSync();
    await this._pushState();
    this._syncService?.push();
  }

  private async _handleCreateWorkspace(name: string): Promise<void> {
    try {
      const ws = await this._apiClient.createWorkspace(name);
      await this._handleLinkWorkspace(ws.id, ws.name);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const msg: ExtensionMessage = { type: "linkViewError", error: errorMsg };
      this._view?.webview.postMessage(msg);
    }
  }

  private async _handleAddTodo(content: string): Promise<void> {
    const todos = getTodos(this._context.workspaceState);
    const maxOrder = todos.reduce((m, t) => Math.max(m, t.order), -1);
    const now = Date.now();
    const newTodo: TodoItem = {
      id: crypto.randomUUID(),
      content: content.trim(),
      completed: false,
      createdAt: now,
      order: maxOrder + 1,
      updatedAt: now,
      pendingSync: this._syncService ? true : undefined,
    };
    await saveTodos(this._context.workspaceState, [...todos, newTodo]);
    this._pushState();
    this._syncService?.tryCreate(newTodo);
  }

  private async _handleUpdateTodo(
    id: string,
    content?: string,
    completed?: boolean
  ): Promise<void> {
    const now = Date.now();
    let todos = getTodos(this._context.workspaceState);

    todos = todos.map((t) => {
      if (t.id !== id) return t;
      return {
        ...t,
        ...(content !== undefined ? { content } : {}),
        ...(completed !== undefined ? { completed } : {}),
        updatedAt: now,
        pendingSync: this._syncService ? true : undefined,
      };
    });

    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
    this._syncService?.tryUpdate(id, {
      ...(content !== undefined ? { content } : {}),
      ...(completed !== undefined ? { completed } : {}),
    });
  }

  private async _handleDeleteTodo(id: string): Promise<void> {
    const now = Date.now();
    const todos = getTodos(this._context.workspaceState).map((t) =>
      t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t
    );
    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
    this._syncService?.tryDelete(id);
  }

  private async _handleReorderTodos(ids: string[]): Promise<void> {
    const now = Date.now();
    const todos = getTodos(this._context.workspaceState);
    const map = new Map(todos.map((t) => [t.id, t]));
    const reordered = ids
      .map((id, index) => {
        const t = map.get(id);
        return t ? { ...t, order: index, updatedAt: now } : null;
      })
      .filter((t): t is TodoItem => t !== null);

    // Preserve any todos not in the reorder list (e.g., soft-deleted)
    const reorderedIds = new Set(ids);
    const rest = todos.filter((t) => !reorderedIds.has(t.id));
    await saveTodos(this._context.workspaceState, [...reordered, ...rest]);
    this._pushState();
    this._syncService?.tryReorder(reordered.map((t) => ({ id: t.id, order: t.order })));
  }

  private async _handleUpdateSettings(
    partial: Partial<Settings>
  ): Promise<void> {
    const current = getSettings(this._context.workspaceState);
    const updated: Settings = { ...current, ...partial };
    await saveSettings(this._context.workspaceState, updated);
    this._pushState();
    this._syncService?.push();
  }

  private async _handleClearCompleted(): Promise<void> {
    const now = Date.now();
    const allTodos = getTodos(this._context.workspaceState);
    const toDelete = allTodos.filter((t) => t.completed && !t.deletedAt);
    const todos = allTodos.map((t) =>
      t.completed && !t.deletedAt ? { ...t, deletedAt: now, updatedAt: now } : t
    );
    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
    for (const t of toDelete) {
      this._syncService?.tryDelete(t.id);
    }
  }

  private async _pushState(): Promise<void> {
    if (!this._view) return;
    const allTodos = getTodos(this._context.workspaceState);
    // Filter out soft-deleted todos for the webview
    const todos = allTodos.filter((t) => !t.deletedAt);
    const settings = getSettings(this._context.workspaceState);
    const user = await this._authService.getUser();
    const hasPendingSync = getHasPendingSync(this._context.workspaceState);
    const msg: ExtensionMessage = { type: "setState", todos, settings, user, hasPendingSync };
    this._view.webview.postMessage(msg);
  }

  private _emitSyncStatus(
    status: "syncing" | "synced" | "offline" | "error",
    error?: string
  ): void {
    if (!this._view) return;
    const msg: ExtensionMessage = { type: "syncStatus", status, error };
    this._view.webview.postMessage(msg);
  }

  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, "dist", "webview.js")
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, "dist", "webview.css")
      )
    );
    const nonce = crypto.randomBytes(16).toString("hex");
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src 'nonce-${nonce}';
             style-src ${webview.cspSource} 'unsafe-inline';
             img-src ${webview.cspSource} data:;" />
  <title>Workspace Todo</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

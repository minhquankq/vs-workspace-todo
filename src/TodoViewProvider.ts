import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import { getTodos, saveTodos, getSettings, saveSettings, getLinkedWorkspaceId, saveLinkedWorkspaceId, saveSyncedWorkspaceName, clearLinkedWorkspace } from "./storage";
import { TodoItem, Settings, WebviewMessage, ExtensionMessage, WorkspaceInfo } from "./types";
import { AuthService } from "./auth";
import { ApiClient } from "./api";
import { SyncService } from "./sync";

export class TodoViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workspace-todo.mainView";

  private _view?: vscode.WebviewView;
  private _syncService?: SyncService;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _authService: AuthService,
    private readonly _apiClient: ApiClient
  ) {}

  public async initSync(): Promise<void> {
    const signedIn = await this._authService.isSignedIn(this._context);
    if (!signedIn) return;

    const workspaceId = getLinkedWorkspaceId(this._context.workspaceState);
    if (!workspaceId) return;

    this._syncService = new SyncService(
      this._apiClient,
      this._context,
      () => this._pushState(),
      (status, error) => this._emitSyncStatus(status, error)
    );
    this._syncService.startPeriodicSync();
  }

  private async _checkAndPromptWorkspaceLink(): Promise<void> {
    const signedIn = await this._authService.isSignedIn(this._context);
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
        (this._syncService as SyncService | undefined)?.pull();
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
    this._syncService?.stopPeriodicSync();
    this._syncService = undefined;
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

    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.type) {
          case "ready":
            await this._pushState();
            if (this._syncService) {
              this._syncService.pull();
            } else {
              await this._checkAndPromptWorkspaceLink();
            }
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
        }
      },
      undefined,
      this._context.subscriptions
    );
  }

  public async clearCompleted(): Promise<void> {
    await this._handleClearCompleted();
  }

  private async _handleSignIn(): Promise<void> {
    try {
      await this._authService.signIn(this._context, this._apiClient.baseUrl);
      await this._pushState();
      await this._checkAndPromptWorkspaceLink();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Sign in failed: ${msg}`);
    }
  }

  private async _handleSignOut(): Promise<void> {
    await this.stopSync();
    await this._authService.signOut(this._context);
    await clearLinkedWorkspace(this._context.workspaceState);
    await this._pushState();
  }

  private async _handleLinkWorkspace(workspaceId: string, workspaceName: string): Promise<void> {
    await saveLinkedWorkspaceId(this._context.workspaceState, workspaceId);
    await saveSyncedWorkspaceName(this._context.workspaceState, workspaceName);
    await this.initSync();
    await this._pushState();
    this._syncService?.pull();
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
    };
    await saveTodos(this._context.workspaceState, [...todos, newTodo]);
    this._pushState();
    this._syncService?.push();
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
      };
    });

    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
    this._syncService?.push();
  }

  private async _handleDeleteTodo(id: string): Promise<void> {
    const now = Date.now();
    const todos = getTodos(this._context.workspaceState).map((t) =>
      t.id === id ? { ...t, deletedAt: now, updatedAt: now } : t
    );
    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
    this._syncService?.push();
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
    this._syncService?.push();
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
    const todos = getTodos(this._context.workspaceState).map((t) =>
      t.completed && !t.deletedAt ? { ...t, deletedAt: now, updatedAt: now } : t
    );
    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
    this._syncService?.push();
  }

  private async _pushState(): Promise<void> {
    if (!this._view) return;
    const allTodos = getTodos(this._context.workspaceState);
    // Filter out soft-deleted todos for the webview
    const todos = allTodos.filter((t) => !t.deletedAt);
    const settings = getSettings(this._context.workspaceState);
    const user = await this._authService.getUser(this._context);
    const msg: ExtensionMessage = { type: "setState", todos, settings, user };
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

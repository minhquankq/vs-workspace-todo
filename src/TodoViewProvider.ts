import * as vscode from "vscode";
import * as path from "path";
import * as crypto from "crypto";
import { getTodos, saveTodos, getSettings, saveSettings } from "./storage";
import { TodoItem, Settings, WebviewMessage, ExtensionMessage } from "./types";

export class TodoViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "workspace-todo.mainView";

  private _view?: vscode.WebviewView;

  constructor(private readonly _context: vscode.ExtensionContext) {}

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
            this._pushState();
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
        }
      },
      undefined,
      this._context.subscriptions
    );
  }

  public async clearCompleted(): Promise<void> {
    await this._handleClearCompleted();
  }

  private async _handleAddTodo(content: string): Promise<void> {
    const todos = getTodos(this._context.workspaceState);
    const maxOrder = todos.reduce((m, t) => Math.max(m, t.order), -1);
    const newTodo: TodoItem = {
      id: crypto.randomUUID(),
      content: content.trim(),
      completed: false,
      createdAt: Date.now(),
      order: maxOrder + 1,
    };
    await saveTodos(this._context.workspaceState, [...todos, newTodo]);
    this._pushState();
  }

  private async _handleUpdateTodo(
    id: string,
    content?: string,
    completed?: boolean
  ): Promise<void> {
    let todos = getTodos(this._context.workspaceState);
    const settings = getSettings(this._context.workspaceState);

    todos = todos.map((t) => {
      if (t.id !== id) return t;
      return {
        ...t,
        ...(content !== undefined ? { content } : {}),
        ...(completed !== undefined ? { completed } : {}),
      };
    });

    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
  }

  private async _handleDeleteTodo(id: string): Promise<void> {
    const todos = getTodos(this._context.workspaceState).filter(
      (t) => t.id !== id
    );
    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
  }

  private async _handleReorderTodos(ids: string[]): Promise<void> {
    const todos = getTodos(this._context.workspaceState);
    const map = new Map(todos.map((t) => [t.id, t]));
    const reordered = ids
      .map((id, index) => {
        const t = map.get(id);
        return t ? { ...t, order: index } : null;
      })
      .filter((t): t is TodoItem => t !== null);
    await saveTodos(this._context.workspaceState, reordered);
    this._pushState();
  }

  private async _handleUpdateSettings(
    partial: Partial<Settings>
  ): Promise<void> {
    const current = getSettings(this._context.workspaceState);
    const updated: Settings = { ...current, ...partial };
    await saveSettings(this._context.workspaceState, updated);
    this._pushState();
  }

  private async _handleClearCompleted(): Promise<void> {
    const todos = getTodos(this._context.workspaceState).filter(
      (t) => !t.completed
    );
    await saveTodos(this._context.workspaceState, todos);
    this._pushState();
  }

  private _pushState(): void {
    if (!this._view) return;
    const todos = getTodos(this._context.workspaceState);
    const settings = getSettings(this._context.workspaceState);
    const msg: ExtensionMessage = { type: "setState", todos, settings };
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

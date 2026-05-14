import * as vscode from "vscode";
import { TodoViewProvider } from "./TodoViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new TodoViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TodoViewProvider.viewId, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("workspace-todo.clearCompleted", () => {
      provider.clearCompleted();
    })
  );
}

export function deactivate(): void {}

import * as vscode from "vscode";
import { TodoViewProvider } from "./TodoViewProvider";
import { AuthService } from "./auth";
import { ApiClient } from "./api";

export function activate(context: vscode.ExtensionContext): void {
  const authService = new AuthService();
  const apiClient = new ApiClient(authService, context);
  const provider = new TodoViewProvider(context, authService, apiClient);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TodoViewProvider.viewId, provider)
  );

  // Initialize sync if already signed in
  provider.initSync();

  // URI handler for OAuth callback: vscode://quan-vo.vs-workspace-todo/auth/callback
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri) {
        if (uri.path === "/auth/callback") {
          const params = new URLSearchParams(uri.query);
          const code = params.get("code");
          const state = params.get("state");
          if (code && state) {
            authService.handleOAuthCallback(code, state);
          }
        }
      },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("workspace-todo.clearCompleted", () => {
      provider.clearCompleted();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("workspace-todo.signIn", async () => {
      try {
        await authService.signIn(context, apiClient.baseUrl);
        await provider.initSync();
        vscode.window.showInformationMessage("Signed in to Workspace Todo sync.");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Sign in failed: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("workspace-todo.signOut", async () => {
      await provider.stopSync();
      await authService.signOut(context);
      vscode.window.showInformationMessage("Signed out of Workspace Todo sync.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("workspace-todo.resetLocalData", async () => {
      const confirmed = await vscode.window.showWarningMessage(
        "Reset local todos and re-pull from the server? This will replace your local list with the server copy.",
        { modal: true },
        "Reset & Re-sync"
      );
      if (confirmed === "Reset & Re-sync") {
        await provider.resetLocalData();
        vscode.window.showInformationMessage("Workspace Todo: local data reset and synced from server.");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("workspace-todo.syncNow", async () => {
      const signedIn = await authService.isSignedIn(context);
      if (!signedIn) {
        vscode.window.showWarningMessage(
          "You are not signed in. Use 'Workspace Todo: Sign In' to enable sync."
        );
        return;
      }
      vscode.window.showInformationMessage("Syncing Workspace Todo...");
    })
  );
}

export function deactivate(): void {}

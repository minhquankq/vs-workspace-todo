import * as vscode from "vscode";
import { TodoViewProvider } from "./TodoViewProvider";
import { AuthService } from "./auth";
import { ApiClient } from "./api";
import { initLog } from "./log";

/** Collapses a burst of focus events into one sync. */
const FOCUS_DEBOUNCE_MS = 30 * 1000;

export function activate(context: vscode.ExtensionContext): void {
  initLog(context);

  const authService = new AuthService(context);
  const apiClient = new ApiClient(authService);
  const provider = new TodoViewProvider(context, authService, apiClient);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TodoViewProvider.viewId, provider)
  );

  // Sync on activation. This is also what keeps an occasional user's session
  // alive: the request renews a near-expired access token, which slides the
  // session's expiry forward on the server.
  void provider.initSync().then(() => provider.syncOnActivity());

  // Window focus is the other activity trigger. Event-driven rather than a
  // polling timer — session longevity only needs one renewal per sliding window,
  // and every mutation is optimistic-local so nobody waits on the network.
  //
  // Registered here rather than in resolveWebviewView, which can run again after
  // the view is disposed and would accumulate one live handler per re-resolve.
  let lastFocusSync = 0;
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) return;
      const now = Date.now();
      if (now - lastFocusSync < FOCUS_DEBOUNCE_MS) return;
      lastFocusSync = now;
      provider.syncOnActivity();
    })
  );

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
        // The provider reacts to onDidChangeAuth("active") to link and sync.
        await authService.signIn(apiClient.baseUrl);
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
      await authService.signOut(apiClient.baseUrl);
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
      const signedIn = await authService.isSignedIn();
      if (!signedIn) {
        vscode.window.showWarningMessage(
          "You are not signed in. Use 'Workspace Todo: Sign In' to enable sync."
        );
        return;
      }
      await provider.syncNow();
    })
  );
}

export function deactivate(): void {}

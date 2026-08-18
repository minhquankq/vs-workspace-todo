import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function initLog(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("Workspace Todo");
  context.subscriptions.push(channel);
}

/** Diagnostics for the sync/auth flow. Never include token material. */
export function log(message: string): void {
  channel?.appendLine(`${new Date().toISOString()} ${message}`);
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

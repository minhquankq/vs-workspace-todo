import * as vscode from "vscode";
import { TodoItem, Settings } from "./types";

const TODOS_KEY = "workspace-todo.todos";
const SETTINGS_KEY = "workspace-todo.settings";
const LAST_SYNCED_AT_KEY = "workspace-todo.lastSyncedAt";
const SYNCED_WORKSPACE_NAME_KEY = "workspace-todo.syncedWorkspaceName";

export function getTodos(state: vscode.Memento): TodoItem[] {
  const raw = state.get<TodoItem[]>(TODOS_KEY, []);
  // Backfill updatedAt for todos created before sync was added
  return raw.map((t) => ({
    ...t,
    updatedAt: t.updatedAt ?? t.createdAt,
  }));
}

export async function saveTodos(
  state: vscode.Memento,
  todos: TodoItem[]
): Promise<void> {
  await state.update(TODOS_KEY, todos);
}

export function getSettings(state: vscode.Memento): Settings {
  return state.get<Settings>(SETTINGS_KEY, {
    hideCompleted: false,
  });
}

export async function saveSettings(
  state: vscode.Memento,
  settings: Settings
): Promise<void> {
  await state.update(SETTINGS_KEY, settings);
}

export function getLastSyncedAt(state: vscode.Memento): number | undefined {
  return state.get<number>(LAST_SYNCED_AT_KEY);
}

export async function saveLastSyncedAt(
  state: vscode.Memento,
  ts: number
): Promise<void> {
  await state.update(LAST_SYNCED_AT_KEY, ts);
}

export function getSyncedWorkspaceName(state: vscode.Memento): string | undefined {
  return state.get<string>(SYNCED_WORKSPACE_NAME_KEY);
}

export async function saveSyncedWorkspaceName(
  state: vscode.Memento,
  name: string
): Promise<void> {
  await state.update(SYNCED_WORKSPACE_NAME_KEY, name);
}

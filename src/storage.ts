import * as vscode from "vscode";
import { TodoItem, Settings } from "./types";

const TODOS_KEY = "workspace-todo.todos";
const SETTINGS_KEY = "workspace-todo.settings";
const LAST_SYNCED_AT_KEY = "workspace-todo.lastSyncedAt";
const SYNCED_WORKSPACE_NAME_KEY = "workspace-todo.syncedWorkspaceName";
const LINKED_WORKSPACE_ID_KEY = "workspace-todo.linkedWorkspaceId";
const HAS_PENDING_SYNC_KEY = "workspace-todo.hasPendingSync";

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

export async function clearLastSyncedAt(state: vscode.Memento): Promise<void> {
  await state.update(LAST_SYNCED_AT_KEY, undefined);
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

export function getLinkedWorkspaceId(state: vscode.Memento): string | undefined {
  return state.get<string>(LINKED_WORKSPACE_ID_KEY);
}

export async function saveLinkedWorkspaceId(
  state: vscode.Memento,
  id: string
): Promise<void> {
  await state.update(LINKED_WORKSPACE_ID_KEY, id);
}

export async function clearLinkedWorkspace(state: vscode.Memento): Promise<void> {
  await state.update(LINKED_WORKSPACE_ID_KEY, undefined);
  await state.update(SYNCED_WORKSPACE_NAME_KEY, undefined);
  await state.update(LAST_SYNCED_AT_KEY, undefined);
}

export function getHasPendingSync(state: vscode.Memento): boolean {
  return state.get<boolean>(HAS_PENDING_SYNC_KEY, false);
}

export async function saveHasPendingSync(
  state: vscode.Memento,
  val: boolean
): Promise<void> {
  await state.update(HAS_PENDING_SYNC_KEY, val);
}

import * as vscode from "vscode";
import { TodoItem, Settings } from "./types";

const TODOS_KEY = "workspace-todo.todos";
const SETTINGS_KEY = "workspace-todo.settings";

export function getTodos(state: vscode.Memento): TodoItem[] {
  return state.get<TodoItem[]>(TODOS_KEY, []);
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

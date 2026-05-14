export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
  order: number;
}

export interface Settings {
  hideCompleted: boolean;
}

// Messages sent from the webview to the extension host
export type WebviewMessage =
  | { type: "addTodo"; content: string }
  | { type: "updateTodo"; id: string; content?: string; completed?: boolean }
  | { type: "deleteTodo"; id: string }
  | { type: "reorderTodos"; ids: string[] }
  | { type: "updateSettings"; settings: Partial<Settings> }
  | { type: "clearCompleted" }
  | { type: "ready" };

// Messages sent from the extension host to the webview
export type ExtensionMessage = {
  type: "setState";
  todos: TodoItem[];
  settings: Settings;
};

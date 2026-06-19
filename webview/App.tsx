import React, { useReducer, useMemo, useEffect, useState } from "react";
import { TodoItem, Settings, SyncUser, WorkspaceInfo } from "../src/types";
import { useVsCode } from "./hooks/useVsCode";
import SearchBar from "./components/SearchBar";
import Toolbar from "./components/Toolbar";
import TodoList from "./components/TodoList";
import AddTodo from "./components/AddTodo";
import EditDialog from "./components/EditDialog";
import LinkView from "./components/LinkView";
import Icon from "./components/Icon";

interface State {
  todos: TodoItem[];
  settings: Settings;
  search: string;
  user: SyncUser | null;
  hasPendingSync: boolean;
  view: "list" | "link";
  linkWorkspaces: WorkspaceInfo[];
  linkDefaultName: string;
  linkError: string | undefined;
}

type Action =
  | { type: "SET_STATE"; todos: TodoItem[]; settings: Settings; user?: SyncUser | null; hasPendingSync?: boolean }
  | { type: "SET_SEARCH"; search: string }
  | { type: "SHOW_LINK_VIEW"; workspaces: WorkspaceInfo[]; defaultName: string }
  | { type: "DISMISS_LINK_VIEW" }
  | { type: "LINK_VIEW_ERROR"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_STATE":
      return {
        ...state,
        todos: action.todos,
        settings: action.settings,
        user: action.user ?? null,
        hasPendingSync: action.hasPendingSync ?? false,
        // Dismiss link view once we have a user (sign-out clears user)
        view: action.user ? "list" : state.view,
      };
    case "SET_SEARCH":
      return { ...state, search: action.search };
    case "SHOW_LINK_VIEW":
      return { ...state, view: "link", linkWorkspaces: action.workspaces, linkDefaultName: action.defaultName, linkError: undefined };
    case "DISMISS_LINK_VIEW":
      return { ...state, view: "list", linkError: undefined };
    case "LINK_VIEW_ERROR":
      return { ...state, linkError: action.error };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, {
    todos: [],
    settings: { hideCompleted: false },
    search: "",
    user: null,
    hasPendingSync: false,
    view: "list",
    linkWorkspaces: [],
    linkDefaultName: "",
    linkError: undefined,
  });
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);

  const { send, syncStatus, syncError } = useVsCode(
    (todos, settings, user, hasPendingSync) => {
      dispatch({ type: "SET_STATE", todos, settings, user, hasPendingSync: hasPendingSync ?? false });
    },
    ({ workspaces, defaultName }) => {
      dispatch({ type: "SHOW_LINK_VIEW", workspaces, defaultName });
    },
    (error) => {
      dispatch({ type: "LINK_VIEW_ERROR", error });
    }
  );

  useEffect(() => {
    send({ type: "ready" });
  }, [send]);

  const filteredTodos = useMemo(() => {
    const q = state.search.toLowerCase().trim();
    let sorted = [...state.todos].sort((a, b) => a.order - b.order);
    if (state.settings.hideCompleted) sorted = sorted.filter((t) => !t.completed);
    if (!q) return sorted;
    return sorted.filter((t) => t.content.toLowerCase().includes(q));
  }, [state.todos, state.search, state.settings.hideCompleted]);

  const remaining = state.todos.filter((t) => !t.completed).length;
  const doneCount = state.todos.length - remaining;

  const showStrip = state.user !== null && syncStatus !== "idle";
  const stripStateClass =
    syncStatus === "synced" ? "ok" :
    syncStatus === "syncing" ? "go" :
    syncStatus === "offline" ? "warn" : "";
  const stripLabel =
    syncStatus === "synced"  ? "All changes synced" :
    syncStatus === "syncing" ? "Syncing…" :
    syncStatus === "offline" ? "Offline — will retry" :
    "Sync error";

  return (
    <div className="panel d-regular">
      <Toolbar
        settings={state.settings}
        user={state.user}
        syncStatus={syncStatus}
        syncError={syncError}
        hasPendingSync={state.hasPendingSync}
        onClearCompleted={() => send({ type: "clearCompleted" })}
        onToggleHideCompleted={() =>
          send({
            type: "updateSettings",
            settings: { hideCompleted: !state.settings.hideCompleted },
          })
        }
        onSignIn={() => send({ type: "signIn" })}
        onSignOut={() => send({ type: "signOut" })}
        onResetLocalData={() => send({ type: "resetLocalData" })}
        onSyncNow={() => send({ type: "syncNow" })}
      />

      <SearchBar
        value={state.search}
        onChange={(s) => dispatch({ type: "SET_SEARCH", search: s })}
      />

      {showStrip && (
        <div className="p-strip">
          <Icon name="folder" size={13} />
          <span className="strip-name">{state.user?.name ?? state.user?.email}</span>
          <span className={"strip-dot " + stripStateClass} />
          <span className="strip-state">{stripLabel}</span>
        </div>
      )}

      <div className="p-list">
        <TodoList
          todos={filteredTodos}
          search={state.search}
          onUpdate={(id, content, completed) =>
            send({ type: "updateTodo", id, content, completed })
          }
          onEdit={setEditingTodo}
          onDelete={(id) => send({ type: "deleteTodo", id })}
          onReorder={(ids) => send({ type: "reorderTodos", ids })}
        />
      </div>

      <div className="p-count">{remaining} active · {doneCount} done</div>

      <AddTodo onAdd={(content) => send({ type: "addTodo", content })} />

      {editingTodo && (
        <EditDialog
          todo={editingTodo}
          onClose={() => setEditingTodo(null)}
          onSave={(content) => {
            send({ type: "updateTodo", id: editingTodo.id, content });
            setEditingTodo(null);
          }}
        />
      )}

      {state.view === "link" && (
        <LinkView
          workspaces={state.linkWorkspaces}
          defaultName={state.linkDefaultName}
          error={state.linkError}
          onBack={() => {
            send({ type: "dismissLinkView" });
            dispatch({ type: "DISMISS_LINK_VIEW" });
          }}
          onLink={(workspaceId, workspaceName) => {
            send({ type: "linkWorkspace", workspaceId, workspaceName });
            dispatch({ type: "DISMISS_LINK_VIEW" });
          }}
          onCreate={(name) => {
            send({ type: "createWorkspace", name });
          }}
        />
      )}
    </div>
  );
}

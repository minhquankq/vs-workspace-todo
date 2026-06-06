import React, { useReducer, useMemo, useEffect } from "react";
import { TodoItem, Settings, SyncUser } from "../src/types";
import { useVsCode } from "./hooks/useVsCode";
import SearchBar from "./components/SearchBar";
import Toolbar from "./components/Toolbar";
import TodoList from "./components/TodoList";
import AddTodo from "./components/AddTodo";

interface State {
  todos: TodoItem[];
  settings: Settings;
  search: string;
  user: SyncUser | null;
}

type Action =
  | { type: "SET_STATE"; todos: TodoItem[]; settings: Settings; user?: SyncUser | null }
  | { type: "SET_SEARCH"; search: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_STATE":
      return {
        ...state,
        todos: action.todos,
        settings: action.settings,
        user: action.user ?? null,
      };
    case "SET_SEARCH":
      return { ...state, search: action.search };
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
  });

  const { send, syncStatus, syncError } = useVsCode((todos, settings, user) => {
    dispatch({ type: "SET_STATE", todos, settings, user });
  });

  // Tell extension we're ready so it can push initial state
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

  return (
    <div className="app">
      <div className="search-row">
        <SearchBar
          value={state.search}
          onChange={(s) => dispatch({ type: "SET_SEARCH", search: s })}
        />
        <Toolbar
          settings={state.settings}
          user={state.user}
          syncStatus={syncStatus}
          syncError={syncError}
          onClearCompleted={() => send({ type: "clearCompleted" })}
          onToggleHideCompleted={() =>
            send({
              type: "updateSettings",
              settings: { hideCompleted: !state.settings.hideCompleted },
            })
          }
          onSignIn={() => send({ type: "signIn" })}
          onSignOut={() => send({ type: "signOut" })}
        />
      </div>
      <div className="todo-section">
        <TodoList
          todos={filteredTodos}
          onUpdate={(id, content, completed) =>
            send({ type: "updateTodo", id, content, completed })
          }
          onDelete={(id) => send({ type: "deleteTodo", id })}
          onReorder={(ids) => send({ type: "reorderTodos", ids })}
        />
      </div>
      <AddTodo onAdd={(content) => send({ type: "addTodo", content })} />
    </div>
  );
}

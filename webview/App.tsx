import React, { useReducer, useMemo, useEffect } from "react";
import { TodoItem, Settings } from "../src/types";
import { useVsCode } from "./hooks/useVsCode";
import SearchBar from "./components/SearchBar";
import Toolbar from "./components/Toolbar";
import TodoList from "./components/TodoList";
import AddTodo from "./components/AddTodo";

interface State {
  todos: TodoItem[];
  settings: Settings;
  search: string;
}

type Action =
  | { type: "SET_STATE"; todos: TodoItem[]; settings: Settings }
  | { type: "SET_SEARCH"; search: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_STATE":
      return { ...state, todos: action.todos, settings: action.settings };
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
  });

  const { send } = useVsCode((todos, settings) => {
    dispatch({ type: "SET_STATE", todos, settings });
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
          onClearCompleted={() => send({ type: "clearCompleted" })}
          onToggleHideCompleted={() =>
            send({
              type: "updateSettings",
              settings: { hideCompleted: !state.settings.hideCompleted },
            })
          }
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

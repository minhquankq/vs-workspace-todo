import React, { useRef, useEffect } from "react";
import Sortable from "sortablejs";
import { TodoItem } from "../../src/types";
import TodoItemView from "./TodoItem";

interface Props {
  todos: TodoItem[];
  onUpdate: (id: string, content?: string, completed?: boolean) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

export default function TodoList({
  todos,
  onUpdate,
  onDelete,
  onReorder,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);
  // Keep ref up to date to avoid stale closure in Sortable's onEnd
  const onReorderRef = useRef(onReorder);
  useEffect(() => { onReorderRef.current = onReorder; });

  useEffect(() => {
    if (!listRef.current) return;
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 150,
      handle: ".todo-item__drag-handle",
      ghostClass: "todo-item--ghost",
      onEnd() {
        if (!listRef.current) return;
        const ids = Array.from(
          listRef.current.querySelectorAll(".todo-item[data-id]")
        ).map((el) => (el as HTMLElement).dataset.id as string);
        onReorderRef.current(ids);
      },
    });
    return () => {
      sortableRef.current?.destroy();
    };
  }, []);

  return (
    <div className="todo-list" ref={listRef}>
      {todos.length === 0 ? (
        <div className="todo-list--empty">No todos yet. Add one below!</div>
      ) : (
        todos.map((todo) => (
          <TodoItemView
            key={todo.id}
            todo={todo}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}

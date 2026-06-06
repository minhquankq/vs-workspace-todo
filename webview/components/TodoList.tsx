import React, { useRef, useEffect } from "react";
import Sortable from "sortablejs";
import { TodoItem } from "../../src/types";
import TodoItemView from "./TodoItem";
import Icon from "./Icon";

interface Props {
  todos: TodoItem[];
  search: string;
  onUpdate: (id: string, content?: string, completed?: boolean) => void;
  onEdit: (todo: TodoItem) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

export default function TodoList({ todos, search, onUpdate, onEdit, onDelete, onReorder }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const sortableRef = useRef<Sortable | null>(null);
  const onReorderRef = useRef(onReorder);
  useEffect(() => { onReorderRef.current = onReorder; });

  useEffect(() => {
    if (!listRef.current) return;
    sortableRef.current = Sortable.create(listRef.current, {
      animation: 150,
      handle: ".grip",
      ghostClass: "dragging",
      onEnd() {
        if (!listRef.current) return;
        const ids = Array.from(
          listRef.current.querySelectorAll(".todo[data-id]")
        ).map((el) => (el as HTMLElement).dataset.id as string);
        onReorderRef.current(ids);
      },
    });
    return () => { sortableRef.current?.destroy(); };
  }, []);

  return (
    <div ref={listRef}>
      {todos.length === 0 ? (
        <div className="empty">
          <div className="empty-ic">
            <Icon name="check" size={22} />
          </div>
          <div className="empty-t">{search ? "No matching todos" : "All clear"}</div>
          <div className="empty-s">
            {search ? "Try a different search." : "Add your first todo below."}
          </div>
        </div>
      ) : (
        todos.map((todo) => (
          <TodoItemView
            key={todo.id}
            todo={todo}
            onToggle={(id) => onUpdate(id, undefined, !todo.completed)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}

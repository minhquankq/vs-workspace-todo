import React, { useMemo, useState } from "react";
import { TodoItem } from "../../src/types";
import Icon from "./Icon";
import { marked } from "marked";

interface Props {
  todo: TodoItem;
  onToggle: (id: string) => void;
  onEdit: (todo: TodoItem) => void;
  onDelete: (id: string) => void;
}

export default function TodoItemView({
  todo,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const [hover, setHover] = useState(false);
  const done = todo.completed;
  const renderedHtml = marked.parse(todo.content);

  return (
    <div
      className={"todo" + (done ? " done" : "")}
      data-id={todo.id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className={"grip" + (hover ? " show" : "")} title="Drag to reorder">
        <Icon name="grip" size={16} />
      </div>

      <button
        className="cbox"
        role="checkbox"
        aria-checked={done}
        onClick={() => onToggle(todo.id)}
        title={done ? "Mark incomplete" : "Mark complete"}
      >
        {done && <Icon name="check" size={12} />}
      </button>

      <div className="todo-body" onClick={() => onEdit(todo)}>
        <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
      </div>

      <button
        className="row-del"
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(todo.id);
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

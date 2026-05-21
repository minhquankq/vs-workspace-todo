import React, { useState, useRef, useEffect } from "react";
import { marked } from "marked";
import { TodoItem } from "../../src/types";
import { useMarkdownShortcuts } from "../hooks/useMarkdownShortcuts";

marked.setOptions({ breaks: true });

interface Props {
  todo: TodoItem;
  onUpdate: (id: string, content?: string, completed?: boolean) => void;
  onDelete: (id: string) => void;
}

export default function TodoItemView({ todo, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(todo.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { handleShortcut } = useMarkdownShortcuts(editValue, setEditValue, textareaRef);

  useEffect(() => {
    if (editing) {
      setEditValue(todo.content);
      // focus at end
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
  }, [editing, todo.content]);

  function handleCheckChange(checked: boolean) {
    onUpdate(todo.id, undefined, checked);
  }

  function handleSave() {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    onUpdate(todo.id, trimmed, undefined);
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
    setEditValue(todo.content);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (handleShortcut(e)) return;
    if (e.key === "Enter" && (e.metaKey || e.altKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      handleCancel();
    }
  }

  const isCompleted = todo.completed;
  const renderedHtml = marked.parse(todo.content) as string;

  return (
    <div
      className={`todo-item${isCompleted ? " todo-item--completed" : ""}${editing ? " todo-item--editing" : ""}`}
      data-id={todo.id}
    >
      {editing ? (
        <div className="todo-item__edit">
          <textarea
            ref={textareaRef}
            className="todo-item__edit-textarea"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={4}
          />
          <div className="todo-item__edit-actions">
            <button className="btn btn--secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={!editValue.trim()}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="todo-item__view">
          <div className="todo-item__drag-handle" title="Drag to reorder">
            ⠿
          </div>
          <label className="todo-item__checkbox-wrapper">
            <input
              type="checkbox"
              className="todo-item__checkbox-input"
              checked={isCompleted}
              onChange={(e) => handleCheckChange(e.target.checked)}
            />
            <span className="todo-item__checkbox-box">
              {isCompleted && (
                <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <polyline points="2,6 5,9 10,3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
          </label>
          <div
            className="todo-item__content"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
            onClick={() => setEditing(true)}
            title="Click to edit"
          />
          <button
            className="todo-item__delete"
            onClick={() => onDelete(todo.id)}
            title="Delete"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

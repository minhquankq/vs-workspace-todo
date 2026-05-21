import React, { useRef, useState } from "react";
import { useMarkdownShortcuts } from "../hooks/useMarkdownShortcuts";

interface Props {
  onAdd: (content: string) => void;
}

const isMac = /mac/i.test(navigator.platform);

export default function AddTodo({ onAdd }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { handleShortcut } = useMarkdownShortcuts(value, setValue, textareaRef);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (handleShortcut(e)) return;
    if (e.key === "Enter" && (e.metaKey || e.altKey)) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }

  return (
    <div className="add-todo">
      <div className="add-todo__card">
        <textarea
          ref={textareaRef}
          className="add-todo__textarea"
          placeholder="Add a todo… markdown supported ✨"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <div className="add-todo__footer">
          <span className="add-todo__hint">{isMac ? "⌘↵" : "Alt↵"} to add</span>
          <button
            className="add-todo__btn"
            onClick={submit}
            disabled={!value.trim()}
            title="Add todo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

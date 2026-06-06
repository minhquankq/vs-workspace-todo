import React, { useState, useRef, useEffect } from "react";
import { TodoItem } from "../../src/types";
import { useMarkdownShortcuts } from "../hooks/useMarkdownShortcuts";
import Icon from "./Icon";

interface Props {
  todo: TodoItem;
  onClose: () => void;
  onSave: (content: string) => void;
}

export default function EditDialog({ todo, onClose, onSave }: Props) {
  const [value, setValue] = useState(todo.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { handleShortcut } = useMarkdownShortcuts(value, setValue, ref);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (handleShortcut(e)) return;
    if ((e.metaKey || e.altKey) && e.key === "Enter") {
      e.preventDefault();
      onSave(value.trim());
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="overlay">
      <div className="ov-head">
        <button className="back" onClick={onClose} title="Back">
          <Icon name="chevron" size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
        <span>Edit todo</span>
      </div>
      <div className="ov-body">
        <textarea
          ref={ref}
          className="edit-ta"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <div className="ov-note">⌘↵ to save · Esc to cancel · markdown supported</div>
      </div>
      <div className="ov-foot">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={() => onSave(value.trim())}
          disabled={!value.trim()}
        >
          Save
        </button>
      </div>
    </div>
  );
}

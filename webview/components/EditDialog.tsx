import React, { useState } from "react";
import { TodoItem } from "../../src/types";
import TodoEditor from "./TodoEditor";
import Icon from "./Icon";

interface Props {
  todo: TodoItem;
  onClose: () => void;
  onSave: (content: string) => void;
}

export default function EditDialog({ todo, onClose, onSave }: Props) {
  const [value, setValue] = useState(todo.content);

  function handleSave() {
    onSave(value.trim());
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
        <TodoEditor
          value={value}
          onChange={setValue}
          onSubmit={handleSave}
          onCancel={onClose}
          textareaClassName="edit-ta"
          autoFocus
        />
        <div className="ov-note">⌘↵ to save · Esc to cancel · markdown supported</div>
      </div>
      <div className="ov-foot">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={!value.trim()}
        >
          Save
        </button>
      </div>
    </div>
  );
}

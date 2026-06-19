import React, { useRef, useState } from "react";
import TodoEditor from "./TodoEditor";
import Icon from "./Icon";

interface Props {
  onAdd: (content: string) => void;
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

export default function AddTodo({ onAdd }: Props) {
  const [value, setValue] = useState("");
  const [focus, setFocus] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
    editorRef.current?.focus();
  }

  return (
    <div className={"addbar" + (focus ? " focus" : "")}>
      <TodoEditor
        ref={editorRef}
        value={value}
        onChange={setValue}
        onSubmit={submit}
        placeholder="Add a todo…  markdown supported"
        maxHeight={160}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      />
      <div className="add-foot">
        <span className="hint">{isMac ? "⌘↵" : "Alt↵"} to add</span>
        <button
          className={"send" + (value.trim() ? " on" : "")}
          onClick={submit}
          title="Add todo"
        >
          <Icon name="send" size={15} />
        </button>
      </div>
    </div>
  );
}

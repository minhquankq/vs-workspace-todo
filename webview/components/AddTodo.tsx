import React, { useRef, useState, useEffect } from "react";
import { useMarkdownShortcuts } from "../hooks/useMarkdownShortcuts";
import Icon from "./Icon";

interface Props {
  onAdd: (content: string) => void;
}

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

function wrapSelection(
  ta: HTMLTextAreaElement,
  value: string,
  setValue: (v: string) => void,
  before: string,
  after: string = before
) {
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const sel = value.slice(s, e);
  const next = value.slice(0, s) + before + sel + after + value.slice(e);
  setValue(next);
  requestAnimationFrame(() => {
    ta.focus();
    ta.selectionStart = s + before.length;
    ta.selectionEnd = e + before.length;
  });
}

export default function AddTodo({ onAdd }: Props) {
  const [value, setValue] = useState("");
  const [focus, setFocus] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { handleShortcut } = useMarkdownShortcuts(value, setValue, textareaRef);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (handleShortcut(e)) return;
    if (e.key === "Enter" && (e.metaKey || e.altKey)) {
      e.preventDefault();
      submit();
    }
  }

  function handleFormat(e: React.MouseEvent, before: string, after: string = before) {
    e.preventDefault();
    if (textareaRef.current) {
      wrapSelection(textareaRef.current, value, setValue, before, after);
    }
  }

  return (
    <div className={"addbar" + (focus ? " focus" : "")}>
      <div className="add-tools">
        <button onMouseDown={(e) => handleFormat(e, "**")} title="Bold (⌘B)">
          <Icon name="bold" size={14} />
        </button>
        <button onMouseDown={(e) => handleFormat(e, "*")} title="Italic (⌘I)">
          <Icon name="italic" size={14} />
        </button>
        <button onMouseDown={(e) => handleFormat(e, "<u>", "</u>")} title="Underline (⌘U)">
          <Icon name="underline" size={14} />
        </button>
        <button onMouseDown={(e) => handleFormat(e, "~~")} title="Strikethrough">
          <Icon name="strikethrough" size={14} />
        </button>
        <button onMouseDown={(e) => handleFormat(e, "`")} title="Code">
          <Icon name="code" size={14} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder="Add a todo…  markdown supported"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
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

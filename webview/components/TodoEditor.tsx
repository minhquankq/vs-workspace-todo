import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useMarkdownShortcuts } from "../hooks/useMarkdownShortcuts";
import { useListEditing } from "../hooks/useListEditing";
import Icon from "./Icon";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxHeight?: number;
  textareaClassName?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

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
  setValue(value.slice(0, s) + before + sel + after + value.slice(e));
  requestAnimationFrame(() => {
    ta.focus();
    ta.selectionStart = s + before.length;
    ta.selectionEnd = e + before.length;
  });
}

const TodoEditor = forwardRef<HTMLTextAreaElement, Props>(function TodoEditor(
  { value, onChange, onSubmit, onCancel, placeholder, autoFocus, maxHeight, textareaClassName, onFocus, onBlur },
  ref
) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => internalRef.current!);
  const { handleShortcut } = useMarkdownShortcuts(value, onChange, internalRef);
  const { handleListKey } = useListEditing(value, onChange, internalRef);

  useEffect(() => {
    const el = internalRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = maxHeight ? Math.min(el.scrollHeight, maxHeight) : el.scrollHeight;
    el.style.height = next + "px";
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = internalRef.current;
    if (!el) return;
    el.focus();
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (handleShortcut(e)) return;
    if (handleListKey(e)) return;
    if ((e.metaKey || e.altKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    } else if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      onCancel();
    }
  }

  function handleFormat(e: React.MouseEvent, before: string, after: string = before) {
    e.preventDefault();
    if (internalRef.current) {
      wrapSelection(internalRef.current, value, onChange, before, after);
    }
  }

  return (
    <>
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
        <button onMouseDown={(e) => handleFormat(e, "~~")} title="Strikethrough (⌘D)">
          <Icon name="strikethrough" size={14} />
        </button>
        <button onMouseDown={(e) => handleFormat(e, "`")} title="Code">
          <Icon name="code" size={14} />
        </button>
      </div>
      <textarea
        ref={internalRef}
        className={textareaClassName}
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </>
  );
});

export default TodoEditor;

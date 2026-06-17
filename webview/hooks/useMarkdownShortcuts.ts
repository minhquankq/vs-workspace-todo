import { useLayoutEffect, useRef, RefObject } from "react";
import type { KeyboardEvent } from "react";

interface CursorSelection {
  start: number;
  end: number;
}

function applyFormat(
  value: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string
): { newValue: string; selection: CursorSelection } {
  const selected = value.substring(selStart, selEnd);
  const newValue =
    value.substring(0, selStart) + before + selected + after + value.substring(selEnd);
  return {
    newValue,
    selection: {
      start: selStart + before.length,
      end: selEnd + before.length,
    },
  };
}

/**
 * Provides Ctrl/Cmd markdown formatting shortcuts for a controlled textarea.
 *
 * Supported shortcuts:
 *   Ctrl/Cmd+B  → **bold**
 *   Ctrl/Cmd+I  → *italic*
 *   Ctrl/Cmd+U  → <u>underline</u>
 *   Ctrl/Cmd+D  → ~~strikethrough~~ (selection or current line; skips list marker)
 *
 * Usage:
 *   const { handleShortcut } = useMarkdownShortcuts(value, setValue, textareaRef);
 *   // In onKeyDown: handleShortcut(e) || handleOtherKeys(e);
 */
export function useMarkdownShortcuts(
  value: string,
  setValue: (v: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>
) {
  const pendingSelectionRef = useRef<CursorSelection | null>(null);

  // After React flushes the state update, restore cursor/selection position.
  useLayoutEffect(() => {
    if (pendingSelectionRef.current && textareaRef?.current) {
      const { start, end } = pendingSelectionRef.current;
      textareaRef.current.setSelectionRange(start, end);
      pendingSelectionRef.current = null;
    }
  });

  function handleShortcut(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return false;

    let before = "";
    let after = "";

    switch (e.key.toLowerCase()) {
      case "b":
        before = "**";
        after = "**";
        break;
      case "i":
        before = "*";
        after = "*";
        break;
      case "u":
        before = "<u>";
        after = "</u>";
        break;
      case "d": {
        e.preventDefault();
        e.stopPropagation();

        const ta = e.currentTarget as HTMLTextAreaElement;
        let strikeStart = ta.selectionStart;
        let strikeEnd = ta.selectionEnd;

        if (strikeStart === strikeEnd) {
          // No selection — operate on the current line
          const lineStart = value.lastIndexOf("\n", strikeStart - 1) + 1;
          const nextNewline = value.indexOf("\n", strikeStart);
          const lineEnd = nextNewline === -1 ? value.length : nextNewline;

          const line = value.substring(lineStart, lineEnd);
          const listMatch = line.match(/^(\s*[-*+]\s+)/);

          strikeStart = listMatch ? lineStart + listMatch[1].length : lineStart;
          strikeEnd = lineEnd;
        }

        const { newValue, selection } = applyFormat(value, strikeStart, strikeEnd, "~~", "~~");
        setValue(newValue);
        pendingSelectionRef.current = selection;
        return true;
      }
      default:
        return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const ta = e.currentTarget as HTMLTextAreaElement;
    const { newValue, selection } = applyFormat(
      value,
      ta.selectionStart,
      ta.selectionEnd,
      before,
      after
    );

    setValue(newValue);
    pendingSelectionRef.current = selection;
    return true;
  }

  return { handleShortcut };
}

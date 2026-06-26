import { useLayoutEffect, useRef, RefObject } from "react";
import type { KeyboardEvent } from "react";

// Matches: optional leading spaces, then a bullet (- * + or 1. 2. etc), then a space
const LIST_RE = /^(\s*)([-*+]|\d+\.)\s/;

export function useListEditing(
  value: string,
  setValue: (v: string) => void,
  textareaRef: RefObject<HTMLTextAreaElement | null>
) {
  const pendingPosRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingPosRef.current !== null && textareaRef?.current) {
      const pos = pendingPosRef.current;
      textareaRef.current.setSelectionRange(pos, pos);
      pendingPosRef.current = null;
    }
  });

  function handleListKey(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    const ta = e.currentTarget as HTMLTextAreaElement;
    const cursor = ta.selectionStart;
    const selEnd = ta.selectionEnd;

    const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
    const rawEnd = value.indexOf("\n", cursor);
    const lineEnd = rawEnd === -1 ? value.length : rawEnd;
    const line = value.substring(lineStart, lineEnd);
    const match = line.match(LIST_RE);

    // ── Enter: continue or exit list ─────────────────────────
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.altKey && !e.ctrlKey) {
      if (!match) return false;
      e.preventDefault();

      const [fullMarker, indent, bullet] = match;
      const lineContent = line.slice(fullMarker.length).trim();

      if (lineContent === "") {
        // Empty list item — exit or dedent
        if (indent.length >= 2) {
          // Dedent: shrink indent by 2 spaces, keep marker
          const newLine = indent.slice(2) + bullet + " ";
          const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
          setValue(newValue);
          pendingPosRef.current = lineStart + newLine.length;
        } else {
          // Top-level empty: remove marker, leave blank line
          const newValue = value.slice(0, lineStart) + value.slice(lineEnd);
          setValue(newValue);
          pendingPosRef.current = lineStart;
        }
        return true;
      }

      // Continue list on next line
      const isOrdered = /^\d+\.$/.test(bullet);
      const nextBullet = isOrdered ? `${parseInt(bullet, 10) + 1}. ` : `${bullet} `;
      const insert = "\n" + indent + nextBullet;
      const newValue = value.slice(0, cursor) + insert + value.slice(selEnd);
      setValue(newValue);
      pendingPosRef.current = cursor + insert.length;
      return true;
    }

    // ── Tab / Shift+Tab: indent / unindent list item ─────────
    if (e.key === "Tab") {
      if (!match) return false;
      e.preventDefault();

      const [, indent] = match;
      if (e.shiftKey) {
        const remove = Math.min(2, indent.length);
        if (remove === 0) return true;
        const newValue = value.slice(0, lineStart) + line.slice(remove) + value.slice(lineEnd);
        setValue(newValue);
        pendingPosRef.current = Math.max(cursor - remove, lineStart);
      } else {
        const newValue = value.slice(0, lineStart) + "  " + line + value.slice(lineEnd);
        setValue(newValue);
        pendingPosRef.current = cursor + 2;
      }
      return true;
    }

    return false;
  }

  return { handleListKey };
}

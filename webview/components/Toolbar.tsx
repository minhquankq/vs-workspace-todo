import React, { useState, useRef, useEffect } from "react";
import { Settings } from "../../src/types";

interface Props {
  settings: Settings;
  onClearCompleted: () => void;
  onToggleHideCompleted: () => void;
}

export default function Toolbar({
  settings,
  onClearCompleted,
  onToggleHideCompleted,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="toolbar">
      <div className="toolbar__actions" ref={menuRef}>
        <button
          className="toolbar__btn"
          title="More options"
          onClick={() => setMenuOpen((o) => !o)}
        >
          ···
        </button>
        {menuOpen && (
          <div className="toolbar__menu">
            <button
              className="toolbar__menu-item"
              onClick={() => {
                onClearCompleted();
                setMenuOpen(false);
              }}
              style={{ paddingLeft: 28 }}
            >
              Clear completed
            </button>
            <button
              className="toolbar__menu-item"
              onClick={() => {
                onToggleHideCompleted();
                setMenuOpen(false);
              }}
              style={{ paddingLeft: !settings.hideCompleted ? 28 : undefined }}
            >
              {settings.hideCompleted ? "✓ " : ""} Hide completed
            </button>

          </div>
        )}
      </div>
    </div>
  );
}

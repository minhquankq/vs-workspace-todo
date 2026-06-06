import React, { useState, useRef, useEffect } from "react";
import { Settings, SyncUser } from "../../src/types";
import { SyncStatus } from "../hooks/useVsCode";

interface Props {
  settings: Settings;
  user: SyncUser | null;
  syncStatus: SyncStatus;
  syncError?: string;
  onClearCompleted: () => void;
  onToggleHideCompleted: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

function SyncIcon({ status }: { status: SyncStatus }) {
  if (status === "syncing") {
    return <span className="toolbar__sync-icon toolbar__sync-icon--spinning" title="Syncing…">↻</span>;
  }
  if (status === "synced") {
    return <span className="toolbar__sync-icon toolbar__sync-icon--synced" title="Synced">✓</span>;
  }
  if (status === "offline") {
    return <span className="toolbar__sync-icon toolbar__sync-icon--offline" title="Offline">⊘</span>;
  }
  if (status === "error") {
    return <span className="toolbar__sync-icon toolbar__sync-icon--error" title="Sync error">!</span>;
  }
  return null;
}

export default function Toolbar({
  settings,
  user,
  syncStatus,
  syncError,
  onClearCompleted,
  onToggleHideCompleted,
  onSignIn,
  onSignOut,
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
      {(syncStatus === "syncing" || syncStatus === "synced" || syncStatus === "offline" || syncStatus === "error") && (
        <SyncIcon status={syncStatus} />
      )}
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
            <div className="toolbar__menu-divider" />
            {user ? (
              <>
                <div className="toolbar__menu-user">{user.email}</div>
                <button
                  className="toolbar__menu-item"
                  onClick={() => {
                    onSignOut();
                    setMenuOpen(false);
                  }}
                  style={{ paddingLeft: 28 }}
                >
                  Sign out
                  {syncError && <span className="toolbar__menu-error"> ({syncError})</span>}
                </button>
              </>
            ) : (
              <button
                className="toolbar__menu-item"
                onClick={() => {
                  onSignIn();
                  setMenuOpen(false);
                }}
                style={{ paddingLeft: 28 }}
              >
                Sign in to sync
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { Settings, SyncUser } from "../../src/types";
import { SyncStatus } from "../hooks/useVsCode";
import Icon from "./Icon";

interface Props {
  settings: Settings;
  user: SyncUser | null;
  syncStatus: SyncStatus;
  syncError?: string;
  hasPendingSync: boolean;
  onClearCompleted: () => void;
  onToggleHideCompleted: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onResetLocalData: () => void;
  onSyncNow: () => void;
}

const SYNC_STATE: Record<SyncStatus, { icon: "cloud" | "sync" | "cloud-check" | "cloud-off" | "warn"; cls: string; label: string }> = {
  idle:    { icon: "cloud",        cls: "off",     label: "Sync off" },
  syncing: { icon: "sync",         cls: "syncing", label: "Syncing…" },
  synced:  { icon: "cloud-check",  cls: "ok",      label: "Synced" },
  offline: { icon: "cloud-off",    cls: "warn",    label: "Offline" },
  error:   { icon: "warn",         cls: "err",     label: "Sync error" },
};

export default function Toolbar({
  settings,
  user,
  syncStatus,
  syncError,
  hasPendingSync,
  onClearCompleted,
  onToggleHideCompleted,
  onSignIn,
  onSignOut,
  onResetLocalData,
  onSyncNow,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menu]);

  // Reset confirm state whenever the menu closes
  useEffect(() => {
    if (!menu) setConfirmReset(false);
  }, [menu]);

  const sync = SYNC_STATE[syncStatus];
  const canSync = !!user && syncStatus !== "syncing";
  const syncTitle = !user
    ? sync.label
    : syncStatus === "idle"
      ? "Click to link workspace"
      : canSync
        ? (hasPendingSync ? "Push pending changes" : "Pull latest")
        : sync.label + (syncError ? ": " + syncError : "");

  function handleSyncClick() {
    if (!user) {
      onSignIn();
    } else if (canSync) {
      onSyncNow();
    }
  }

  return (
    <div className="p-head">
      <div className="p-title">
        <Icon name="chevron" size={14} className="caret" />
        <span>WORKSPACE TODO</span>
      </div>
      <div className="p-actions">
        <button
          className={"sync-badge " + sync.cls}
          title={syncTitle}
          onClick={handleSyncClick}
        >
          <Icon name={sync.icon} size={15} />
        </button>

        <div className="menu-wrap" ref={menuRef}>
          <button
            className={"hbtn" + (menu ? " active" : "")}
            title="More actions"
            onClick={() => setMenu((m) => !m)}
          >
            <Icon name="more" size={16} />
          </button>

          {menu && (
            <>
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <div className="menu">
                {user ? (
                  <div className="menu-acct">
                    <div className="ava">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="acct-name">{user.name ?? user.email}</div>
                      <div className="acct-sub">{user.email}</div>
                    </div>
                  </div>
                ) : (
                  <button
                    className="mi"
                    onClick={() => { setMenu(false); onSignIn(); }}
                  >
                    <Icon name="cloud" size={15} />
                    <span>Sign in to sync</span>
                  </button>
                )}

                <div className="menu-sep" />

                <button
                  className="mi"
                  onClick={() => { onToggleHideCompleted(); setMenu(false); }}
                >
                  <span className="mi-check">
                    {settings.hideCompleted && <Icon name="check" size={13} />}
                  </span>
                  <span>Hide completed</span>
                </button>

                <button
                  className="mi"
                  onClick={() => { onClearCompleted(); setMenu(false); }}
                >
                  <Icon name="trash" size={15} />
                  <span>Clear completed</span>
                </button>

                {user && (
                  <>
                    <div className="menu-sep" />
                    {confirmReset ? (
                      <div className="mi-confirm-panel">
                        <p className="mi-warn-msg">
                          Local todos will be replaced with the server copy. Any local-only changes will be lost.
                        </p>
                        <div className="mi-confirm-btns">
                          <button
                            className="mi mi-danger"
                            onClick={() => { setMenu(false); onResetLocalData(); }}
                          >
                            <Icon name="warn" size={14} />
                            <span>Reset &amp; re-sync</span>
                          </button>
                          <button className="mi" onClick={() => setConfirmReset(false)}>
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="mi mi-danger"
                        onClick={() => setConfirmReset(true)}
                      >
                        <Icon name="warn" size={15} />
                        <span>Reset local data…</span>
                      </button>
                    )}
                    <div className="menu-sep" />
                    <button
                      className="mi"
                      onClick={() => { setMenu(false); onSignOut(); }}
                    >
                      <Icon name="close" size={15} />
                      <span>Sign out</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

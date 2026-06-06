import React, { useState, useRef, useEffect } from "react";
import { Settings, SyncUser } from "../../src/types";
import { SyncStatus } from "../hooks/useVsCode";
import Icon from "./Icon";

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
  onClearCompleted,
  onToggleHideCompleted,
  onSignIn,
  onSignOut,
}: Props) {
  const [menu, setMenu] = useState(false);
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

  const sync = SYNC_STATE[syncStatus];

  return (
    <div className="p-head">
      <div className="p-title">
        <Icon name="chevron" size={14} className="caret" />
        <span>WORKSPACE TODO</span>
      </div>
      <div className="p-actions">
        <button
          className={"sync-badge " + sync.cls}
          title={sync.label + (syncError ? ": " + syncError : "")}
          onClick={user ? undefined : onSignIn}
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

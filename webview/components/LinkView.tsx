import React, { useState } from "react";
import { WorkspaceInfo } from "../../src/types";
import Icon from "./Icon";

interface Props {
  workspaces: WorkspaceInfo[];
  defaultName: string;
  error?: string;
  onBack: () => void;
  onLink: (workspaceId: string, workspaceName: string) => void;
  onCreate: (name: string) => void;
}

type Mode = "pick" | "new";

export default function LinkView({ workspaces, defaultName, error, onBack, onLink, onCreate }: Props) {
  const initialMode: Mode = workspaces.length === 0 ? "new" : "pick";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState(defaultName);
  const [busy, setBusy] = useState(false);

  const canConfirm = mode === "pick" ? selectedId !== null : newName.trim().length > 0;

  async function handleConfirm() {
    if (!canConfirm || busy) return;
    setBusy(true);
    if (mode === "pick") {
      const ws = workspaces.find((w) => w.id === selectedId)!;
      onLink(ws.id, ws.name);
    } else {
      onCreate(newName.trim());
    }
  }

  return (
    <div className="overlay">
      <div className="ov-head">
        <button className="back" onClick={onBack} title="Back">
          <Icon name="chevron" size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
        <span>Link this workspace</span>
      </div>

      <div className="ov-body">
        <div className="seg">
          <button
            className={mode === "pick" ? "on" : ""}
            onClick={() => setMode("pick")}
            disabled={workspaces.length === 0}
          >
            Use existing
          </button>
          <button
            className={mode === "new" ? "on" : ""}
            onClick={() => setMode("new")}
          >
            Create new
          </button>
        </div>

        {mode === "pick" ? (
          <div className="ws-list">
            <div className="ov-label">Your synced workspaces</div>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                className={"ws-row" + (selectedId === ws.id ? " sel" : "")}
                onClick={() => setSelectedId(ws.id)}
              >
                <div className="ws-ic">
                  <Icon name="folder" size={16} />
                </div>
                <div className="ws-meta">
                  <div className="ws-name">{ws.name}</div>
                  <div className="ws-sub">{ws.todoCount} todo{ws.todoCount !== 1 ? "s" : ""}</div>
                </div>
                {selectedId === ws.id && (
                  <div className="ws-check">
                    <Icon name="check" size={12} />
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="ws-new">
            <div className="ov-label">Workspace name</div>
            <input
              className="ti"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. my-project"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirm) handleConfirm();
              }}
            />
            <div className="ov-note">
              Pre-filled from this folder. Your local todos will be uploaded as the starting point.
            </div>
          </div>
        )}

        {error && <div className="ov-error">{error}</div>}
      </div>

      <div className="ov-foot">
        <button
          className="btn-primary"
          disabled={!canConfirm || busy}
          onClick={handleConfirm}
        >
          {busy ? "Linking…" : mode === "pick" ? "Link workspace" : "Create & link"}
        </button>
      </div>
    </div>
  );
}

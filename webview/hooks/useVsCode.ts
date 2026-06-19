import { TodoItem, Settings, WebviewMessage, ExtensionMessage, SyncUser, WorkspaceInfo } from "../../src/types";
import { useEffect, useRef, useCallback, useState } from "react";

// Acquire the VS Code API once and cache it
declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null;
function getVsCodeApi() {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

export interface LinkViewPayload {
  workspaces: WorkspaceInfo[];
  defaultName: string;
}

export function useVsCode(
  onState: (todos: TodoItem[], settings: Settings, user?: SyncUser | null, hasPendingSync?: boolean) => void,
  onLinkView?: (payload: LinkViewPayload) => void,
  onLinkViewError?: (error: string) => void
) {
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const onLinkViewRef = useRef(onLinkView);
  onLinkViewRef.current = onLinkView;
  const onLinkViewErrorRef = useRef(onLinkViewError);
  onLinkViewErrorRef.current = onLinkViewError;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | undefined>();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      if (msg.type === "setState") {
        onStateRef.current(msg.todos, msg.settings, msg.user, msg.hasPendingSync);
      } else if (msg.type === "syncStatus") {
        setSyncStatus(msg.status);
        setSyncError(msg.error);
      } else if (msg.type === "showLinkView") {
        onLinkViewRef.current?.({ workspaces: msg.workspaces, defaultName: msg.defaultName });
      } else if (msg.type === "linkViewError") {
        onLinkViewErrorRef.current?.(msg.error);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const send = useCallback((message: WebviewMessage) => {
    getVsCodeApi().postMessage(message);
  }, []);

  return { send, syncStatus, syncError };
}

import { TodoItem, Settings, WebviewMessage, ExtensionMessage } from "../../src/types";
import { useEffect, useRef, useCallback } from "react";

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

export function useVsCode(
  onState: (todos: TodoItem[], settings: Settings) => void
) {
  const onStateRef = useRef(onState);
  onStateRef.current = onState;

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      if (msg.type === "setState") {
        onStateRef.current(msg.todos, msg.settings);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const send = useCallback((message: WebviewMessage) => {
    getVsCodeApi().postMessage(message);
  }, []);

  return { send };
}

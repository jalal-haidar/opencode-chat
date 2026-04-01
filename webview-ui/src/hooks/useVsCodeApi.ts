import type { WebviewMessage } from "@shared/protocol";

// acquireVsCodeApi() is injected by VS Code into the webview at runtime.
// It must be called exactly once, so we capture it at module load time.
declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const api = acquireVsCodeApi();

export function postMessage(msg: WebviewMessage): void {
  api.postMessage(msg);
}

import * as vscode from "vscode";
import * as path from "node:path";
import type { OpenCodeServer } from "./server";

/* ------------------------------------------------------------------ */
/*  Types mirrored from the OpenCode SDK (kept minimal)               */
/* ------------------------------------------------------------------ */

interface SessionInfo {
  id: string;
  title: string;
  time: { created: number; updated: number };
}

interface MessageInfo {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: { created: number; completed?: number };
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number };
  error?: { type: string; message?: string };
}

interface PartInfo {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  tool?: string;
  state?: string;
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Internal extension-host state                                     */
/* ------------------------------------------------------------------ */

interface ChatState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  messages: Map<string, MessageInfo>;
  parts: Map<string, PartInfo[]>;
  messageOrder: string[];
  providers: unknown[];
  agents: unknown[];
  isBusy: boolean;
}

/* ------------------------------------------------------------------ */
/*  ChatViewProvider                                                   */
/* ------------------------------------------------------------------ */

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private client: any = null;
  private sseAbort?: AbortController;
  private state: ChatState = {
    sessions: [],
    activeSessionId: null,
    messages: new Map(),
    parts: new Map(),
    messageOrder: [],
    providers: [],
    agents: [],
    isBusy: false,
  };

  constructor(
    private ctx: vscode.ExtensionContext,
    private server: OpenCodeServer,
    private workspaceDir: string,
  ) {}

  /* ----- vscode.WebviewViewProvider ----- */

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.ctx.extensionPath, "dist", "webview")),
        vscode.Uri.file(path.join(this.ctx.extensionPath, "media")),
      ],
    };
    view.webview.html = this.buildHtml(view.webview);
    view.webview.onDidReceiveMessage((m) => this.onWebviewMessage(m));

    // Forward server status
    this.server.onStatus((s) => {
      this.post({ type: "server-status", status: s });
      if (s.state === "running" && !this.client) this.initClient();
    });
    if (this.server.status.state === "running") this.initClient();
  }

  /* ----- Public commands ----- */

  async newSession() {
    if (!this.client) return;
    try {
      const { data } = await this.client.session.create({
        directory: this.workspaceDir,
      });
      this.state.activeSessionId = data.id;
      this.state.messages.clear();
      this.state.parts.clear();
      this.state.messageOrder = [];
      this.post({ type: "clear" });
      this.post({ type: "active-session", session: data });
      await this.loadSessions();
    } catch (e: any) {
      this.postError(e);
    }
  }

  async abort() {
    if (!this.client || !this.state.activeSessionId) return;
    try {
      await this.client.session.abort({
        sessionID: this.state.activeSessionId,
        directory: this.workspaceDir,
      });
    } catch {}
    this.state.isBusy = false;
    this.post({ type: "busy", busy: false });
  }

  addContext(text: string) {
    this.post({ type: "add-context", text });
  }

  /* ----- Client init ----- */

  private async initClient() {
    try {
      const sdk = await import("@opencode-ai/sdk/v2/client");
      const { createOpencodeClient } = sdk;
      this.client = createOpencodeClient({
        baseUrl: this.server.url,
        directory: this.workspaceDir,
      });
      await this.loadSessions();
      await this.loadModels();
      this.startSSE();
    } catch (e: any) {
      console.error("[OpenCode Chat] SDK init failed:", e);
    }
  }

  /* ----- Data loading ----- */

  private async loadSessions() {
    if (!this.client) return;
    try {
      const { data } = await this.client.session.list({
        directory: this.workspaceDir,
        limit: 50,
      });
      this.state.sessions = data ?? [];
      this.post({ type: "sessions", sessions: this.state.sessions });
    } catch {}
  }

  private async loadModels() {
    if (!this.client) return;
    try {
      const [provRes, agentRes] = await Promise.all([
        this.client.provider.list({ directory: this.workspaceDir }),
        this.client.app.agents({ directory: this.workspaceDir }),
      ]);
      this.state.providers = provRes.data ?? [];
      this.state.agents = agentRes.data ?? [];
      this.post({ type: "providers", providers: this.state.providers });
      this.post({ type: "agents", agents: this.state.agents });
    } catch {}
  }

  private async loadMessages(sessionId: string) {
    if (!this.client) return;
    try {
      const { data } = await this.client.session.messages({
        sessionID: sessionId,
        directory: this.workspaceDir,
        limit: 200,
      });
      // data is { messages: Message[], parts: Record<string, Part[]> }
      this.state.messages.clear();
      this.state.parts.clear();
      this.state.messageOrder = [];

      const msgs: MessageInfo[] = data?.messages ?? data ?? [];
      const parts: Record<string, PartInfo[]> = data?.parts ?? {};

      for (const m of msgs) {
        this.state.messages.set(m.id, m);
        this.state.messageOrder.push(m.id);
      }
      for (const [mid, ps] of Object.entries(parts)) {
        this.state.parts.set(mid, ps);
      }

      this.post({
        type: "messages",
        messages: msgs,
        parts,
        sessionId,
      });
    } catch (e: any) {
      this.postError(e);
    }
  }

  /* ----- SSE ----- */

  private startSSE() {
    if (!this.client) return;
    this.sseAbort?.abort();
    this.sseAbort = new AbortController();
    const signal = this.sseAbort.signal;

    (async () => {
      try {
        const result = await this.client.event.subscribe({
          directory: this.workspaceDir,
          signal,
          sseMaxRetryAttempts: 1,
          onSseError: () => {},
        });
        const stream = result.stream ?? result;
        for await (const event of stream) {
          if (signal.aborted) break;
          const payload = event.properties ? event : event.payload;
          if (payload) this.handleSSEEvent(payload);
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("[OpenCode Chat] SSE error:", err);
          setTimeout(() => this.startSSE(), 3000);
        }
      }
    })();
  }

  private handleSSEEvent(event: any) {
    const type: string = event.type ?? "";
    const props = event.properties ?? event;

    switch (type) {
      case "message.updated": {
        const msg: MessageInfo = props.message ?? props;
        if (!msg?.id) break;
        // Only handle events for active session
        if (msg.sessionID !== this.state.activeSessionId) break;
        this.state.messages.set(msg.id, msg);
        if (!this.state.messageOrder.includes(msg.id)) {
          this.state.messageOrder.push(msg.id);
        }
        this.post({ type: "message-update", message: msg });
        break;
      }

      case "message.part.updated": {
        const part: PartInfo = props.part ?? props;
        if (!part?.id || !part?.messageID) break;
        if (part.sessionID !== this.state.activeSessionId) break;

        const existing = this.state.parts.get(part.messageID) ?? [];
        const idx = existing.findIndex((p) => p.id === part.id);
        if (idx >= 0) existing[idx] = part;
        else existing.push(part);
        this.state.parts.set(part.messageID, existing);

        this.post({ type: "part-update", part });
        break;
      }

      case "session.updated": {
        const session = props.session ?? props;
        if (session) this.loadSessions();
        break;
      }

      case "session.idle": {
        const sid = props.sessionID ?? props.id;
        if (sid === this.state.activeSessionId) {
          this.state.isBusy = false;
          this.post({ type: "busy", busy: false });
        }
        break;
      }

      case "permission.updated": {
        const perm = props.permission ?? props;
        if (perm) this.post({ type: "permission", permission: perm });
        break;
      }

      default:
        break;
    }
  }

  /* ----- Webview message handler ----- */

  private async onWebviewMessage(msg: any) {
    switch (msg.type) {
      case "ready":
        this.post({
          type: "server-status",
          status: this.server.status,
        });
        if (this.client) {
          await this.loadSessions();
          await this.loadModels();
        }
        break;

      case "send": {
        if (!this.client) return;
        let sid = this.state.activeSessionId;
        if (!sid) {
          try {
            const { data } = await this.client.session.create({
              directory: this.workspaceDir,
            });
            sid = data.id;
            this.state.activeSessionId = sid;
            this.post({ type: "active-session", session: data });
          } catch (e: any) {
            this.postError(e);
            return;
          }
        }

        this.state.isBusy = true;
        this.post({ type: "busy", busy: true });

        // Show user message immediately (optimistic)
        const userMsg: MessageInfo = {
          id: `temp-${Date.now()}`,
          sessionID: sid!,
          role: "user",
          time: { created: Date.now() / 1000 },
        };
        this.post({ type: "message-update", message: userMsg });
        this.post({
          type: "part-update",
          part: {
            id: `temp-part-${Date.now()}`,
            sessionID: sid!,
            messageID: userMsg.id,
            type: "text",
            text: msg.text,
          },
        });

        try {
          const parts: any[] = [{ type: "text", text: msg.text }];
          if (msg.images?.length) {
            for (const img of msg.images) {
              parts.push({ type: "file", mime: "image/png", url: img });
            }
          }
          await this.client.session.promptAsync({
            sessionID: sid!,
            directory: this.workspaceDir,
            parts,
            ...(msg.model ? { model: msg.model } : {}),
            ...(msg.agent ? { agent: msg.agent } : {}),
          });
        } catch (e: any) {
          this.state.isBusy = false;
          this.post({ type: "busy", busy: false });
          this.postError(e);
        }
        break;
      }

      case "select-session":
        this.state.activeSessionId = msg.sessionId;
        await this.loadMessages(msg.sessionId);
        break;

      case "new-session":
        await this.newSession();
        break;

      case "abort":
        await this.abort();
        break;

      case "permission-respond":
        if (!this.client) return;
        try {
          await this.client.permission.respond({
            sessionID: msg.sessionId,
            permissionID: msg.permissionId,
            directory: this.workspaceDir,
            response: msg.response,
          });
        } catch {}
        break;
    }
  }

  /* ----- Helpers ----- */

  private post(msg: unknown) {
    this.view?.webview.postMessage(msg);
  }

  private postError(e: any) {
    this.post({
      type: "error",
      message: e?.message ?? String(e),
    });
  }

  /* ----- HTML generation ----- */

  private buildHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.ctx.extensionPath, "dist", "webview", "styles.css"),
      ),
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this.ctx.extensionPath, "dist", "webview", "main.js"),
      ),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';
                 font-src ${webview.cspSource};
                 img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>OpenCode Chat</title>
</head>
<body>
  <div id="app">
    <header id="header">
      <select id="session-select" aria-label="Session">
        <option value="">New Chat</option>
      </select>
      <button id="new-chat-btn" title="New Chat" aria-label="New Chat">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1v6H2v2h6v6h2V9h6V7H10V1z"/>
        </svg>
      </button>
    </header>

    <main id="messages" role="log" aria-live="polite"></main>

    <footer id="input-area">
      <div id="context-bar" style="display:none"></div>
      <div id="input-row">
        <textarea id="prompt-input"
                  name="prompt"
                  placeholder="Ask anything…"
                  rows="1"
                  aria-label="Chat prompt"></textarea>
        <button id="send-btn" title="Send" aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1.91L7.37 8 1 14.09 1.91 15 9 8 1.91 1z"/>
          </svg>
        </button>
        <button id="abort-btn" title="Stop" aria-label="Stop generation" style="display:none">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1"/>
          </svg>
        </button>
      </div>
      <div id="selectors">
        <select id="model-select" aria-label="Model">
          <option value="">Default model</option>
        </select>
        <select id="agent-select" aria-label="Agent">
          <option value="">Default agent</option>
        </select>
      </div>
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose() {
    this.sseAbort?.abort();
  }
}

function getNonce(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

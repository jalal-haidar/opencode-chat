import * as vscode from "vscode";
import * as path from "node:path";
import type { OpenCodeServer } from "./server";
import type {
  HostMessage,
  WebviewMessage,
  SessionInfo,
  MessageInfo,
  PartInfo,
} from "./shared/protocol";

/* ------------------------------------------------------------------ */
/*  Internal extension-host state                                     */
/* ------------------------------------------------------------------ */

import type { ProviderInfo, AgentInfo } from "./shared/protocol";

interface ChatState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  messages: Map<string, MessageInfo>;
  parts: Map<string, PartInfo[]>;
  messageOrder: string[];
  providers: ProviderInfo[];
  agents: Record<string, AgentInfo>;
  isBusy: boolean;
}

/* ------------------------------------------------------------------ */
/*  ChatViewProvider                                                   */
/* ------------------------------------------------------------------ */

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private client: any = null;
  private sseAbort?: AbortController;
  /** Tracks the temp optimistic message ID so SSE can replace it */
  private pendingUserMsgId?: string;
  private state: ChatState = {
    sessions: [],
    activeSessionId: null,
    messages: new Map(),
    parts: new Map(),
    messageOrder: [],
    providers: [],
    agents: {},
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
    view.webview.onDidReceiveMessage((m) =>
      this.onWebviewMessage(m as WebviewMessage),
    );

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
      const { createOpencodeClient } =
        await import("@opencode-ai/sdk/v2/client");
      this.client = createOpencodeClient({ baseUrl: this.server.url });
      await this.loadSessions();
      await this.loadModels();
      this.startSSE();
    } catch (e: any) {
      console.error("[OpenCode Chat] SDK init failed:", e);
      this.postError({
        message: `Failed to connect to OpenCode server: ${e?.message}`,
      });
    }
  }

  /* ----- Data loading ----- */

  private async loadSessions() {
    if (!this.client) return;
    try {
      const { data } = await this.client.session.list({
        directory: this.workspaceDir,
      });
      this.state.sessions = (data as SessionInfo[]) ?? [];
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
      // provider.list returns { all: Provider[] }
      const provData = provRes.data as any;
      this.state.providers = (provData?.all ??
        provData ??
        []) as ProviderInfo[];
      // app.agents returns Agent[] — convert to Record<id, AgentInfo>
      const agentArr: any[] = (agentRes.data as any) ?? [];
      this.state.agents = Array.isArray(agentArr)
        ? Object.fromEntries(agentArr.map((a: any) => [a.name ?? a.id, a]))
        : agentArr;
      this.post({ type: "providers", providers: this.state.providers });
      this.post({ type: "agents", agents: this.state.agents });
    } catch (e: any) {
      console.error("[OpenCode Chat] loadModels failed:", e);
    }
  }

  private async loadMessages(sessionId: string) {
    if (!this.client) return;
    try {
      const { data } = await this.client.session.messages({
        sessionID: sessionId,
        directory: this.workspaceDir,
        limit: 200,
      });
      // API returns Array<{ info: Message, parts: Part[] }>
      this.state.messages.clear();
      this.state.parts.clear();
      this.state.messageOrder = [];

      const rawItems: any[] = (data as any) ?? [];
      const msgs: MessageInfo[] = [];
      const parts: Record<string, PartInfo[]> = {};

      for (const item of rawItems) {
        const m: MessageInfo = item.info ?? item;
        const ps: PartInfo[] = item.parts ?? [];
        msgs.push(m);
        this.state.messages.set(m.id, m);
        this.state.messageOrder.push(m.id);
        this.state.parts.set(m.id, ps);
        parts[m.id] = ps;
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
        const result = await this.client.event.subscribe(
          { directory: this.workspaceDir },
          { signal } as any,
        );
        for await (const event of result.stream) {
          if (signal.aborted) break;
          this.handleSSEEvent(event);
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
        const msg: MessageInfo = props.info ?? props.message ?? props;
        if (!msg?.id) break;
        if (msg.sessionID !== this.state.activeSessionId) break;

        // If this is the real user message replacing our optimistic one, remove the temp
        if (msg.role === "user" && this.pendingUserMsgId) {
          const tempId = this.pendingUserMsgId;
          this.pendingUserMsgId = undefined;
          this.state.messages.delete(tempId);
          this.state.parts.delete(tempId);
          this.state.messageOrder = this.state.messageOrder.filter(
            (id) => id !== tempId,
          );
          // Tell webview to replace with fresh message list
          this.post({
            type: "message-update",
            message: msg,
            replaceId: tempId,
          } as any);
        } else {
          this.post({ type: "message-update", message: msg });
        }

        this.state.messages.set(msg.id, msg);
        if (!this.state.messageOrder.includes(msg.id)) {
          this.state.messageOrder.push(msg.id);
        }
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

      case "permission.asked": {
        const perm = props.permission ?? props;
        if (perm) this.post({ type: "permission", permission: perm });
        break;
      }

      default:
        break;
    }
  }

  /* ----- Webview message handler ----- */

  private async onWebviewMessage(msg: WebviewMessage) {
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
        if (!this.client) {
          this.postError({
            message:
              "OpenCode server is not ready yet. Please wait a moment and try again.",
          });
          return;
        }
        let sid = this.state.activeSessionId;
        if (!sid) {
          try {
            const res = await this.client.session.create({
              directory: this.workspaceDir,
            });
            const data = res.data;
            sid = data?.id;
            if (!sid) {
              this.postError({
                message: "Failed to create session — no session ID returned.",
              });
              return;
            }
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
        this.pendingUserMsgId = userMsg.id;
        this.state.messages.set(userMsg.id, userMsg);
        this.state.messageOrder.push(userMsg.id);
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
          this.pendingUserMsgId = undefined;
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

  private post(msg: HostMessage) {
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
    const cacheBust = Date.now();

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
  <link href="${styleUri}?v=${cacheBust}" rel="stylesheet">
  <title>OpenCode Chat</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}?v=${cacheBust}"></script>
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

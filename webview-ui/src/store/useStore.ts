import { create } from "zustand";
import type {
  HostMessage,
  SessionInfo,
  MessageInfo,
  PartInfo,
  ProviderInfo,
  AgentInfo,
  PermissionInfo,
  ModelRef,
  ServerStatus,
} from "@shared/protocol";

interface StatusMessage {
  id: string;
  text: string;
  isError: boolean;
}

interface StoreState {
  serverStatus: ServerStatus;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  messages: Record<string, MessageInfo>;
  parts: Record<string, PartInfo[]>;
  messageOrder: string[];
  providers: ProviderInfo[];
  agents: Record<string, AgentInfo>;
  selectedModel: ModelRef | undefined;
  selectedAgent: string | undefined;
  isBusy: boolean;
  pendingContext: string;
  pendingPermissions: PermissionInfo[];
  statusMessages: StatusMessage[];

  // Actions
  handleHostMessage: (msg: HostMessage) => void;
  setSelectedModel: (model: ModelRef | undefined) => void;
  setSelectedAgent: (agent: string | undefined) => void;
  appendPendingContext: (text: string) => void;
  clearPendingContext: () => void;
  dismissPermission: (permissionId: string) => void;
  addStatus: (text: string, isError?: boolean) => void;
}

let _statusCounter = 0;

export const useStore = create<StoreState>((set, get) => ({
  serverStatus: { state: "idle", port: 0 },
  sessions: [],
  activeSessionId: null,
  messages: {},
  parts: {},
  messageOrder: [],
  providers: [],
  agents: {},
  selectedModel: undefined,
  selectedAgent: undefined,
  isBusy: false,
  pendingContext: "",
  pendingPermissions: [],
  statusMessages: [],

  handleHostMessage(msg: HostMessage) {
    console.log("[OpenCode] host→webview:", msg.type, msg);
    switch (msg.type) {
      case "server-status": {
        set({ serverStatus: msg.status });
        if (msg.status.state === "starting") {
          get().addStatus("Connecting to OpenCode…");
        } else if (msg.status.state === "error") {
          get().addStatus(
            `Server error: ${msg.status.error ?? "unknown"}`,
            true,
          );
        } else if (msg.status.state === "running") {
          // Remove non-error status messages (connecting notice)
          set((s) => ({
            statusMessages: s.statusMessages.filter((m) => m.isError),
          }));
        }
        break;
      }

      case "sessions":
        set({ sessions: msg.sessions });
        break;

      case "active-session":
        set((s) => {
          const existing = s.sessions.find(
            (sess) => sess.id === msg.session.id,
          );
          return {
            activeSessionId: msg.session.id,
            sessions: existing ? s.sessions : [msg.session, ...s.sessions],
          };
        });
        break;

      case "messages": {
        const msgs: Record<string, MessageInfo> = {};
        const order: string[] = [];
        for (const m of msg.messages) {
          msgs[m.id] = m;
          order.push(m.id);
        }
        set({
          messages: msgs,
          parts: msg.parts,
          messageOrder: order,
          activeSessionId: msg.sessionId,
        });
        break;
      }

      case "message-update":
        set((s) => {
          const newOrder = s.messageOrder.includes(msg.message.id)
            ? s.messageOrder
            : [...s.messageOrder, msg.message.id];
          return {
            messages: { ...s.messages, [msg.message.id]: msg.message },
            messageOrder: newOrder,
          };
        });
        break;

      case "part-update":
        set((s) => {
          const mid = msg.part.messageID;
          const existing = s.parts[mid] ?? [];
          const idx = existing.findIndex((p) => p.id === msg.part.id);
          const updated =
            idx >= 0
              ? existing.map((p, i) => (i === idx ? msg.part : p))
              : [...existing, msg.part];

          // Auto-create a placeholder assistant message if not yet present
          const messages = s.messages[mid]
            ? s.messages
            : {
                ...s.messages,
                [mid]: {
                  id: mid,
                  sessionID: msg.part.sessionID,
                  role: "assistant" as const,
                  time: { created: Date.now() / 1000 },
                },
              };
          const messageOrder = s.messageOrder.includes(mid)
            ? s.messageOrder
            : [...s.messageOrder, mid];

          return {
            parts: { ...s.parts, [mid]: updated },
            messages,
            messageOrder,
          };
        });
        break;

      case "busy":
        set({ isBusy: msg.busy });
        break;

      case "clear":
        set({ messages: {}, parts: {}, messageOrder: [] });
        break;

      case "providers":
        set({ providers: msg.providers });
        break;

      case "agents":
        set({ agents: msg.agents });
        break;

      case "permission": {
        const perm = msg.permission;
        if (perm.state === "pending") {
          set((s) => ({
            pendingPermissions: [
              ...s.pendingPermissions.filter((p) => p.id !== perm.id),
              perm,
            ],
          }));
        }
        break;
      }

      case "add-context":
        get().appendPendingContext(msg.text);
        break;

      case "error":
        get().addStatus(msg.message || "An error occurred", true);
        break;
    }
  },

  setSelectedModel: (model) => set({ selectedModel: model }),
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),

  appendPendingContext(text) {
    set((s) => ({
      pendingContext: s.pendingContext ? `${s.pendingContext}\n${text}` : text,
    }));
  },

  clearPendingContext: () => set({ pendingContext: "" }),

  dismissPermission: (permissionId) =>
    set((s) => ({
      pendingPermissions: s.pendingPermissions.filter(
        (p) => p.id !== permissionId,
      ),
    })),

  addStatus(text, isError = false) {
    const id = String(++_statusCounter);
    set((s) => ({
      statusMessages: [...s.statusMessages, { id, text, isError }],
    }));
    if (!isError) {
      setTimeout(() => {
        set((s) => ({
          statusMessages: s.statusMessages.filter((m) => m.id !== id),
        }));
      }, 5000);
    }
  },
}));

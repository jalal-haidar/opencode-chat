/**
 * Typed message protocol for communication between the VS Code extension
 * host and the webview. Import this on both sides to ensure every message
 * shape is verified at compile time.
 *
 * Host  → Webview : HostMessage
 * Webview → Host  : WebviewMessage
 */

/* ------------------------------------------------------------------ */
/*  Shared domain types                                               */
/* ------------------------------------------------------------------ */

export interface SessionInfo {
  id: string;
  title: string;
  time: { created: number; updated: number };
}

export interface MessageInfo {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: { created: number; completed?: number };
  cost?: number;
  tokens?: { input: number; output: number; reasoning: number };
  error?: { type: string; message?: string };
}

export type PartType = "text" | "tool" | "reasoning" | "file" | string;

export interface PartInfo {
  id: string;
  sessionID: string;
  messageID: string;
  type: PartType;
  text?: string;
  tool?: string;
  state?: "pending" | "running" | "completed" | "error" | string;
  metadata?: Record<string, unknown>;
}

export interface ServerStatus {
  state: "idle" | "starting" | "running" | "error" | "stopped";
  port: number;
  error?: string;
}

/** A fully-qualified model reference serialised through the webview. */
export interface ModelRef {
  providerID: string;
  modelID: string;
}

/** Provider entry as returned by the SDK. */
export interface ProviderInfo {
  id: string;
  name?: string;
  models?: Record<string, { name?: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

/** Agent entry as returned by the SDK. */
export interface AgentInfo {
  id?: string;
  name?: string;
  [k: string]: unknown;
}

export interface PermissionInfo {
  id: string;
  sessionID: string;
  state: "pending" | "approved" | "rejected" | string;
  tool?: string;
  description?: string;
  [k: string]: unknown;
}

export type PermissionResponse = "once" | "always" | "reject";

/* ------------------------------------------------------------------ */
/*  Host → Webview messages                                           */
/* ------------------------------------------------------------------ */

export type HostMessage =
  | { type: "server-status"; status: ServerStatus }
  | { type: "sessions"; sessions: SessionInfo[] }
  | { type: "active-session"; session: SessionInfo }
  | {
      type: "messages";
      messages: MessageInfo[];
      parts: Record<string, PartInfo[]>;
      sessionId: string;
    }
  | { type: "message-update"; message: MessageInfo }
  | { type: "part-update"; part: PartInfo }
  | { type: "busy"; busy: boolean }
  | { type: "clear" }
  | { type: "providers"; providers: ProviderInfo[] }
  | { type: "agents"; agents: Record<string, AgentInfo> }
  | { type: "permission"; permission: PermissionInfo }
  | { type: "add-context"; text: string }
  | { type: "error"; message: string };

/* ------------------------------------------------------------------ */
/*  Webview → Host messages                                           */
/* ------------------------------------------------------------------ */

export type WebviewMessage =
  | { type: "ready" }
  | {
      type: "send";
      text: string;
      model?: ModelRef;
      agent?: string;
      images?: string[];
    }
  | { type: "select-session"; sessionId: string }
  | { type: "new-session" }
  | { type: "abort" }
  | {
      type: "permission-respond";
      sessionId: string;
      permissionId: string;
      response: PermissionResponse;
    };

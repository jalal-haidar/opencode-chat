# OpenCode Chat Extension — Architecture

## Overview

OpenCode Chat is a VS Code extension that provides a Copilot-like chat experience, powered by the OpenCode CLI and SDK. The extension host manages the server lifecycle and SDK communication, while a React-based webview provides the UI.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│  VS Code Extension Host                             │
│                                                     │
│  extension.ts ── activate/deactivate, commands      │
│       │                                             │
│       ├── server.ts ── spawns `opencode serve`      │
│       │       │         polls /health               │
│       │       │         auto-restarts on crash       │
│       │       │                                     │
│       └── chat-view.ts ── WebviewViewProvider       │
│               │   SDK client (session, prompt, SSE) │
│               │   optimistic messages + dedup       │
│               │                                     │
│               ▼                                     │
│     shared/protocol.ts (typed HostMessage ↔         │
│                          WebviewMessage)             │
└───────────────────┬─────────────────────────────────┘
    postMessage()   │   postMessage()
                    ▼
┌─────────────────────────────────────────────────────┐
│  Webview (React 18 + Zustand 5)                     │
│                                                     │
│  App.tsx ── message listener (mount-once)            │
│       │                                             │
│       ├── Header ── session dropdown, new chat       │
│       ├── MessageList ── Virtuoso + error boundaries │
│       │       ├── Message ── role label + parts      │
│       │       │       └── MessagePart                │
│       │       │              ├─ text → MarkdownRenderer
│       │       │              ├─ tool → status icon    │
│       │       │              ├─ reasoning → collapsible
│       │       │              └─ other → null          │
│       │       └── PermissionPrompt                   │
│       └── footer                                     │
│               ├── ContextBar                         │
│               ├── PromptInput                        │
│               └── ModelAgentBar                      │
│                                                     │
│  useStore.ts ── Zustand store                        │
│       messages, parts, sessions, providers, agents   │
│       handleHostMessage() dispatches all HostMessage │
└─────────────────────────────────────────────────────┘
```

---

## Key Components

### Extension Host (`src/`)

- **extension.ts** — Activates the extension, resolves the OpenCode binary, spawns the server, registers the webview provider and commands (`newSession`, `abort`, `addSelection`).

- **server.ts** — Manages the `opencode serve` child process. Resolves the binary from config, `~/.opencode/bin`, or system PATH. Polls `/health` until ready. Auto-restarts on unexpected exit after a 3-second delay. Emits status callbacks (`idle → starting → running | error | stopped`).

- **chat-view.ts** — Implements `WebviewViewProvider`. Creates the SDK client via `@opencode-ai/sdk/v2/client`. Loads sessions, providers, and agents. Subscribes to SSE for real-time `message.updated` and `message.part.updated` events. Handles optimistic user messages with deduplication (temp ID replaced when server confirms). Generates the webview HTML with nonce-based CSP.

- **shared/protocol.ts** — TypeScript types for all messages between host and webview. `HostMessage` (14 variants) and `WebviewMessage` (6 variants). Shared domain types: `SessionInfo`, `MessageInfo`, `PartInfo`, `ProviderInfo`, `AgentInfo`, `PermissionInfo`.

### Webview UI (`webview-ui/src/`)

- **App.tsx** — Root component. Sets up a mount-once `useEffect` that registers the message listener using `useStore.getState()` (avoids re-render loops) and posts `"ready"` to the host.

- **useStore.ts** — Zustand store with all UI state and a central `handleHostMessage()` dispatcher. Handles message deduplication via `replaceId` field. Auto-creates placeholder assistant messages when parts arrive before the message.

- **MessageList.tsx** — Uses `react-virtuoso` for virtualized rendering with `followOutput="smooth"`. Wraps each message in a `MessageErrorBoundary` so one bad message doesn't crash the whole UI.

- **Message.tsx** — Renders a single message (role label + parts). Uses a stable `EMPTY_PARTS` constant for the Zustand selector fallback to prevent infinite re-renders.

- **MessagePart.tsx** — Renders individual parts based on type. Uses a `str()` helper that safely coerces any value (including SDK objects) to a string. Text parts go through `MarkdownRenderer`. Tool parts show status icon + tool name. Reasoning parts render as collapsible `<details>`.

- **MarkdownRenderer.tsx** — Wraps `react-markdown` with `remark-gfm` (tables, strikethrough) and `rehype-highlight` (syntax highlighting). Custom `<pre>` component adds a language label and copy button.

---

## Data Flow

### Sending a Message

1. User types in `PromptInput` and presses Enter
2. Webview posts `{ type: "send", text, model?, agent? }` to host
3. Host creates session if needed (`session.create`)
4. Host sends optimistic user message + part to webview (temp IDs)
5. Host calls `session.promptAsync()` via SDK
6. SSE delivers `message.updated` for the real user message → host sends `replaceId` to remove temp
7. SSE streams `message.part.updated` for assistant parts → forwarded to webview in real time
8. SSE delivers `session.idle` → host sends `{ type: "busy", busy: false }`

### Session Management

- On `"ready"`: host sends current server status, loads sessions and models
- Session switch: webview posts `select-session` → host calls `session.messages()` → sends full message list
- New session: webview posts `new-session` → host calls `session.create()` → clears UI

### Permissions

- SSE delivers `permission.asked` → host forwards to webview
- `PermissionPrompt` renders with Allow Once / Always Allow / Deny buttons
- User clicks → webview posts `permission-respond` → host calls `permission.respond()` via SDK

---

## Build System

- **build.ts** — Single Bun script that:
  1. Bundles extension host via `Bun.build()` (CJS format for VS Code)
  2. Runs `vite build` in `webview-ui/` (React → single `main.js` + `styles.css`)
  3. Copies media assets to `dist/media/`
  4. Optionally installs to `~/.vscode/extensions/` with `--install` flag

- **Output**: `dist/extension.js` (~105KB), `dist/webview/main.js` (~550KB), `dist/webview/styles.css` (~10KB)

---

## Security

- **CSP**: Webview HTML uses a strict Content-Security-Policy with nonce-based `script-src`, `style-src` from `webview.cspSource`, no `eval`, no inline scripts
- **Local only**: All communication is `http://127.0.0.1:<port>` — no data leaves the machine unless the OpenCode config specifies a remote provider
- **SDK objects**: All SDK values are coerced to strings via `str()` before rendering to prevent object injection into React children
- **DOMPurify**: Available for HTML sanitization (installed as dependency)

---

## See Also

- [OpenCode CLI](https://opencode.ai/)
- [OpenCode SDK](https://opencode.ai/docs/sdk)
- [OpenCode Agents](https://opencode.ai/docs/agents)

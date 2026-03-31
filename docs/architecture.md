# OpenCode Chat Extension — Architecture

## Overview

OpenCode Chat is a VS Code extension that provides a Copilot-like chat experience, powered by the OpenCode CLI and SDK. It is designed for performance, security, and a native VS Code look and feel.

---

## Key Components

- **Extension Host (src/extension.ts)**
  - Activates the extension, detects the OpenCode CLI, spawns the local server
  - Registers the sidebar chat view and commands

- **Server Manager (src/server.ts)**
  - Spawns `opencode serve` as a background process
  - Polls the `/health` endpoint to detect readiness
  - Handles process cleanup on deactivate

- **Chat View Provider (src/chat-view.ts)**
  - Implements `WebviewViewProvider` for the sidebar
  - Manages all state: sessions, messages, models, agents, permissions
  - Uses the OpenCode SDK for all API calls
  - Subscribes to SSE for real-time updates
  - Handles permission dialogs and tool call approvals

- **Webview UI (webview/main.js, webview/styles.css)**
  - Pure vanilla JS and CSS for maximum performance
  - Copilot-inspired layout and UX
  - Markdown rendering, code blocks, streaming, permission cards
  - Model and agent selectors, session dropdown, context bar

---

## Data Flow

1. **User sends a prompt**
   - Webview posts `{ type: "send", text, model, agent }` to extension host
   - Host calls `client.session.promptAsync()` via SDK
   - SSE streams assistant messages and parts back to the webview

2. **Session management**
   - Sessions are listed, created, and switched via the SDK
   - Session dropdown in the UI updates accordingly

3. **Tool calls and permissions**
   - When a tool call requires approval, a permission card is shown
   - User can "Allow Once", "Always Allow", or "Deny"
   - Host calls `client.permission.respond()`

---

## Security & Performance

- No user data leaves your machine unless you configure a remote OpenCode server
- All communication is local HTTP (127.0.0.1)
- Webview bundle is ~100KB, loads instantly
- No React, no framework, no Copilot dependency

---

## Extending

- Add new commands in `src/extension.ts`
- Add new UI features in `webview/main.js` and `webview/styles.css`
- Use the OpenCode SDK for advanced features (see [SDK docs](https://opencode.ai/docs/sdk))

---

## See Also
- [OpenCode CLI](https://opencode.ai/)
- [OpenCode SDK](https://opencode.ai/docs/sdk)
- [OpenCode Agents](https://opencode.ai/docs/agents)

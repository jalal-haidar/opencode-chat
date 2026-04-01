# OpenCode Chat VS Code Extension

A Copilot-like AI coding chat extension for Visual Studio Code, powered by [OpenCode](https://opencode.ai/).

---

## Features

- **Copilot-style chat UI**: Native-feeling sidebar chat with markdown rendering, syntax-highlighted code blocks, and copy buttons
- **Streaming responses**: Real-time output as the model thinks and generates, with collapsible reasoning sections
- **Session management**: Switch between chat sessions, start new chats, view history
- **Model & agent selection**: Choose from available LLM providers/models and custom agents
- **Tool call display**: Visual indicators for tool usage with status (pending, running, completed, error)
- **Permission dialogs**: Approve or deny tool actions (Allow Once / Always Allow / Deny)
- **Context injection**: Add code selections from the editor directly to your chat prompt
- **Auto-scroll**: Virtualized message list that follows new output smoothly
- **Server auto-restart**: Automatically restarts if the OpenCode server process crashes
- **No Copilot dependency**: 100% standalone, no Microsoft/GitHub account required

---

## Tech Stack

| Layer          | Technology                                               |
| -------------- | -------------------------------------------------------- |
| Extension host | TypeScript, VS Code API, `@opencode-ai/sdk`              |
| Webview UI     | React 18, Zustand 5, react-markdown 10, react-virtuoso 4 |
| Markdown       | remark-gfm, rehype-highlight (syntax highlighting)       |
| Build          | Bun (extension host bundler), Vite 6 (webview bundler)   |

---

## Installation

1. Clone this repository:
   ```sh
   git clone https://github.com/jalal-haidar/opencode-chat.git
   ```
2. Install dependencies:
   ```sh
   cd opencode-chat
   bun install
   cd webview-ui && bun install && cd ..
   ```
3. Build and install the extension:
   ```sh
   bun run build.ts --install
   # Then fully exit and reopen VS Code
   ```
4. Make sure the [OpenCode CLI](https://opencode.ai/install) is installed and on your PATH.

---

## Usage

- Click the **OpenCode** icon in the VS Code activity bar
- Start a new chat or select an existing session from the dropdown
- Type your prompt and press **Enter** (or click the send button)
- Use **Shift+Enter** for multi-line input
- Use the model/agent dropdowns at the bottom to change LLM or agent
- Right-click a selection in the editor → **Add Selection to Chat** to inject context
- Click the stop button (■) to abort a running generation

---

## Development

### Project Structure

```
opencode-chat/
├── src/                      # Extension host (TypeScript)
│   ├── extension.ts          # Activation, commands, server startup
│   ├── server.ts             # OpenCode server process manager
│   ├── chat-view.ts          # WebviewViewProvider, SDK integration, SSE
│   └── shared/protocol.ts    # Typed message protocol (host ↔ webview)
├── webview-ui/               # React webview app
│   ├── src/
│   │   ├── App.tsx           # Root component, message listener
│   │   ├── main.tsx          # React entry point
│   │   ├── styles.css        # All styles (VS Code theme variables)
│   │   ├── store/useStore.ts # Zustand state management
│   │   ├── hooks/            # useVsCodeApi
│   │   └── components/       # UI components
│   │       ├── Header.tsx          # Session selector + new chat button
│   │       ├── MessageList.tsx     # Virtuoso list + error boundaries
│   │       ├── Message.tsx         # Single message container
│   │       ├── MessagePart.tsx     # Part renderer (text/tool/reasoning)
│   │       ├── MarkdownRenderer.tsx# react-markdown with GFM + highlight
│   │       ├── PromptInput.tsx     # Auto-resizing textarea + send/stop
│   │       ├── ModelAgentBar.tsx   # Model and agent dropdowns
│   │       ├── ContextBar.tsx      # Attached context indicator
│   │       ├── PermissionPrompt.tsx# Tool permission dialog
│   │       └── ErrorBoundary.tsx   # Top-level crash boundary
│   └── vite.config.ts        # Vite build config
├── build.ts                  # Bun build script (host + webview)
├── package.json              # Extension manifest
└── docs/                     # Documentation
```

### Dev Mode (F5)

1. Open the repo in VS Code
2. Press **F5** — launches the Extension Development Host
3. The build task runs automatically before launch
4. Changes require rebuild: `bun run build.ts` then restart the debug session

### Settings

| Setting                      | Default | Description                                          |
| ---------------------------- | ------- | ---------------------------------------------------- |
| `opencode-chat.serverPort`   | `4096`  | Port for the local OpenCode server                   |
| `opencode-chat.opencodePath` | `""`    | Path to the opencode binary (auto-detected if empty) |

---

## License

MIT License. See [LICENSE](../LICENSE).

# OpenCode Chat VS Code Extension

A Copilot-like AI coding chat extension for Visual Studio Code, powered by [OpenCode](https://opencode.ai/).

---

## Features

- **Copilot-style chat UI**: Clean, native-feeling sidebar chat with markdown, code blocks, and streaming responses
- **Session management**: Switch between chat sessions, start new chats, and view history
- **Model & agent selection**: Choose from available LLM models and custom agents
- **Tool call approvals**: Approve or deny tool usage (e.g., file edits, shell commands) with one click
- **Permission dialogs**: Secure, user-friendly permission cards for sensitive actions
- **Streaming responses**: Real-time output as the model thinks and generates
- **Context injection**: Add code selections from the editor directly to your chat prompt
- **No Copilot dependency**: 100% standalone, no Microsoft/GitHub account required

---

## Installation

1. Download or clone this repository:
   ```sh
   git clone https://github.com/jalal-haidar/opencode-chat.git
   ```
2. Build and install the extension:
   ```sh
   cd opencode-chat
   bun install
   bun run build.ts --install
   # Then fully exit and reopen VS Code
   ```
3. Make sure the [OpenCode CLI](https://opencode.ai/install) is installed and on your PATH.

---

## Usage

- Click the **OpenCode** icon in the VS Code activity bar
- Start a new chat or select an existing session
- Type your prompt and press Enter (or click the send button)
- Use the model/agent dropdowns to change LLM or agent
- Right-click code in the editor and select "Add Selection to Chat" to inject context

---

## Development

- All extension code is in the root and `src/` directories
- Webview UI is in `webview/` (vanilla JS + CSS, no framework)
- Build with Bun: `bun run build.ts --install`
- Contributions welcome! Open issues or PRs for bugs, features, or questions

---

## License

MIT License. See [LICENSE](../LICENSE).

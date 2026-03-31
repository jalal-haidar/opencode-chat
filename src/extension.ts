import * as vscode from "vscode";
import { OpenCodeServer } from "./server";
import { ChatViewProvider } from "./chat-view";

let server: OpenCodeServer | undefined;
let chatProvider: ChatViewProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("opencode-chat");
  const port: number = config.get("serverPort") ?? 4096;
  const customBinary: string = config.get("opencodePath") ?? "";

  const workspaceDir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

  // Resolve binary
  const binary = OpenCodeServer.resolveBinary(customBinary);
  if (!binary) {
    vscode.window
      .showErrorMessage(
        "OpenCode Chat: opencode binary not found. Install from opencode.ai then restart VS Code.",
        "Install OpenCode",
      )
      .then((action) => {
        if (action === "Install OpenCode") {
          vscode.env.openExternal(vscode.Uri.parse("https://opencode.ai/docs"));
        }
      });
    return;
  }

  // Start server
  server = new OpenCodeServer(port);

  // Register sidebar chat
  chatProvider = new ChatViewProvider(context, server, workspaceDir);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "opencode-chat.chatView",
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Start server in background
  server.start(workspaceDir, binary).catch((err) => {
    vscode.window.showErrorMessage(
      `OpenCode: Failed to start server — ${err.message}`,
    );
  });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("opencode-chat.newSession", () => {
      chatProvider?.newSession();
    }),
    vscode.commands.registerCommand("opencode-chat.abort", () => {
      chatProvider?.abort();
    }),
    vscode.commands.registerCommand("opencode-chat.addSelection", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.document.getText(editor.selection);
      if (!text) return;
      const file = vscode.workspace.asRelativePath(editor.document.uri);
      const lang = editor.document.languageId;
      chatProvider?.addContext(`\`\`\`${lang}\n// ${file}\n${text}\n\`\`\``);
    }),
  );
}

export function deactivate() {
  chatProvider?.dispose();
  server?.stop();
}

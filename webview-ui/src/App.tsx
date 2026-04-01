import { useEffect } from "react";
import { useStore } from "./store/useStore";
import { postMessage } from "./hooks/useVsCodeApi";
import type { HostMessage } from "@shared/protocol";
import { Header } from "./components/Header";
import { MessageList } from "./components/MessageList";
import { PromptInput } from "./components/PromptInput";
import { ModelAgentBar } from "./components/ModelAgentBar";
import { ContextBar } from "./components/ContextBar";

export function App() {
  const handleHostMessage = useStore((s) => s.handleHostMessage);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      handleHostMessage(event.data as HostMessage);
    };
    window.addEventListener("message", handler);
    // Signal to the extension host that the webview is ready
    postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, [handleHostMessage]);

  return (
    <div id="app">
      <Header />
      <MessageList />
      <footer id="input-area">
        <ContextBar />
        <PromptInput />
        <ModelAgentBar />
      </footer>
    </div>
  );
}

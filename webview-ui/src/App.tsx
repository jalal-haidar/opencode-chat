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
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Always read the latest handler from the store at call time
      // to avoid stale closures and re-render loops
      useStore.getState().handleHostMessage(event.data as HostMessage);
    };
    window.addEventListener("message", handler);
    postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, []); // empty deps — mount once, never re-run

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

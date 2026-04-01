import { useRef } from "react";
import { useStore } from "../store/useStore";
import { postMessage } from "../hooks/useVsCodeApi";

export function PromptInput() {
  const isBusy = useStore((s) => s.isBusy);
  const pendingContext = useStore((s) => s.pendingContext);
  const clearPendingContext = useStore((s) => s.clearPendingContext);
  const selectedModel = useStore((s) => s.selectedModel);
  const selectedAgent = useStore((s) => s.selectedAgent);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }

  function send() {
    const el = inputRef.current;
    const text = (el?.value ?? "").trim();
    if (!text && !pendingContext) return;

    const fullText = pendingContext ? `${pendingContext}\n\n${text}` : text;

    postMessage({
      type: "send",
      text: fullText,
      model: selectedModel,
      agent: selectedAgent,
    });

    if (el) {
      el.value = "";
      el.style.height = "auto";
    }
    clearPendingContext();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div id="input-row">
      <textarea
        id="prompt-input"
        name="prompt"
        placeholder="Ask anything…"
        rows={1}
        aria-label="Chat prompt"
        ref={inputRef}
        disabled={isBusy}
        onKeyDown={handleKeyDown}
        onInput={autoResize}
      />
      {isBusy ? (
        <button
          id="abort-btn"
          title="Stop"
          aria-label="Stop generation"
          onClick={() => postMessage({ type: "abort" })}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1" />
          </svg>
        </button>
      ) : (
        <button id="send-btn" title="Send" aria-label="Send" onClick={send}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 1.91L7.37 8 1 14.09 1.91 15 9 8 1.91 1z" />
          </svg>
        </button>
      )}
    </div>
  );
}

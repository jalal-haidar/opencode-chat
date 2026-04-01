import { useStore } from "../store/useStore";
import { postMessage } from "../hooks/useVsCodeApi";

export function Header() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);

  function handleSessionChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val) {
      postMessage({ type: "select-session", sessionId: val });
    } else {
      postMessage({ type: "new-session" });
    }
  }

  return (
    <header id="header">
      <select
        id="session-select"
        aria-label="Session"
        value={activeSessionId ?? ""}
        onChange={handleSessionChange}
      >
        <option value="">New Chat</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title || `Session ${s.id.slice(0, 6)}`}
          </option>
        ))}
      </select>
      <button
        id="new-chat-btn"
        title="New Chat"
        aria-label="New Chat"
        onClick={() => postMessage({ type: "new-session" })}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1v6H2v2h6v6h2V9h6V7H10V1z" />
        </svg>
      </button>
    </header>
  );
}

import { useStore } from "../store/useStore";

export function ContextBar() {
  const pendingContext = useStore((s) => s.pendingContext);
  const clearPendingContext = useStore((s) => s.clearPendingContext);

  if (!pendingContext) return null;

  return (
    <div id="context-bar">
      <span className="context-label">Context attached</span>
      <button aria-label="Remove context" onClick={clearPendingContext}>
        ✕
      </button>
    </div>
  );
}

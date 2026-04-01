import { Component, type ReactNode, type ErrorInfo } from "react";
import { Virtuoso } from "react-virtuoso";
import { useStore } from "../store/useStore";
import { Message } from "./Message";
import { PermissionPrompt } from "./PermissionPrompt";

/** Lightweight per-message error boundary so one bad message doesn't crash the whole UI */
class MessageErrorBoundary extends Component<
  { msgId: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[MessageErrorBoundary]",
      this.props.msgId,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="message-error">
          <strong>{"Render error"}</strong>
          <pre>{String(this.state.error?.message ?? this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export function MessageList() {
  const messageOrder = useStore((s) => s.messageOrder);
  const messages = useStore((s) => s.messages);
  const isBusy = useStore((s) => s.isBusy);
  const pendingPermissions = useStore((s) => s.pendingPermissions);
  const statusMessages = useStore((s) => s.statusMessages);

  const isEmpty =
    messageOrder.length === 0 &&
    pendingPermissions.length === 0 &&
    statusMessages.length === 0;

  return (
    <main id="messages" role="log" aria-live="polite" data-empty={isEmpty}>
      <Virtuoso
        data={messageOrder}
        followOutput="smooth"
        itemContent={(_index, id) => {
          const msg = messages[id];
          if (!msg) return null;
          return (
            <MessageErrorBoundary key={id} msgId={id}>
              <Message message={msg} />
            </MessageErrorBoundary>
          );
        }}
        style={{ flex: 1 }}
      />
      {pendingPermissions.map((perm) => (
        <PermissionPrompt key={perm.id} permission={perm} />
      ))}
      {isBusy && (
        <div className="thinking">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
      {statusMessages.map((sm) => (
        <div
          key={sm.id}
          className={`status${sm.isError ? " status--error" : ""}`}
        >
          {String(sm.text)}
        </div>
      ))}
    </main>
  );
}

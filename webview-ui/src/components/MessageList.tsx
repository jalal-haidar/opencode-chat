import { useStore } from "../store/useStore";
import { Message } from "./Message";
import { PermissionPrompt } from "./PermissionPrompt";

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

  console.log(
    "[MessageList] render — isEmpty:",
    isEmpty,
    "messageOrder:",
    messageOrder,
    "messages:",
    messages,
  );

  return (
    <main
      id="messages"
      role="log"
      aria-live="polite"
      data-empty={isEmpty}
      style={{ overflowY: "auto" }}
    >
      {messageOrder.map((id) => {
        const msg = messages[id];
        if (!msg) return null;
        try {
          return <Message key={id} message={msg} />;
        } catch (e) {
          console.error("[MessageList] Message render error:", e, "msg:", msg);
          return (
            <div key={id} style={{ color: "red" }}>
              Error rendering message {String(id)}
            </div>
          );
        }
      })}
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

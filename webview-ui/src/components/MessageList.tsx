import { useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import { useStore } from "../store/useStore";
import { Message } from "./Message";
import { PermissionPrompt } from "./PermissionPrompt";
import type { MessageInfo, PermissionInfo } from "@shared/protocol";

type VirtualItem =
  | { kind: "message"; id: string; msg: MessageInfo }
  | { kind: "permission"; perm: PermissionInfo }
  | { kind: "thinking" }
  | { kind: "status"; id: string; text: string; isError: boolean };

function itemKey(_: number, item: VirtualItem): string {
  if (item.kind === "message") return `msg-${item.id}`;
  if (item.kind === "permission") return `perm-${item.perm.id}`;
  if (item.kind === "thinking") return "thinking";
  return `status-${item.id}`;
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

  const allItems: VirtualItem[] = [
    ...messageOrder
      .filter((id) => messages[id])
      .map((id) => ({ kind: "message" as const, id, msg: messages[id]! })),
    ...pendingPermissions.map((perm) => ({
      kind: "permission" as const,
      perm,
    })),
    ...(isBusy ? [{ kind: "thinking" as const }] : []),
    ...statusMessages.map((sm) => ({ ...sm, kind: "status" as const })),
  ];

  const renderItem = useCallback((_: number, item: VirtualItem) => {
    switch (item.kind) {
      case "message":
        return <Message message={item.msg} />;
      case "permission":
        return <PermissionPrompt permission={item.perm} />;
      case "thinking":
        return (
          <div className="thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        );
      case "status":
        return (
          <div className={`status${item.isError ? " status--error" : ""}`}>
            {item.text}
          </div>
        );
    }
  }, []);

  return (
    <main id="messages" role="log" aria-live="polite" data-empty={isEmpty}>
      {!isEmpty && (
        <Virtuoso
          style={{ height: "100%" }}
          data={allItems}
          followOutput="smooth"
          computeItemKey={itemKey}
          itemContent={renderItem}
        />
      )}
    </main>
  );
}

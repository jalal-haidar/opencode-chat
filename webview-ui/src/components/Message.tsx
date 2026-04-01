import type { MessageInfo, PartInfo } from "@shared/protocol";
import { useStore } from "../store/useStore";
import { MessagePart } from "./MessagePart";

/** Stable empty array — avoids creating a new [] on every selector call
 *  which would cause Zustand to detect a "change" and re-render infinitely. */
const EMPTY_PARTS: PartInfo[] = [];

interface MessageProps {
  message: MessageInfo;
}

export function Message({ message }: MessageProps) {
  const parts: PartInfo[] = useStore((s) => s.parts[message.id] ?? EMPTY_PARTS);

  const role: string =
    typeof message.role === "string" ? message.role : "unknown";
  const roleLabel = role === "user" ? "You" : "OpenCode";

  return (
    <div className={`message message--${role}`}>
      <div className="message__role">{roleLabel}</div>
      <div className="message__content">
        {parts.map((part, i) => (
          <MessagePart
            key={typeof part.id === "string" ? part.id : String(i)}
            part={part}
          />
        ))}
      </div>
    </div>
  );
}

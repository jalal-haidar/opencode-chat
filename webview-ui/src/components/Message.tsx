import type { MessageInfo } from "@shared/protocol";
import { useStore } from "../store/useStore";
import { MessagePart } from "./MessagePart";

interface MessageProps {
  message: MessageInfo;
}

export function Message({ message }: MessageProps) {
  const parts = useStore((s) => s.parts[message.id] ?? []);

  return (
    <div className={`message message--${message.role}`} data-id={message.id}>
      <div className="message__role">
        {message.role === "user" ? "You" : "OpenCode"}
      </div>
      <div className="message__content">
        {parts.map((part) => (
          <MessagePart key={part.id} part={part} />
        ))}
      </div>
    </div>
  );
}

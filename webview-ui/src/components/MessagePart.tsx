import DOMPurify from "dompurify";
import type { PartInfo } from "@shared/protocol";
import { MarkdownRenderer } from "./MarkdownRenderer";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface MessagePartProps {
  part: PartInfo;
}

export function MessagePart({ part }: MessagePartProps) {
  switch (part.type) {
    case "text":
      return <MarkdownRenderer text={part.text ?? ""} />;

    case "tool": {
      const stateClass = part.state ?? "pending";
      const icon =
        stateClass === "completed"
          ? "✓"
          : stateClass === "running"
            ? "⟳"
            : stateClass === "error"
              ? "✕"
              : "◦";
      return (
        <div
          className={`part part--tool tool--${stateClass}`}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              `<span class="tool-icon">${icon}</span> <span class="tool-name">${escapeHtml(part.tool ?? "tool")}</span>`,
            ),
          }}
        />
      );
    }

    case "reasoning":
      return (
        <div className="part part--reasoning">
          <details>
            <summary>Thinking…</summary>
            <div className="reasoning-text">{part.text ?? ""}</div>
          </details>
        </div>
      );

    default:
      return null;
  }
}

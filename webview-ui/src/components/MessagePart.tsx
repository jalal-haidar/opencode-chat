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
      return <MarkdownRenderer text={String(part.text ?? "")} />;

    case "tool": {
      // SDK sends state as an object {status, input, ...} — extract status string
      const rawState = part.state;
      const stateStr: string =
        typeof rawState === "object" && rawState !== null
          ? ((rawState as any).status ?? "pending")
          : typeof rawState === "string"
            ? rawState
            : "pending";
      const icon =
        stateStr === "completed"
          ? "✓"
          : stateStr === "running"
            ? "⟳"
            : stateStr === "error"
              ? "✕"
              : "◦";
      const toolName =
        typeof part.tool === "string"
          ? part.tool
          : ((part.tool as any)?.name ?? "tool");
      return (
        <div
          className={`part part--tool tool--${stateStr}`}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              `<span class="tool-icon">${icon}</span> <span class="tool-name">${escapeHtml(toolName)}</span>`,
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
            <div className="reasoning-text">{String(part.text ?? "")}</div>
          </details>
        </div>
      );

    default:
      return null;
  }
}

import type { PartInfo } from "@shared/protocol";
import { MarkdownRenderer } from "./MarkdownRenderer";

/** Safely coerce any value to a string for rendering */
function str(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return "[obj]";
  }
}

interface MessagePartProps {
  part: PartInfo;
}

export function MessagePart({ part }: MessagePartProps) {
  // Safety: if part is not an object, skip
  if (!part || typeof part !== "object") return null;

  const partType = str(part.type);

  if (partType === "text") {
    return <MarkdownRenderer text={str(part.text)} />;
  }

  if (partType === "tool") {
    const rawState = part.state;
    const stateStr: string =
      typeof rawState === "object" && rawState !== null
        ? str((rawState as any).status ?? "pending")
        : str(rawState ?? "pending");
    const icon =
      stateStr === "completed"
        ? "✓"
        : stateStr === "running"
          ? "⟳"
          : stateStr === "error"
            ? "✕"
            : "◦";
    const toolName = str(
      typeof part.tool === "string"
        ? part.tool
        : ((part.tool as any)?.name ?? "tool"),
    );
    return (
      <div className={`part part--tool tool--${stateStr}`}>
        <span className="tool-icon">{icon}</span>{" "}
        <span className="tool-name">{toolName}</span>
      </div>
    );
  }

  if (partType === "reasoning") {
    return (
      <div className="part part--reasoning">
        <details>
          <summary>{"Thinking…"}</summary>
          <div className="reasoning-text">{str(part.text)}</div>
        </details>
      </div>
    );
  }

  // Handle SDK part types we don't render (step-start, step-finish, snapshot, patch, etc.)
  return null;
}

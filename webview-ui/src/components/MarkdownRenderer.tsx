import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { useState, type ReactNode } from "react";

/** Recursively extract plain text from React children (handles hljs span trees). */
function extractText(node: ReactNode): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in (node as object)) {
    return extractText(
      (node as React.ReactElement).props.children as ReactNode,
    );
  }
  return "";
}

function CopyButton({ code }: { code: string }) {
  const [label, setLabel] = useState("Copy");
  return (
    <button
      className="copy-btn"
      onClick={() => {
        navigator.clipboard.writeText(code).catch(() => undefined);
        setLabel("Copied!");
        setTimeout(() => setLabel("Copy"), 2000);
      }}
    >
      {label}
    </button>
  );
}

const markdownComponents: Components = {
  // Wrap fenced code blocks in our .code-block shell with a copy button.
  // react-markdown renders <pre><code class="language-xxx hljs">…</code></pre>;
  // we intercept <pre> so we can hoist the language label and copy action.
  pre({ children }) {
    const codeEl = Array.isArray(children) ? children[0] : children;
    const className: string =
      (codeEl as React.ReactElement | undefined)?.props?.className ?? "";
    const lang =
      className
        .split(" ")
        .find((c: string) => c.startsWith("language-"))
        ?.slice("language-".length) ?? "";

    return (
      <div className="code-block">
        <div className="code-header">
          {lang && <span>{lang}</span>}
          <CopyButton code={extractText(children)} />
        </div>
        <pre>{children}</pre>
      </div>
    );
  },
};

interface MarkdownRendererProps {
  text: string;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  return (
    <div className="part part--text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true }]]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

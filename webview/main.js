// @ts-nocheck
// OpenCode Chat — Webview main script (vanilla JS, no framework)
// Copilot-like chat interface
// DOMPurify is loaded as a separate script before this file.
/* global DOMPurify */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  VS Code API                                                       */
  /* ------------------------------------------------------------------ */
  const vscode = acquireVsCodeApi();

  /* ------------------------------------------------------------------ */
  /*  DOM references                                                    */
  /* ------------------------------------------------------------------ */
  const $messages = document.getElementById("messages");
  const $input = document.getElementById("prompt-input");
  const $sendBtn = document.getElementById("send-btn");
  const $abortBtn = document.getElementById("abort-btn");
  const $sessionSelect = document.getElementById("session-select");
  const $newChatBtn = document.getElementById("new-chat-btn");
  const $modelSelect = document.getElementById("model-select");
  const $agentSelect = document.getElementById("agent-select");
  const $contextBar = document.getElementById("context-bar");

  /* ------------------------------------------------------------------ */
  /*  State                                                             */
  /* ------------------------------------------------------------------ */
  const msgElements = new Map(); // messageId -> DOM element
  const partElements = new Map(); // "msgId:partId" -> DOM element
  let isBusy = false;
  let pendingContext = "";
  let userScrolledUp = false;

  /* ------------------------------------------------------------------ */
  /*  Minimal Markdown Renderer                                         */
  /* ------------------------------------------------------------------ */
  function renderMarkdown(text) {
    if (!text) return "";
    // Escape HTML
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks: ```lang\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const header = lang
        ? `<div class="code-header"><span>${lang}</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>`
        : `<div class="code-header"><button class="copy-btn" onclick="copyCode(this)">Copy</button></div>`;
      return `<div class="code-block">${header}<pre><code>${code.trim()}</code></pre></div>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Headers
    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

    // Unordered lists (- item)
    html = html.replace(/(^|\n)(- .+(?:\n- .+)*)/g, (_, pre, block) => {
      const items = block
        .split("\n")
        .map((l) => `<li>${l.slice(2)}</li>`)
        .join("");
      return `${pre}<ul>${items}</ul>`;
    });

    // Ordered lists (1. item)
    html = html.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)/g, (_, pre, block) => {
      const items = block
        .split("\n")
        .map((l) => `<li>${l.replace(/^\d+\.\s/, "")}</li>`)
        .join("");
      return `${pre}<ol>${items}</ol>`;
    });

    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" title="$2">$1</a>',
    );

    // Paragraphs (double newline)
    html = html
      .split(/\n\n+/)
      .map((block) => {
        block = block.trim();
        if (!block) return "";
        if (
          block.startsWith("<h") ||
          block.startsWith("<ul") ||
          block.startsWith("<ol") ||
          block.startsWith("<blockquote") ||
          block.startsWith("<div")
        ) {
          return block;
        }
        return `<p>${block.replace(/\n/g, "<br>")}</p>`;
      })
      .join("");

    return html;
  }

  // Global copy function
  window.copyCode = function (btn) {
    const code = btn.closest(".code-block")?.querySelector("code")?.textContent;
    if (code) {
      navigator.clipboard.writeText(code);
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Rendering helpers                                                 */
  /* ------------------------------------------------------------------ */

  function scrollToBottom() {
    if (!userScrolledUp) {
      $messages.scrollTop = $messages.scrollHeight;
    }
  }

  function getOrCreateMessageEl(msg) {
    let el = msgElements.get(msg.id);
    if (el) return el;

    el = document.createElement("div");
    el.className = `message message--${msg.role}`;
    el.dataset.id = msg.id;

    // Role label
    const roleEl = document.createElement("div");
    roleEl.className = "message__role";
    roleEl.textContent = msg.role === "user" ? "You" : "OpenCode";
    el.appendChild(roleEl);

    // Content container
    const contentEl = document.createElement("div");
    contentEl.className = "message__content";
    el.appendChild(contentEl);

    msgElements.set(msg.id, el);
    $messages.appendChild(el);
    return el;
  }

  function renderPart(part) {
    const key = `${part.messageID}:${part.id}`;
    let el = partElements.get(key);

    // Get or create the message element
    const msgEl = msgElements.get(part.messageID);
    if (!msgEl) return; // message not rendered yet
    const contentEl = msgEl.querySelector(".message__content");
    if (!contentEl) return;

    switch (part.type) {
      case "text": {
        if (!el) {
          el = document.createElement("div");
          el.className = "part part--text";
          contentEl.appendChild(el);
          partElements.set(key, el);
        }
        el.innerHTML = DOMPurify.sanitize(renderMarkdown(part.text || ""));
        break;
      }

      case "tool": {
        if (!el) {
          el = document.createElement("div");
          el.className = "part part--tool";
          contentEl.appendChild(el);
          partElements.set(key, el);
        }
        const stateClass = part.state || "pending";
        const icon =
          stateClass === "completed"
            ? "✓"
            : stateClass === "running"
              ? "⟳"
              : stateClass === "error"
                ? "✕"
                : "◦";
        el.className = `part part--tool tool--${stateClass}`;
        el.innerHTML = DOMPurify.sanitize(
          `<span class="tool-icon">${icon}</span> <span class="tool-name">${escapeHtml(part.tool || "tool")}</span>`,
        );
        break;
      }

      case "reasoning": {
        if (!el) {
          el = document.createElement("div");
          el.className = "part part--reasoning";
          contentEl.appendChild(el);
          partElements.set(key, el);
        }
        el.innerHTML = DOMPurify.sanitize(
          `<details><summary>Thinking…</summary><div class="reasoning-text">${escapeHtml(part.text || "")}</div></details>`,
        );
        break;
      }

      default: {
        // Skip unknown part types silently
        break;
      }
    }

    scrollToBottom();
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setBusy(busy) {
    isBusy = busy;
    $sendBtn.style.display = busy ? "none" : "";
    $abortBtn.style.display = busy ? "" : "none";
    $input.disabled = busy;
    if (busy) {
      showThinking();
    } else {
      hideThinking();
    }
  }

  let thinkingEl = null;
  function showThinking() {
    if (thinkingEl) return;
    thinkingEl = document.createElement("div");
    thinkingEl.className = "thinking";
    thinkingEl.innerHTML =
      '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    $messages.appendChild(thinkingEl);
    scrollToBottom();
  }

  function hideThinking() {
    if (thinkingEl) {
      thinkingEl.remove();
      thinkingEl = null;
    }
  }

  function showStatus(text, isError) {
    const el = document.createElement("div");
    el.className = `status ${isError ? "status--error" : ""}`;
    el.textContent = text;
    $messages.appendChild(el);
    scrollToBottom();
    if (!isError) setTimeout(() => el.remove(), 5000);
  }

  /* ------------------------------------------------------------------ */
  /*  Message handlers from extension host                              */
  /* ------------------------------------------------------------------ */

  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "server-status": {
        const s = msg.status;
        if (s.state === "starting") {
          showStatus("Connecting to OpenCode…");
        } else if (s.state === "error") {
          showStatus(`Server error: ${s.error || "unknown"}`, true);
        } else if (s.state === "running") {
          // Remove "connecting" status
          document
            .querySelectorAll(".status:not(.status--error)")
            .forEach((el) => el.remove());
        }
        break;
      }

      case "sessions": {
        $sessionSelect.innerHTML = '<option value="">New Chat</option>';
        for (const s of msg.sessions || []) {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.title || `Session ${s.id.slice(0, 6)}`;
          $sessionSelect.appendChild(opt);
        }
        break;
      }

      case "active-session": {
        const s = msg.session;
        if (s?.id) {
          // Add to dropdown if not there
          let found = false;
          for (const opt of $sessionSelect.options) {
            if (opt.value === s.id) {
              found = true;
              opt.selected = true;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = s.title || `Session ${s.id.slice(0, 6)}`;
            opt.selected = true;
            $sessionSelect.appendChild(opt);
          }
        }
        break;
      }

      case "messages": {
        // Full message load for a session
        $messages.innerHTML = "";
        msgElements.clear();
        partElements.clear();
        const msgs = msg.messages || [];
        const parts = msg.parts || {};
        for (const m of msgs) {
          getOrCreateMessageEl(m);
          const mParts = parts[m.id] || [];
          for (const p of mParts) renderPart(p);
        }
        scrollToBottom();
        break;
      }

      case "message-update": {
        const m = msg.message;
        if (m) getOrCreateMessageEl(m);
        break;
      }

      case "part-update": {
        const p = msg.part;
        if (p) {
          // Ensure message element exists
          if (!msgElements.has(p.messageID)) {
            getOrCreateMessageEl({
              id: p.messageID,
              role: "assistant",
              sessionID: p.sessionID,
              time: { created: Date.now() / 1000 },
            });
          }
          renderPart(p);
        }
        break;
      }

      case "busy":
        setBusy(msg.busy);
        break;

      case "clear":
        $messages.innerHTML = "";
        msgElements.clear();
        partElements.clear();
        break;

      case "providers": {
        $modelSelect.innerHTML = '<option value="">Default model</option>';
        for (const prov of msg.providers || []) {
          const models = prov.models || {};
          for (const [modelId, model] of Object.entries(models)) {
            const opt = document.createElement("option");
            opt.value = JSON.stringify({
              providerID: prov.id,
              modelID: modelId,
            });
            opt.textContent = model.name || modelId;
            $modelSelect.appendChild(opt);
          }
        }
        break;
      }

      case "agents": {
        $agentSelect.innerHTML = '<option value="">Default agent</option>';
        const agents = msg.agents || {};
        for (const [agentId, agent] of Object.entries(agents)) {
          const opt = document.createElement("option");
          opt.value = agentId;
          opt.textContent = agent.name || agentId;
          $agentSelect.appendChild(opt);
        }
        break;
      }

      case "permission": {
        const perm = msg.permission;
        if (perm && perm.state === "pending") {
          const el = document.createElement("div");
          el.className = "permission";
          el.innerHTML = DOMPurify.sanitize(`
            <div class="permission__title">Permission Required</div>
            <div class="permission__text">${escapeHtml(perm.tool || perm.description || "Action requires approval")}</div>
            <div class="permission__actions">
              <button data-action="once">Allow Once</button>
              <button data-action="always">Always Allow</button>
              <button data-action="reject" class="btn--danger">Deny</button>
            </div>
          `);
          el.querySelectorAll("button[data-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
              vscode.postMessage({
                type: "permission-respond",
                sessionId: perm.sessionID,
                permissionId: perm.id,
                response: btn.dataset.action,
              });
              el.remove();
            });
          });
          $messages.appendChild(el);
          scrollToBottom();
        }
        break;
      }

      case "add-context": {
        pendingContext += (pendingContext ? "\n" : "") + msg.text;
        $contextBar.style.display = "block";
        $contextBar.innerHTML = `
          <span class="context-label">Context attached</span>
          <button id="clear-context-btn" aria-label="Remove context">✕</button>
        `;
        document
          .getElementById("clear-context-btn")
          ?.addEventListener("click", () => {
            pendingContext = "";
            $contextBar.style.display = "none";
          });
        break;
      }

      case "error":
        showStatus(msg.message || "An error occurred", true);
        break;
    }
  });

  /* ------------------------------------------------------------------ */
  /*  User actions                                                      */
  /* ------------------------------------------------------------------ */

  function send() {
    const text = ($input.value || "").trim();
    if (!text && !pendingContext) return;

    const fullText = pendingContext ? `${pendingContext}\n\n${text}` : text;

    const model = $modelSelect.value
      ? JSON.parse($modelSelect.value)
      : undefined;
    const agent = $agentSelect.value || undefined;

    vscode.postMessage({
      type: "send",
      text: fullText,
      model,
      agent,
    });

    $input.value = "";
    $input.style.height = "auto";
    pendingContext = "";
    $contextBar.style.display = "none";
  }

  // Send on Enter (Shift+Enter for newline)
  $input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // Auto-resize textarea
  $input.addEventListener("input", () => {
    $input.style.height = "auto";
    $input.style.height = Math.min($input.scrollHeight, 150) + "px";
  });

  $sendBtn.addEventListener("click", send);
  $abortBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "abort" });
  });

  $newChatBtn.addEventListener("click", () => {
    vscode.postMessage({ type: "new-session" });
  });

  $sessionSelect.addEventListener("change", () => {
    const sid = $sessionSelect.value;
    if (sid) {
      vscode.postMessage({ type: "select-session", sessionId: sid });
    } else {
      vscode.postMessage({ type: "new-session" });
    }
  });

  // Track scroll position for auto-scroll
  $messages.addEventListener("scroll", () => {
    const threshold = 80;
    userScrolledUp =
      $messages.scrollTop + $messages.clientHeight <
      $messages.scrollHeight - threshold;
  });

  /* ------------------------------------------------------------------ */
  /*  Init                                                              */
  /* ------------------------------------------------------------------ */
  vscode.postMessage({ type: "ready" });
})();

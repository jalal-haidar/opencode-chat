import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ServerStatus {
  state: "idle" | "starting" | "running" | "error" | "stopped";
  port: number;
  error?: string;
}

type StatusCallback = (s: ServerStatus) => void;

const POLL_INTERVAL = 500;
const STARTUP_TIMEOUT = process.platform === "win32" ? 60_000 : 20_000;

export class OpenCodeServer {
  private proc: ChildProcess | null = null;
  private _status: ServerStatus;
  private listeners: StatusCallback[] = [];
  private lastWorkspaceDir?: string;
  private lastBinaryPath?: string;

  constructor(private port: number) {
    this._status = { state: "idle", port };
  }

  get status(): ServerStatus {
    return { ...this._status };
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  onStatus(cb: StatusCallback) {
    this.listeners.push(cb);
  }

  private setStatus(patch: Partial<ServerStatus>) {
    Object.assign(this._status, patch);
    const snapshot = { ...this._status };
    for (const cb of this.listeners) cb(snapshot);
  }

  /** Resolve opencode binary — checks config path, ~/.opencode/bin, then PATH. */
  static resolveBinary(configPath?: string): string | null {
    if (configPath?.trim()) {
      return existsSync(configPath.trim()) ? configPath.trim() : null;
    }
    const isWin = process.platform === "win32";
    const name = isWin ? "opencode.exe" : "opencode";

    // 1. ~/.opencode/bin
    const preferred = join(homedir(), ".opencode", "bin", name);
    if (existsSync(preferred)) return preferred;

    // 2. System PATH
    if (isWin) {
      for (const ext of [".exe", ".cmd"]) {
        try {
          const r = execSync(`where opencode${ext}`, { encoding: "utf-8" })
            .split(/\r?\n/)[0]
            ?.trim();
          if (r && existsSync(r)) return r;
        } catch {}
      }
    } else {
      try {
        const r = execSync("which opencode", { encoding: "utf-8" }).trim();
        if (r && existsSync(r)) return r;
      } catch {}
    }
    return null;
  }

  /** Start the opencode server process. */
  async start(workspaceDir: string, binaryPath: string): Promise<void> {
    if (this._status.state === "running") return;
    this.lastWorkspaceDir = workspaceDir;
    this.lastBinaryPath = binaryPath;
    this.setStatus({ state: "starting" });

    this.proc = spawn(binaryPath, ["serve", "--port", String(this.port)], {
      cwd: workspaceDir || undefined,
      stdio: "ignore",
      env: { ...process.env, NO_COLOR: "1" },
      detached: false,
    });

    this.proc.on("error", (err) => {
      this.setStatus({ state: "error", error: err.message });
    });

    this.proc.on("exit", (code) => {
      this.proc = null;
      if (this._status.state !== "stopped") {
        this.setStatus({
          state: "error",
          error: `opencode exited with code ${code}`,
        });
        // Auto-restart after a brief delay
        setTimeout(() => {
          if (this._status.state === "error" && this.proc === null) {
            this.start(
              this.lastWorkspaceDir ?? "",
              this.lastBinaryPath ?? "",
            ).catch(() => {});
          }
        }, 3000);
      }
    });

    // Poll health endpoint until ready
    const deadline = Date.now() + STARTUP_TIMEOUT;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${this.url}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          this.setStatus({ state: "running" });
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    this.setStatus({ state: "error", error: "Server startup timed out" });
  }

  /** Stop the server process. */
  stop() {
    this.setStatus({ state: "stopped" });
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
      this.proc = null;
    }
  }
}

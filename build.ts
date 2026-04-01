/**
 * Build script for OpenCode Chat VS Code extension.
 *
 * Produces:
 *   dist/extension.js       — extension host (CJS, bundled by Bun)
 *   dist/webview/main.js    — webview React app (Vite build)
 *   dist/webview/styles.css — webview styles (Vite build)
 *   dist/media/icon.svg     — activity bar icon
 */

import { build, type BuildConfig } from "bun";
import { rmSync, mkdirSync, cpSync, copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dir;
const outDir = join(root, "dist");

// Clean — Vite's emptyOutDir handles dist/webview itself,
// but we still need dist/media upfront.
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "webview"), { recursive: true });
mkdirSync(join(outDir, "media"), { recursive: true });

// 1. Build extension host (CJS for VS Code runtime)
const extConfig: BuildConfig = {
  entrypoints: [join(root, "src", "extension.ts")],
  outdir: outDir,
  target: "node",
  format: "cjs",
  minify: false,
  sourcemap: "external",
  external: ["vscode"],
  naming: "extension.js",
};

console.log("Building extension host…");
const extResult = await build(extConfig);
if (!extResult.success) {
  console.error("Extension build failed:");
  for (const log of extResult.logs) console.error(log);
  process.exit(1);
}
console.log(
  `  → dist/extension.js (${extResult.outputs[0]?.size ?? "?"} bytes)`,
);

// 2. Build webview UI (React + Vite)
console.log("Building webview UI…");
const webviewResult = Bun.spawnSync(["bun", "run", "build"], {
  cwd: join(root, "webview-ui"),
  stdout: "pipe",
  stderr: "pipe",
});
if (webviewResult.exitCode !== 0) {
  console.error("Webview build failed:");
  console.error(webviewResult.stderr.toString());
  process.exit(1);
}
console.log("  → dist/webview/ (Vite)");

// 3. Copy media
cpSync(join(root, "media"), join(outDir, "media"), { recursive: true });
console.log("  → dist/media/ (copied)");

console.log("\nBuild complete.");

// 4. Optional: install into VS Code extensions directory
if (process.argv.includes("--install")) {
  const os = await import("node:os");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
  const extName = `${pkg.publisher}.${pkg.name}-${pkg.version}`;
  const extDir = join(os.homedir(), ".vscode", "extensions", extName);

  console.log(`\nInstalling to ${extDir}…`);
  rmSync(extDir, { recursive: true, force: true });
  mkdirSync(extDir, { recursive: true });

  // Copy dist/ as-is (package.json references dist/ paths)
  cpSync(outDir, join(extDir, "dist"), { recursive: true });
  // Copy package.json to extension root
  copyFileSync(join(root, "package.json"), join(extDir, "package.json"));
  // Copy media to extension root (for icon references)
  cpSync(join(root, "media"), join(extDir, "media"), { recursive: true });

  console.log(`  ✓ Installed as ${extName}`);
  console.log("  → Fully exit and reopen VS Code to activate.");
}

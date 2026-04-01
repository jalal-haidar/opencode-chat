import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../src/shared"),
    },
  },
  build: {
    outDir: "../dist/webview",
    emptyOutDir: true,
    target: "es2020",
    minify: false,
    // VS Code loads the webview locally — bundle size is not a network concern.
    chunkSizeWarningLimit: 1000,
    // Disable module preload polyfill — it injects an inline script that
    // conflicts with VS Code's strict nonce-based CSP.
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      // Point Vite at the TypeScript entry directly — no index.html required.
      // The extension host generates the HTML via buildHtml().
      input: resolve(__dirname, "src/main.tsx"),
      output: {
        // Fixed filenames — no content hash — so buildHtml() can reference
        // them with static paths.
        entryFileNames: "main.js",
        chunkFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "styles.css";
          return "[name][extname]";
        },
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: mode === "demo" ? 1421 : 1420,
    strictPort: mode !== "demo",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? ("esbuild" as const) : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));

/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html (data and code inlined) so the game can be
// published as a single page.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  json: { stringify: true },
  // The field view's animation art (assets/anim, made by pipeline/anim) is served and built beside the page as anim/.
  publicDir: "assets",
  // No module-preload polyfill: it touches the document, and the same script also runs the sim worker.
  build: { target: "es2022", chunkSizeWarningLimit: 8000, modulePreload: { polyfill: false } },
  test: { environment: "node" },
});

/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html (data and code inlined) so the game can be
// published as a single page.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  json: { stringify: true },
  build: { target: "es2022", chunkSizeWarningLimit: 8000 },
  test: { environment: "node" },
});

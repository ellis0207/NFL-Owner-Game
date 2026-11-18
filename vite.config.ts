/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import type { Plugin } from "vite";

// The real-player file carries fields the game never reads (headshot links,
// outside ids, first names, the source's depth chart slot and contract team).
// The page inlines the file, so the build drops them; tests and the dev server
// read the full file.
function slimPlayers(): Plugin {
  return {
    name: "slim-players",
    enforce: "pre",
    apply: "build",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("data/league-2026/players.json")) return null;
      const players = JSON.parse(code) as Record<string, any>[];
      for (const p of players) {
        delete p.headshotUrl; delete p.ids; delete p.firstName; delete p.depthChartPosition;
        if (p.contract) delete p.contract.otcTeam;
      }
      return { code: JSON.stringify(players), map: null };
    },
  };
}

// One self-contained index.html (data and code inlined) so the game can be
// published as a single page.
export default defineConfig({
  plugins: [slimPlayers(), react(), viteSingleFile()],
  json: { stringify: true },
  // The field view's animation art (assets/anim, made by pipeline/anim) is served and built beside the page as anim/.
  publicDir: "assets",
  // No module-preload polyfill: it touches the document, and the same script also runs the sim worker.
  build: { target: "es2022", chunkSizeWarningLimit: 8000, modulePreload: { polyfill: false } },
  test: { environment: "node" },
});

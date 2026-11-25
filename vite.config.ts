/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import type { Plugin } from "vite";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

// The real-player file carries fields the game never reads (headshot links,
// outside ids, first names, the source's depth chart slot and contract team,
// and the per-season bonus columns the deal model doesn't use). The page
// drops them; tests and the dev server read the full file.
function slimPlayers(players: Record<string, any>[]): Record<string, any>[] {
  for (const p of players) {
    delete p.headshotUrl; delete p.ids; delete p.firstName; delete p.depthChartPosition;
    if (p.contract) {
      delete p.contract.otcTeam;
      for (const y of p.contract.seasons ?? []) { delete y.team; delete y.rosterBonus; delete y.optionBonus; delete y.workoutBonus; delete y.otherBonus; }
    }
  }
  return players;
}

// The data files are most of the page. In the build each one over 40 KB goes in
// gzipped and base64-encoded, unpacked at startup by src/data/inflate.ts with a
// top-level await, so the page is about half the size it would be with plain JSON.
const PACKED = "\0packed-json:";
function packedJson(): Plugin {
  let root = "";
  return {
    name: "packed-json",
    enforce: "pre",
    apply: "build",
    configResolved(c) { root = c.root; },
    async resolveId(source, importer) {
      if (!source.endsWith(".json") || !importer || importer.startsWith("\0")) return null;
      const r = await this.resolve(source, importer, { skipSelf: true });
      if (!r || !/[\\/]data[\\/]/.test(r.id) || statSync(r.id).size < 40_000) return null;
      // The id must not end in .json, or Vite's own JSON plugin takes it back.
      return PACKED + r.id + ".mjs";
    },
    load(id) {
      if (!id.startsWith(PACKED)) return null;
      const file = id.slice(PACKED.length, -".mjs".length);
      let data = JSON.parse(readFileSync(file, "utf8"));
      if (file.replace(/\\/g, "/").endsWith("data/league-2026/players.json")) data = slimPlayers(data);
      const b64 = gzipSync(JSON.stringify(data), { level: 9 }).toString("base64");
      const helper = JSON.stringify(resolve(root, "src/data/inflate.ts"));
      return `import { inflateJson } from ${helper};\nexport default await inflateJson(${JSON.stringify(b64)});\n`;
    },
  };
}

// One self-contained index.html (data and code inlined) so the game can be
// published as a single page.
export default defineConfig({
  plugins: [packedJson(), react(), viteSingleFile()],
  json: { stringify: true },
  // The field view's animation art (assets/anim, made by pipeline/anim) is served and built beside the page as anim/.
  publicDir: "assets",
  // No module-preload polyfill: it touches the document, and the same script also runs the sim worker.
  build: { target: "es2022", chunkSizeWarningLimit: 8000, modulePreload: { polyfill: false } },
  test: { environment: "node" },
});

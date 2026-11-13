// Turns Vite's single-file build into a claude.ai Artifact page: the page is
// published without its own <html>/<head>/<body> wrapper (the host adds one),
// so the title, metadata, styles and script are written as plain content.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? "";
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? "";
const keep = head
  .replace(/<meta charset[^>]*>/i, "")
  .replace(/<meta name="viewport"[^>]*>/i, "");
// <title> first: the host only scans the start of the file for it.
const title = keep.match(/<title>[\s\S]*?<\/title>/i)?.[0] ?? "";
const page = `${title}\n${keep.replace(title, "").trim()}\n${body.trim()}\n`;
writeFileSync("dist/game.html", page);
console.log(`dist/game.html ${(page.length / 1024 / 1024).toFixed(2)} MB`);

// The historical season packs go out beside the page. Artifacts don't serve
// .gz files, so each gzipped pack is written as base64 text (pack.ts decodes it).
mkdirSync("dist/packs", { recursive: true });
const packs = readdirSync("data/packs").filter((f) => f.endsWith(".json.gz"));
for (const f of packs) writeFileSync(`dist/packs/${f.replace(".json.gz", ".txt")}`, readFileSync(`data/packs/${f}`).toString("base64"));
console.log(`dist/packs: ${packs.length} season packs`);

// The field view's animation art (assets/anim) is already beside the page: Vite copies it as dist/anim.
console.log(`dist/anim: ${readdirSync("dist/anim").join(", ")}`);

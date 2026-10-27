// Turns Vite's single-file build into a claude.ai Artifact page: the page is
// published without its own <html>/<head>/<body> wrapper (the host adds one),
// so the title, metadata, styles and script are written as plain content.
import { readFileSync, writeFileSync } from "node:fs";

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

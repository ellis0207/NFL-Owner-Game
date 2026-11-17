// A walk through every page of the built game in a browser: each page and
// each of its top tabs, in light and dark, at desktop and phone widths. It
// fails on a page error, a console error, a page that crashed into its error
// panel, or a page wider than the screen; it saves a screenshot of every page
// for the pull request.
//
//   npm run build
//   npx vite-node tests/ui-tour.ts [out dir] [save name] [--quick]
//   ONLY=phone-light npx vite-node tests/ui-tour.ts ...   (one view)
//
// The save is one of tests/saves (default: the newest, mid-season), loaded the
// way the claude.ai page hands the game a saved state. `--quick` checks only
// desktop light, without tabs' screenshots.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { parseSaveFile } from "../src/save/codec";
import { NAV, type Screen } from "../src/ui/nav";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright") as typeof import("playwright");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const quick = process.argv.includes("--quick");
const out = args[0] ?? "tour";
const saves = readdirSync("tests/saves").filter((f) => f.endsWith(".json.gz")).sort();
const saveName = args[1] ?? "pr89-2026-12-08";
if (!saves.includes(`${saveName}.json.gz`)) throw new Error(`no save ${saveName}`);
if (!existsSync("dist/index.html")) throw new Error("build first: npm run build");

const state = parseSaveFile(gunzipSync(readFileSync(`tests/saves/${saveName}.json.gz`)).toString());
const stateJson = JSON.stringify(state);

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".txt": "text/plain", ".css": "text/css" };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path === "/__state.json") { res.writeHead(200, { "content-type": "application/json" }); res.end(stateJson); return; }
  const file = join("dist", path === "/" ? "index.html" : path);
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/`;

const only = process.env.ONLY?.split(",");
const VIEWS0 = quick
  ? [{ name: "desktop-light", width: 1440, height: 900, theme: "light" }]
  : [
      { name: "desktop-light", width: 1440, height: 900, theme: "light" },
      { name: "desktop-dark", width: 1440, height: 900, theme: "dark" },
      { name: "phone-light", width: 390, height: 844, theme: "light" },
      { name: "phone-dark", width: 390, height: 844, theme: "dark" },
    ];

const VIEWS = VIEWS0.filter((v) => !only || only.includes(v.name));
const problems: string[] = [];
const browser = await chromium.launch();
for (const view of VIEWS) {
  const dir = join(out, view.name);
  mkdirSync(dir, { recursive: true });
  const phone = view.width < 700;
  const page = await browser.newPage({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1 });
  let here = "start";
  page.on("pageerror", (e) => problems.push(`${view.name} ${here}: page error ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Fonts come from Google and are blocked offline; the page falls back to its system fonts.
    if (/fonts\.(googleapis|gstatic)|ERR_|Failed to load resource/.test(t)) return;
    problems.push(`${view.name} ${here}: console ${t}`);
  });
  // The state arrives the way the claude.ai host hands a saved game to the page.
  await page.addInitScript(({ theme }) => {
    localStorage.setItem("nfl-owner-prefs", JSON.stringify({ theme, followGames: false }));
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/__state.json", false);
    xhr.send();
    (window as unknown as { claude: unknown }).claude = { hot: { data: { game: JSON.parse(xhr.responseText) } } };
  }, { theme: view.theme });
  await page.goto(base);
  await page.waitForSelector(".shell", { timeout: 60_000 });

  for (const group of NAV) {
    for (const screen of group.pages as readonly Screen[]) {
      here = screen;
      if (phone) {
        await page.click(".menu-toggle");
        const head = page.locator(`.nav-group[data-room] .nav-head:has-text("${group.label}")`);
        if ((await head.getAttribute("aria-expanded")) === "false") await head.click();
      }
      await page.locator(`.nav-item:has(> span:first-child:text-is("${label(screen)}"))`).first().click();
      await page.waitForSelector(".mh", { timeout: 20_000 });
      await page.waitForTimeout(250);
      await check(page, `${view.name} ${screen}`);
      await page.screenshot({ path: join(dir, `${slug(screen)}.png`), fullPage: false });
      if (view.name !== "desktop-light") continue;
      // Every top tab of the page, once, in desktop light.
      const tabs = page.locator(".page-body :is(.tabs, .tab-groups)").first().locator("button");
      const n = await tabs.count();
      const first = await tabs.evaluateAll((bs) => bs.findIndex((b) => b.getAttribute("aria-pressed") === "true"));
      for (let i = 0; i < n; i++) {
        if (i === first) continue;
        const name = (await tabs.nth(i).innerText()).split("\n")[0].trim();
        here = `${screen} > ${name}`;
        await tabs.nth(i).click();
        await page.waitForTimeout(150);
        await check(page, `${view.name} ${screen} > ${name}`);
        if (!quick) await page.screenshot({ path: join(dir, `${slug(screen)}--${slug(name)}.png`), fullPage: false });
      }
    }
  }
  await page.close();
}
await browser.close();
server.close();

writeFileSync(join(out, "report.txt"), problems.length ? problems.join("\n") + "\n" : "no problems\n");
console.log(problems.length ? `${problems.length} problems:\n${problems.join("\n")}` : `no problems; screenshots in ${out}`);
process.exit(problems.length ? 1 : 0);

async function check(page: import("playwright").Page, where: string) {
  const r = await page.evaluate(() => {
    // The outermost element that runs past the right edge (outside any scrolling box), to say what pushes the page wide.
    let culprit = "";
    const scrolls = (el: Element | null): boolean => {
      for (let a = el?.parentElement; a && !a.classList.contains("page-body"); a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== "visible") return true;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll(".page-body *"))) {
      if (el.getBoundingClientRect().right > window.innerWidth + 1 && !scrolls(el)) {
        const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).join(".")}` : "";
        culprit = `${el.tagName.toLowerCase()}${cls} "${(el.textContent ?? "").trim().slice(0, 40)}"`;
        break;
      }
    }
    return {
      wide: document.documentElement.scrollWidth - window.innerWidth,
      crashed: !!document.querySelector(".page-body [role=alert].error"),
      culprit,
    };
  });
  if (r.wide > 1) problems.push(`${where}: page is ${r.wide}px wider than the screen (${r.culprit})`);
  if (r.crashed) problems.push(`${where}: the page crashed into its error panel`);
}

function label(s: Screen): string {
  const l: Partial<Record<Screen, string>> = { Football: "Overview", League: "Scoreboard" };
  return l[s] ?? s;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

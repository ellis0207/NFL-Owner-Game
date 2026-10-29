// Plays seasons and prints the coaching carousel: firings, hires, where the
// new head coaches came from, coordinator turnover and our own staff moves.
// Run: [FROM=<key date|date|end>] npx vite-node tests/carousel-report.ts [seasons] [seed]
import { advanceDay } from "../src/engine/season";
import { RULES, teamLabel } from "../src/engine/league";
import { coachAge, ROLE_NAME } from "../src/engine/coaches";
import type { GameState } from "../src/engine/types";
import { reportStart } from "./fixtures";

const seasons = Number(process.argv[2] ?? 1);
const seed = Number(process.argv[3] ?? 7);
const t0 = Date.now();
const state: GameState = reportStart("NYG", seed);

for (let n = 0; n < seasons; n++) {
  const season = RULES.season;
  let guard = 0;
  while ((state.season ?? 2026) === season && guard++ < 400) advanceDay(state);
  const s = state.staff!;
  const log = s.log.filter((l) => l.date > `${season}-09-01`).reverse();
  const fired = log.filter((l) => / fire /.test(l.text));
  const hires = log.filter((l) => / hire /.test(l.text));
  console.log(`\n== ${season}: ${fired.filter((l) => /head coach/.test(l.text)).length} HC fired, ${fired.filter((l) => /general manager/.test(l.text)).length} GM fired, ${fired.length} firings in all; ${hires.length} hires; ${log.filter((l) => /retires/.test(l.text)).length} retirements`);
  const by: Record<string, number> = {};
  for (const l of hires) { const m = l.text.match(/ as (.+?)( \(|$)/); if (m) by[m[1]] = (by[m[1]] ?? 0) + 1; }
  console.log(`  hires by job: ${JSON.stringify(by)}`);
  console.log(`  coordinator hires: ${hires.filter((l) => /coordinator/.test(l.text)).length}`);
  for (const l of log.filter((l) => /head coach|general manager/.test(l.text))) console.log(`  ${l.date} ${l.text}`);
  const open = s.searches.filter((x) => !x.agreed);
  console.log(`  still open: ${open.map((x) => `${x.team} ${x.role}`).join(", ") || "none"}`);
  const ours = Object.values(s.people).filter((c) => c.team === state.userTeam && c.role);
  console.log(`  our staff: ${ours.map((c) => `${c.role} ${c.name} (${coachAge(c)}) thru ${c.contract?.through}`).join("; ")}`);
  console.log(`  people tracked ${Object.keys(s.people).length}; owed ${s.owed.length}; elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  void ROLE_NAME; void teamLabel;
}

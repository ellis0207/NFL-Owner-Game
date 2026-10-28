// Plays a save to draft day, runs the whole draft with CPU and GM picks, and
// prints what it looked like: mocks, compensatory picks, the first round,
// positions by round, draft-day trades, grades and undrafted signings.
// Run: npx vite-node tests/draft-report.ts [seed] [cache.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { schoolName } from "../src/engine/collegeData";
import {
  advanceToEndOfDay, advanceToOurPick, currentSlot, DRAFT_DAYS, draftCalls, staffRecommendations,
} from "../src/engine/draft";
import { RULES, TEAMS } from "../src/engine/league";
import { draftClass } from "../src/engine/prospects";
import { rosterCount } from "../src/engine/roster";
import { advanceDay, isGameOver, newGame } from "../src/engine/season";
import { trades } from "../src/engine/trades";
import { compress, decompress } from "../src/save/codec";
import type { GameState } from "../src/engine/types";

const seed = Number(process.argv[2] ?? 5);
const cache = process.argv[3];
const t0 = Date.now();

async function toDraftDay(): Promise<GameState> {
  if (cache && existsSync(cache)) return decompress(readFileSync(cache, "utf8"));
  const state = newGame("NYG", "Report", { capRules: "real" }, seed);
  while (state.date < RULES.keyDates.draftStart) advanceDay(state);
  if (cache) writeFileSync(cache, await compress(state));
  return state;
}

const state = await toDraftDay();
console.log(`To draft day in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const d = state.draft!;
const dc = draftClass(state.seed);
console.log(`Mocks: ${[...d.mocks].reverse().map((m) => `${m.date} ${m.outlet.split(" ").pop()} ${m.version}.0 R${m.rounds}`).join(" | ")}`);
console.log(`Returned to school: ${d.returned?.length}, combine invites: ${Object.keys(d.combine ?? {}).length}, comp picks: ${d.comp?.length}, picks: ${d.order?.length}`);
const tradesBefore = trades(state).log.length;

// Our first pick: what the staff wants.
advanceToOurPick(state);
const slot = currentSlot(state);
if (slot) {
  console.log(`\nOn the clock at No. ${slot.overall}:`);
  for (const r of staffRecommendations(state)) {
    const p = dc.byId[r.player];
    console.log(`  ${r.role} ${r.name}: ${p.position} ${p.name} (${schoolName(p.school)}). ${r.reason}`);
  }
  for (const o of draftCalls(state)) console.log(`  Call: ${o.note}`);
}
for (const day of DRAFT_DAYS) {
  while (state.date < day) advanceDay(state);
  advanceToEndOfDay(state);
}
advanceDay(state);
console.log(`\nGame over: ${isGameOver(state)} on ${state.date}`);

const made = d.made;
console.log(`\nFirst round:`);
for (const m of made.slice(0, 32)) {
  const p = dc.byId[m.player];
  const h = dc.hidden[m.player];
  const trueRank = dc.prospects.findIndex((x) => x.id === m.player) + 1;
  console.log(`  ${m.overall}. ${m.team} ${p.position} ${p.name} (${schoolName(p.school)}) by ${m.by}, class rank ${trueRank}, ovr ${h.overall}/${h.potential}, GM grade ${m.grade}`);
}
const byRound: Record<number, Record<string, number>> = {};
for (const m of made) {
  const r = Number(m.pick.split("-")[1]);
  const pos = dc.byId[m.player].position;
  (byRound[r] ??= {})[pos] = (byRound[r][pos] ?? 0) + 1;
}
for (const [r, counts] of Object.entries(byRound)) {
  console.log(`Round ${r}: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(", ")}`);
}
const grades: Record<string, number> = {};
for (const m of made) grades[m.grade ?? "?"] = (grades[m.grade ?? "?"] ?? 0) + 1;
console.log(`Grades: ${Object.entries(grades).sort().map(([g, n]) => `${g} ${n}`).join(", ")}`);
const draftTrades = trades(state).log.slice(0, trades(state).log.length - tradesBefore).filter((t) => t.date >= DRAFT_DAYS[0]);
console.log(`\nDraft-day trades: ${draftTrades.length}`);
for (const t of draftTrades.slice(0, 12)) console.log(`  ${t.date} ${t.teams[0]} send ${t.send[0].map((a) => (a.kind === "pick" ? a.pick : a.id)).join("+")} / ${t.teams[1]} send ${t.send[1].map((a) => (a.kind === "pick" ? a.pick : a.id)).join("+")}`);
const ranks = made.map((m) => dc.prospects.findIndex((x) => x.id === m.player));
console.log(`Drafted from true class top 100: ${ranks.filter((r) => r < 100).length}, top 257: ${ranks.filter((r) => r < 257).length}`);
console.log(`UDFAs: ${Object.keys(d.udfa ?? {}).length}`);
console.log(`Rosters: ${TEAMS.map((t) => rosterCount(state, t.id).roster).join(" ")}`);
console.log(`Total ${((Date.now() - t0) / 1000).toFixed(0)}s`);

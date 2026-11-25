// Player statistics over a long career: plays one save for many seasons and,
// at the end of each regular season, prints how the stats split among players
// (tests/statspread.ts) next to the real ranges, the league's totals per team,
// and how good each position's starters are, so a drift in the counts can be
// traced to the players (talent by position) or to the sim (team totals).
// Run: npx vite-node tests/longstats-report.ts [seasons] [seed] [team]
//   SAVE_DIR=<dir> writes each season-end state there (gzipped) for later reads.
import { writeFileSync } from "node:fs";
import { PLAYER_BY_ID, RULES, TEAMS } from "../src/engine/league";
import { advanceDay, newGame } from "../src/engine/season";
import { seasonTotals } from "../src/engine/stats";
import { ability } from "../src/engine/staff";
import { compress } from "../src/save/codec";
import { STAT_RANGES, statSpread, type SpreadKey } from "./statspread";
import type { GameState } from "../src/engine/types";

const seasons = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 7);
const team = String(process.argv[4] ?? "NYG");

/** Starters counted per position across the league (about one or two per club). */
const DEPTH: Record<string, number> = { QB: 32, RB: 32, WR: 64, TE: 32, OT: 64, OG: 64, C: 32, EDGE: 64, IDL: 64, LB: 64, CB: 64, S: 64 };

function talent(state: GameState): Record<string, string> {
  const by: Record<string, number[]> = {};
  for (const [id, p] of Object.entries(state.players)) {
    if (!p.team) continue;
    const pos = PLAYER_BY_ID[id]?.position;
    if (!pos || !DEPTH[pos]) continue;
    (by[pos] ??= []).push(ability(state, id));
  }
  const out: Record<string, string> = {};
  for (const pos of Object.keys(DEPTH)) {
    const v = (by[pos] ?? []).sort((a, b) => b - a);
    const top = v.slice(0, DEPTH[pos]);
    const m = top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
    out[pos] = `${m.toFixed(1)}/${(v[0] ?? 0).toFixed(0)}/${(top.at(-1) ?? 0).toFixed(0)}`;
  }
  return out;
}

function totals(state: GameState): Record<string, number> {
  const tot = Object.values(seasonTotals(state, "REG")).map((x) => x.line as Record<string, number>);
  const sum = (k: string) => tot.reduce((a, l) => a + (l[k] ?? 0), 0) / TEAMS.length;
  return { passYds: sum("passYds"), rushYds: sum("rushYds"), car: sum("car"), sacks: sum("sacks"), defInt: sum("defInt"), passTd: sum("passTd"), tkl: sum("tklSolo") + sum("tklAst") };
}

/** The value at a few ranks of a leaderboard. */
function ranks(state: GameState, key: string, at = [1, 5, 10, 20, 32]): string {
  const v = Object.values(seasonTotals(state, "REG")).map((x) => (x.line as Record<string, number>)[key] ?? 0).sort((a, b) => b - a);
  return at.map((r) => Math.round((v[r - 1] ?? 0) * 10) / 10).join("/");
}

const keys = Object.keys(STAT_RANGES) as SpreadKey[];
const table: Record<string, number[]> = {};
let state = newGame(team, "Long stats", { capRules: "real" }, seed);
for (let n = 0; n < seasons; n++) {
  const season = RULES.season;
  const t0 = Date.now();
  let guard = 0;
  while ((state.season ?? RULES.season) === season && guard++ < 420) {
    const before = state.date;
    advanceDay(state);
    if (before <= RULES.keyDates.regularSeasonEnd && state.date > RULES.keyDates.regularSeasonEnd) {
      const s = statSpread(state);
      for (const k of keys) (table[k] ??= []).push(s[k]);
      const miss = keys.filter((k) => s[k] < STAT_RANGES[k][0] || s[k] > STAT_RANGES[k][1]).map((k) => `${k} ${s[k]}`);
      const t = totals(state);
      console.log(`\n${season} (${((Date.now() - t0) / 1000).toFixed(0)}s) outside: ${miss.join(", ") || "none"}`);
      console.log(`  per team: ${Object.entries(t).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(" ")}`);
      console.log(`  ranks 1/5/10/20/32: sacks ${ranks(state, "sacks")} | int ${ranks(state, "defInt")} | rushYds ${ranks(state, "rushYds")} | recYds ${ranks(state, "recYds")} | car ${ranks(state, "car")}`);
      console.log(`  talent mean/best/last starter: ${Object.entries(talent(state)).map(([k, v]) => `${k} ${v}`).join("  ")}`);
      if (process.env.SAVE_DIR) writeFileSync(`${process.env.SAVE_DIR}/s${seed}-${season}.gz`, await compress(state));
    }
  }
}
console.log(`\nBy season (real range):`);
for (const k of keys) console.log(`  ${k.padEnd(12)} [${STAT_RANGES[k][0]}-${STAT_RANGES[k][1]}]  ${table[k].join(" ")}`);

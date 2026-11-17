// How drafts turn out: plays a save for several seasons and grades each class
// the save drafted against real drafts. Draft slot should predict a player's
// level only loosely, starters should come from every round at real rates, and
// a class's best players should not all be first-rounders (engine/outcomes.ts).
//
// Run: npx vite-node tests/draft-outcomes-report.ts [seasons] [seed]
//   SAVE=<file> also writes the final save, LOAD=<file> grades a saved one instead of playing.
import { readFileSync, writeFileSync } from "node:fs";
import { HIDDEN_RATINGS, RULES } from "../src/engine/league";
import { advanceDay, newGame } from "../src/engine/season";
import { history } from "../src/engine/seasons";
import { compress, decompress } from "../src/save/codec";
import type { GameState } from "../src/engine/types";

const seasons = Number(process.argv[2] ?? 4);
const seed = Number(process.argv[3] ?? 11);

/**
 * Real drafts, from nflverse's draft_picks and snap_counts files. Third-season starters: share of
 * each round averaging half its side's snaps in the regular season, classes 2012-2022 (66 49 34 23
 * 19 9 5%). Best 32 and rank correlation use career weighted Approximate Value for classes
 * 2012-2019 (round 1 gave 11-19 of the best 32, mean 15; rounds 4-7 gave 1-6, mean 4.5; pick vs
 * value rank correlation .56-.62). The save compares hidden level instead of AV, so its ranges
 * are a little wider.
 */
const REAL = {
  starters3: [0.66, 0.49, 0.34, 0.23, 0.19, 0.09, 0.05],
  top32FromR1: [11, 19],
  top32FromR4: [2, 8],
  rankCorr: [0.5, 0.7],
};

/** The top of the league: players at 95 or better and the 50th best level (should hold steady). */
function topEnd(st: GameState): string {
  const lv = Object.entries(st.players).filter(([, p]) => p.team && p.status !== "retired").map(([id, p]) => (HIDDEN_RATINGS[id]?.overall ?? 0) + (p.dev ?? 0)).sort((a, b) => b - a);
  return `${lv.filter((x) => x >= 95).length} at 95+, 50th best ${lv[49].toFixed(1)}, 200th ${lv[199].toFixed(1)}`;
}

let state: GameState;
if (process.env.LOAD) state = await decompress(readFileSync(process.env.LOAD, "utf8"));
else {
  state = newGame("NYG", "Report", { capRules: "real" }, seed);
  const t0 = Date.now();
  for (let n = 0; n < seasons; n++) {
    const season = state.season ?? RULES.season;
    while ((state.season ?? RULES.season) === season) {
      advanceDay(state);
      if (state.date === RULES.keyDates.regularSeasonEnd) console.log(`${season} regular season end: ${topEnd(state)}`);
    }
    console.log(`season ${season} done, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (process.env.SAVE) writeFileSync(process.env.SAVE, await compress(state));
}

const h = history(state);
const ability = (id: string) => (HIDDEN_RATINGS[id]?.overall ?? NaN) + (state.players[id]?.dev ?? 0);
const last = Math.max(...h.seasons.map((s) => s.season));

function rankCorr(a: number[], b: number[]): number {
  const rank = (v: number[]) => { const r = new Array(v.length); v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]).forEach(([, i], k) => (r[i] = k)); return r as number[]; };
  const x = rank(a), y = rank(b), m = (a.length - 1) / 2;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < a.length; i++) { c += (x[i] - m) * (y[i] - m); vx += (x[i] - m) ** 2; vy += (y[i] - m) ** 2; }
  return c / Math.sqrt(vx * vy);
}
const pct = (x: number) => `${Math.round(x * 100)}%`;

for (const d of h.drafts) {
  const played = last - d.year + 1;
  if (played < 1) continue;
  const picks = d.picks.filter(([id]) => !isNaN(ability(id)));
  const starters = Array.from({ length: 7 }, () => [0, 0]);
  for (const [id, , round] of picks) {
    const sn = h.snaps[id]?.[last];
    starters[round - 1][1]++;
    if (sn && Math.max(sn.offShare, sn.defShare) >= 0.5) starters[round - 1][0]++;
  }
  const corr = -rankCorr(picks.map((p) => p[3]), picks.map(([id]) => ability(id)));
  const best = [...picks].sort((a, b) => ability(b[0]) - ability(a[0])).slice(0, 32);
  const r1 = best.filter((p) => p[2] === 1).length, r4 = best.filter((p) => p[2] >= 4).length;
  const flag = (ok: boolean) => (ok ? "" : " (!)");
  console.log(`\nClass of ${d.year}, ${played} season${played > 1 ? "s" : ""} in:`);
  console.log(`  pick vs level rank correlation ${corr.toFixed(2)}${played >= 3 ? flag(corr >= REAL.rankCorr[0] && corr <= REAL.rankCorr[1]) : ""}  (real ${REAL.rankCorr.join("-")} by year 3)`);
  console.log(`  best 32: ${r1} from round 1, ${r4} from rounds 4-7${played >= 3 ? flag(r1 >= REAL.top32FromR1[0] && r1 <= REAL.top32FromR1[1] && r4 >= REAL.top32FromR4[0] && r4 <= REAL.top32FromR4[1]) : ""}  (real ${REAL.top32FromR1.join("-")} and ${REAL.top32FromR4.join("-")})`);
  console.log(`  half-snap starters by round: ${starters.map(([s, n], i) => `R${i + 1} ${n ? pct(s / n) : "-"}`).join("  ")}`);
  if (played === 3) console.log(`  real in year 3:              ${REAL.starters3.map((x, i) => `R${i + 1} ${pct(x)}`).join("  ")}`);
}

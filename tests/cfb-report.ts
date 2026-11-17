// Plays the college world on its own for several seasons (no NFL games) and
// prints how programs move: the strongest programs each year, how many of the
// 2026 top 25 are still there, year-to-year carryover, coaching changes,
// recruiting class leaders and where five-stars sign.
// Run: npx vite-node tests/cfb-report.ts [seasons] [seed]
import { addDays } from "../src/engine/dates";
import { collegeDaily } from "../src/engine/college";
import { COLLEGE_TEAM, COLLEGE_TEAMS, CONFERENCES } from "../src/engine/collegeData";
import { cfbDaily, cfbRollover, closeCfbSeason } from "../src/engine/cfbworld";
import { classRanking, recruitPool, signingDay } from "../src/engine/recruiting";
import { applySeason } from "../src/engine/seasons";
import { newCollege } from "../src/engine/college";
import { RULES } from "../src/engine/league";
import { reportStart } from "./fixtures";

const seasons = Number(process.argv[2] ?? 6);
const seed = Number(process.argv[3] ?? 7);
const t0 = Date.now();
const state = reportStart("NYG", seed);
const w = state.cfb!;
const start = Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, t.strength]));
const top = (xs: Record<string, number>, n: number) => Object.keys(xs).sort((a, b) => xs[b] - xs[a]).slice(0, n);
const top25at2026 = new Set(top(start, 25));
let prev = { ...start };
const corr = (a: Record<string, number>, b: Record<string, number>) => {
  const ks = Object.keys(a);
  const ma = ks.reduce((s, k) => s + a[k], 0) / ks.length;
  const mb = ks.reduce((s, k) => s + b[k], 0) / ks.length;
  let n = 0, da = 0, db = 0;
  for (const k of ks) { n += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; }
  return n / Math.sqrt(da * db);
};
for (let i = 0; i < seasons; i++) {
  const season = RULES.season;
  const end = addDays(signingDay(season + 1), 1);
  while (state.date < `${season + 1}-05-01`) {
    collegeDaily(state, { quiet: true });
    cfbDaily(state);
    state.date = addDays(state.date, 1);
  }
  void end;
  const cls = season + 1;
  const ranking = classRanking(state, cls);
  const pool = recruitPool(seed, cls);
  const fives = pool.recruits.filter((r) => r.stars === 5).map((r) => w.classes[cls]?.commits[r.id]?.school).filter(Boolean) as string[];
  const g5Fives = fives.filter((t) => !CONFERENCES[COLLEGE_TEAM[t].conference].power).length;
  const moves = w.log.filter((m) => m.date > `${season}-08-01` && m.date < `${season + 1}-05-01`);
  closeCfbSeason(state);
  const champ = state.college!.champion;
  state.season = season + 1;
  applySeason(state);
  cfbRollover(state);
  state.college = newCollege(state);
  const now = Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, w.programs[t.id].strength]));
  const t25 = top(now, 25);
  const g5 = t25.filter((t) => !CONFERENCES[COLLEGE_TEAM[t].conference].power).length;
  console.log(`\n${season} champion ${champ}; coaching: ${moves.filter((m) => m.kind === "fired").length} fired, ${moves.filter((m) => m.kind === "retired").length} retired, ${moves.filter((m) => m.kind === "hired").length} hired`);
  console.log(`  class of ${cls}: ${ranking.slice(0, 6).map((r) => `${r.team} ${r.commits}`).join(", ")}; five-stars to ${[...new Set(fives)].length} schools (${g5Fives} outside power conferences); flips ${Object.values(w.classes[cls]?.commits ?? {}).filter((c) => c.flipped).length}, top-100 flips ${pool.recruits.filter((r) => r.rank <= 100 && w.classes[cls]?.commits[r.id]?.flipped).length}`);
  console.log(`  ${season + 1} top 10: ${top(now, 10).join(" ")} | of 2026's top 25 still top 25: ${t25.filter((t) => top25at2026.has(t)).length}; G5 in top 25: ${g5}`);
  console.log(`  carryover r=${corr(prev, now).toFixed(2)} vs 2026 r=${corr(start, now).toFixed(2)}; prestige top 5: ${top(Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, w.programs[t.id].prestige])), 5).join(" ")}`);
  prev = now;
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);

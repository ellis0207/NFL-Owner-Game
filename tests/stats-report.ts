// Plays regular seasons and prints how the statistics are spread across
// players: how many reach the usual marks, the leaders, and the target and
// sack shares behind them, next to the real ranges (tests/statspread.ts).
// Run: npx vite-node tests/stats-report.ts [seasons] [first seed]
import { PLAYER_BY_ID } from "../src/engine/league";
import { advanceDay, isSeasonOver, newGame } from "../src/engine/season";
import { seasonTotals } from "../src/engine/stats";
import { STAT_RANGES, spreadMisses, statSpread, type SpreadKey } from "./statspread";
import { METRICS, RANKS, curve, realLines } from "./realcurves";

const n = Number(process.argv[2] ?? 2);
const seed0 = Number(process.argv[3] ?? 1000);
const all: Record<string, number[]> = {};
const simCurves: Record<string, number[][]> = {};
for (let s = 0; s < n; s++) {
  const t0 = Date.now();
  const state = newGame("DET", "Stats", { capRules: "real" }, seed0 + s);
  while (!isSeasonOver(state)) advanceDay(state);
  const spread = statSpread(state);
  for (const [k, v] of Object.entries(spread)) (all[k] ??= []).push(v);
  const tot = Object.entries(seasonTotals(state, "REG"));
  const simLines = tot.map(([, x]) => x.line as Record<string, number>);
  for (const m of METRICS) (simCurves[m.key] ??= []).push(curve(simLines, m));
  const top = (key: string, k = 5) => tot.map(([id, x]) => [PLAYER_BY_ID[id]?.name ?? id, (x.line as Record<string, number>)[key] ?? 0] as const)
    .sort((a, b) => b[1] - a[1]).slice(0, k).map(([nm, v]) => `${nm} ${Math.round(v * 10) / 10}`).join(", ");
  // Share of each team's targets that went to its top target, and of its sacks to its top rusher.
  const share = (key: string) => {
    const byTeam: Record<string, number[]> = {};
    for (const [, x] of tot) (byTeam[x.team] ??= []).push((x.line as Record<string, number>)[key] ?? 0);
    const s = Object.values(byTeam).map((v) => Math.max(...v) / Math.max(1, v.reduce((a, b) => a + b, 0)));
    return (s.reduce((a, b) => a + b, 0) / s.length).toFixed(3);
  };
  const sackers = (() => {
    const byTeam: Record<string, number> = {};
    for (const [, x] of tot) if (((x.line as Record<string, number>).sacks ?? 0) > 0) byTeam[x.team] = (byTeam[x.team] ?? 0) + 1;
    const v = Object.values(byTeam);
    return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
  })();
  console.log(`season ${s} (seed ${seed0 + s}, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  for (const key of ["passYds", "passTd", "rushYds", "recYds", "rec", "tgt", "sacks", "defInt"]) console.log(`  ${key}: ${top(key)}`);
  console.log(`  top target share per team ${share("tgt")} (real ~0.24), top rusher's share of sacks ${share("sacks")} (real ~0.25), players with a sack per team ${sackers} (real ~13)`);
  // Shares by position (real 2024-25: targets WR .58 TE .24 RB .17; tackles LB .26 S .22 CB .20 EDGE .16 IDL .12;
  // sacks EDGE .57 IDL .23 LB .12 S .05 CB .03) and tackles per team (real ~600 solo, ~470 assisted, a little more with retirees).
  const byPos = (key: string) => {
    const c: Record<string, number> = {};
    let sum = 0;
    for (const [id, x] of tot) { const v = (x.line as Record<string, number>)[key] ?? 0; c[PLAYER_BY_ID[id]?.position ?? "?"] = (c[PLAYER_BY_ID[id]?.position ?? "?"] ?? 0) + v; sum += v; }
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, v]) => `${p} ${(v / sum).toFixed(2)}`).join(" ");
  };
  const per = (key: string) => (tot.reduce((a, [, x]) => a + ((x.line as Record<string, number>)[key] ?? 0), 0) / 32).toFixed(0);
  console.log(`  targets ${byPos("tgt")} | tackles ${byPos("tklSolo")} | sacks ${byPos("sacks")} | per team: solo ${per("tklSolo")} ast ${per("tklAst")} sacks ${per("sacks")} recYds ${per("recYds")} (real ~3,800)`);
  // Each team's tacklers in order, averaged across the league (real 2025: 127 101 86 76 67 59 54 49 45 42 39 36).
  const ranks: number[][] = [];
  const byTeamTk: Record<string, number[]> = {};
  for (const [, x] of tot) { const l = x.line as Record<string, number>; (byTeamTk[x.team] ??= []).push((l.tklSolo ?? 0) + (l.tklAst ?? 0)); }
  for (const v of Object.values(byTeamTk)) v.sort((a, b) => b - a).slice(0, 12).forEach((x, i) => (ranks[i] ??= []).push(x));
  console.log(`  tacklers by rank: ${ranks.map((r) => Math.round(r.reduce((a, b) => a + b, 0) / r.length)).join(" ")}`);
  // Each team's share by rank (real 2024-25 targets .24 .18 .135 .11 .09 .067; carries .50 .23 .12 .07 .03 .02).
  const shares = (key: string) => {
    const byTeam: Record<string, number[]> = {};
    for (const [, x] of tot) (byTeam[x.team] ??= []).push((x.line as Record<string, number>)[key] ?? 0);
    const out = [0, 0, 0, 0, 0, 0];
    for (const v of Object.values(byTeam)) { const sum = v.reduce((a, b) => a + b, 0) || 1; v.sort((a, b) => b - a).slice(0, 6).forEach((x, i) => (out[i] += x / sum / 32)); }
    return out.map((x) => x.toFixed(2)).join(" ");
  };
  console.log(`  team shares by rank: targets ${shares("tgt")} | carries ${shares("car")}`);
  const miss = spreadMisses(spread);
  console.log(`  outside the real ranges: ${miss.length ? miss.join("; ") : "none"}`);
}
console.log(`\nMean over ${n} season(s), real range in brackets:`);
for (const key of Object.keys(STAT_RANGES) as SpreadKey[]) {
  const v = all[key];
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  console.log(`  ${key.padEnd(12)} ${m.toFixed(1).padStart(7)}  [${STAT_RANGES[key][0]}-${STAT_RANGES[key][1]}]  (${v.join(", ")})`);
}

// Whole leaderboards against the real league: the value at each rank.
const r24 = realLines(2024);
const r25 = realLines(2025);
const fmt = (x: number) => (!Number.isFinite(x) ? "  -" : Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)).padStart(6);
console.log(`\nLeaderboards by rank (${RANKS.join(", ")}): real 2024 | real 2025 | simulated (mean)`);
for (const m of METRICS) {
  const sims = simCurves[m.key];
  const mean = RANKS.map((_, i) => sims.reduce((a, c) => a + (Number.isFinite(c[i]) ? c[i] : 0), 0) / sims.length);
  console.log(`  ${m.label}`);
  console.log(`    real 24 ${curve(r24, m).map(fmt).join("")}`);
  console.log(`    real 25 ${curve(r25, m).map(fmt).join("")}`);
  console.log(`    sim     ${mean.map(fmt).join("")}`);
}

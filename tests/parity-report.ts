// Parity and persistence: how far apart the clubs' rosters are, how much of a
// roster and a record carries into the next season, and whether the league's
// talent holds its shape. At each trade deadline it records every club's
// starters (a starter for each slot, by `ability`) and where last year's
// starters went; at the Super Bowl, wins.
//
// Run: npx vite-node tests/parity-report.ts [seasons] [seed]
// Targets (docs/balance.md): win percentage spread .17-.20 and a year-to-year
// win correlation of .25-.45 (NFL 2002-2024 about .33); about 70% of a
// club's starters back with it the next season; club talent spread steady after
// the first two seasons; the league's starter talent and its 85+ players
// neither inflating nor draining.
const seasons = Number(process.argv[2] ?? 6);
const seed = Number(process.argv[3] ?? 7);

const { advanceDay } = await import("../src/engine/season");
const { reportStart } = await import("./fixtures");
const { RULES, TEAM_BY_ID, PLAYER_BY_ID } = await import("../src/engine/league");
const { ability } = await import("../src/engine/staff");
const { standings } = await import("../src/engine/standings");
const { teamPlayerIds } = await import("../src/engine/cap");
const { starters } = await import("../src/engine/clubhouse");

const state = reportStart("DET", seed);
const SLOTS: Record<string, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1 };
type Season = { season: number; talent: Record<string, number>; qb: Record<string, number>; st: Record<string, string[]>; back: number; starting: number; elite: number; p10: number; p50: number; p90: number; wins?: Record<string, number> };
const out: Season[] = [];
let cur: Season | null = null;

for (let i = 0; i < 420 * seasons && out.filter((o) => o.wins).length < seasons; i++) {
  const K = RULES.keyDates;
  if (state.date === K.tradeDeadline) {
    cur = { season: RULES.season, talent: {}, qb: {}, st: {}, back: 0, starting: 0, elite: 0, p10: 0, p50: 0, p90: 0 };
    const all: number[] = [];
    for (const t of Object.keys(TEAM_BY_ID)) {
      const by: Record<string, number[]> = {};
      for (const id of teamPlayerIds(state, t)) {
        const pos = PLAYER_BY_ID[id]?.position;
        if (!pos) continue;
        const a = ability(state, id);
        (by[pos] ??= []).push(a);
        if (a >= 85) cur.elite++;
      }
      let sum = 0, n = 0;
      for (const [pos, k] of Object.entries(SLOTS)) {
        const best = (by[pos] ?? []).sort((a, b) => b - a).slice(0, k);
        while (best.length < k) best.push(40);
        sum += best.reduce((a, b) => a + b, 0);
        all.push(...best);
        n += k;
        if (pos === "QB") cur.qb[t] = best[0];
      }
      cur.talent[t] = sum / n;
      cur.st[t] = starters(state, t);
    }
    all.sort((a, b) => a - b);
    [cur.p10, cur.p50, cur.p90] = [0.1, 0.5, 0.9].map((q) => all[Math.floor(q * (all.length - 1))]);
    // Last year's starters: still with the club, and still starting.
    const prev = out[out.length - 1];
    if (prev) {
      let n = 0;
      for (const [t, ids] of Object.entries(prev.st)) for (const id of ids) {
        n++;
        if (state.players[id]?.team === t) cur.back++;
        if (cur.st[t].includes(id)) cur.starting++;
      }
      cur.back /= n;
      cur.starting /= n;
    }
    out.push(cur);
  }
  if (state.date === K.superBowl && cur) {
    const st = standings(state);
    cur.wins = Object.fromEntries(Object.keys(TEAM_BY_ID).map((t) => [t, st[t].w + st[t].t / 2]));
    console.log(`season ${RULES.season} done`);
    cur = null;
  }
  advanceDay(state);
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
};
const done = out.filter((o) => o.wins);
const T = Object.keys(TEAM_BY_ID);
console.log(`\nseed ${seed}, ${done.length} seasons`);
console.log("season  talent sd  mean  p10/p50/p90 starters  85+  win% sd  r(talent,wins)  back  starting");
for (const o of done) {
  const w = T.map((t) => o.wins![t] / 17), ta = T.map((t) => o.talent[t]);
  console.log(`${o.season}    ${sd(ta).toFixed(2).padStart(5)}  ${mean(ta).toFixed(1)}  ${o.p10.toFixed(0)}/${o.p50.toFixed(0)}/${o.p90.toFixed(0)}          ${String(o.elite).padStart(4)}  ${sd(w).toFixed(3)}    ${corr(ta, w).toFixed(2).padStart(5)}          ${o.back ? o.back.toFixed(2) : "  - "}  ${o.starting ? o.starting.toFixed(2) : " -"}`);
}
const pairs = done.slice(1).map((b, i) => [done[i], b] as const);
const rw = pairs.map(([a, b]) => corr(T.map((t) => a.wins![t]), T.map((t) => b.wins![t])));
const rt = pairs.map(([a, b]) => corr(T.map((t) => a.talent[t]), T.map((t) => b.talent[t])));
console.log(`Year to year: wins r ${rw.map((x) => x.toFixed(2)).join(" ")} (mean ${mean(rw).toFixed(2)}, NFL about .33); talent r mean ${mean(rt).toFixed(2)}`);

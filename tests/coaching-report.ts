// How much coaching and the locker room move results: plays seasons with every club, and at each
// trade deadline records the roster's talent (a starter for each slot) and the
// staff's engine numbers; at the Super Bowl it records wins. Then it fits wins
// on talent and prints how much of the rest each coaching number explains, the
// win gap between the top and bottom quarter of head coaches, and how fast
// young players grow under better and worse teaching staffs.
//
// Run: npx vite-node tests/coaching-report.ts [seasons] [seed]
// Targets (docs/balance.md): head coach quarters 1-1.5 wins apart, coaching
// development r about .2 with young players' yearly growth, talent still the
// biggest single factor.
const seasons = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 7);

const { advanceDay } = await import("../src/engine/season");
const { reportStart } = await import("./fixtures");
const { RULES, TEAM_BY_ID, PLAYER_BY_ID, HIDDEN_RATINGS } = await import("../src/engine/league");
const { staffEffects, ability } = await import("../src/engine/staff");
const { standings } = await import("../src/engine/standings");
const { teamPlayerIds } = await import("../src/engine/cap");
const { ageOn } = await import("../src/engine/dates");
const { roomBoost } = await import("../src/engine/positionCoaches");
const { starters } = await import("../src/engine/clubhouse");

const state = reportStart("DET", seed);
const SLOTS: Record<string, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1 };
type Row = { wins: number; talent: number; qb: number; morale: number; chem: number; command: number; offCalling: number; defCalling: number; specialTeams: number; gameManagement: number; leadership: number };
const rows: Row[] = [];
const young: { growth: number; room: number; coach: number }[] = [];
const was: Record<string, { now: number; room: number; coach: number }> = {};
let snap: Record<string, Omit<Row, "wins">> | null = null;

for (let i = 0; i < 400 * seasons && rows.length < 32 * seasons; i++) {
  const K = RULES.keyDates;
  if (state.date === K.tradeDeadline) {
    snap = {};
    for (const t of Object.keys(TEAM_BY_ID)) {
      const by: Record<string, number[]> = {};
      for (const id of teamPlayerIds(state, t)) {
        const pos = PLAYER_BY_ID[id]?.position;
        if (pos) (by[pos] ??= []).push(ability(state, id));
      }
      let sum = 0, qb = 0, n = 0;
      for (const [pos, k] of Object.entries(SLOTS)) {
        const best = (by[pos] ?? []).sort((a, b) => b - a).slice(0, k);
        while (best.length < k) best.push(40);
        sum += best.reduce((a, b) => a + b, 0);
        n += k;
        if (pos === "QB") qb = best[0];
      }
      const fx = staffEffects(t);
      const st = starters(state, t);
      const morale = st.reduce((a, id) => a + (state.players[id]?.morale ?? 70), 0) / Math.max(1, st.length);
      snap[t] = { talent: sum / n, qb, morale, chem: state.clubhouse?.chem[t] ?? 60, command: fx.command, offCalling: fx.offCalling, defCalling: fx.defCalling, specialTeams: fx.specialTeams, gameManagement: fx.gameManagement, leadership: fx.leadership };
    }
    for (const [id, p] of Object.entries(state.players)) {
      const pl = PLAYER_BY_ID[id];
      if (!p.team || !pl || !HIDDEN_RATINGS[id]) continue;
      const r = HIDDEN_RATINGS[id];
      const now = r.overall + (p.dev ?? 0);
      const fx = staffEffects(p.team);
      const side = ["EDGE", "IDL", "LB", "CB", "S"].includes(pl.position) ? fx.devDefense : ["K", "P", "LS"].includes(pl.position) ? fx.devSpecial : fx.devOffense;
      const coach = side + roomBoost(state, p.team, pl.position);
      // Growth is read against the room the player had to grow, under the staff that had him the year before.
      const prev = was[id];
      if (prev && prev.room > 1 && (ageOn(pl.birthDate, state.date) ?? 30) <= 26) young.push({ growth: (now - prev.now) / prev.room, room: prev.room, coach: prev.coach });
      was[id] = { now, room: r.potential + (p.pot ?? 0) - now, coach };
    }
  }
  if (state.date === K.superBowl && snap) {
    const st = standings(state);
    for (const t of Object.keys(TEAM_BY_ID)) rows.push({ wins: st[t].w + st[t].t / 2, ...snap[t] });
    snap = null;
    console.log(`season ${RULES.season} done`);
  }
  advanceDay(state);
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
};
// Least squares of wins on talent and the starting quarterback (normal equations, three unknowns).
function fit(y: number[], xs: number[][]): number[] {
  const X = y.map((_, i) => [1, ...xs.map((x) => x[i])]);
  const k = X[0].length;
  const A = Array.from({ length: k }, (_, r) => Array.from({ length: k }, (_, c) => X.reduce((s, row) => s + row[r] * row[c], 0)));
  const b = Array.from({ length: k }, (_, r) => X.reduce((s, row, i) => s + row[r] * y[i], 0));
  for (let c = 0; c < k; c++) {
    const p = A[c][c] || 1e-9;
    for (let r = 0; r < k; r++) if (r !== c) {
      const f = A[r][c] / p;
      for (let j = 0; j < k; j++) A[r][j] -= f * A[c][j];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / (A[i][i] || 1e-9));
}

const wins = rows.map((r) => r.wins);
const talent = rows.map((r) => r.talent), qb = rows.map((r) => r.qb);
const beta = fit(wins, [talent, qb]);
const resid = wins.map((w, i) => w - (beta[0] + beta[1] * talent[i] + beta[2] * qb[i]));
const r2 = 1 - mean(resid.map((x) => x * x)) / mean(wins.map((w) => (w - mean(wins)) ** 2));
console.log(`\n${rows.length} team-seasons, seed ${seed}. Talent and quarterback explain ${(r2 * 100).toFixed(0)}% of wins.`);
console.log("number            r with wins   r with the rest");
for (const k of ["talent", "qb", "morale", "chem", "command", "offCalling", "defCalling", "specialTeams", "gameManagement", "leadership"] as const) {
  const x = rows.map((r) => r[k]);
  console.log(`${k.padEnd(18)}${corr(x, wins).toFixed(2).padStart(10)}${corr(x, resid).toFixed(2).padStart(16)}`);
}
const byCommand = [...rows].sort((a, b) => b.command - a.command);
const q = Math.floor(rows.length / 4);
const top = byCommand.slice(0, q), bottom = byCommand.slice(-q);
const gap = mean(top.map((r) => resid[rows.indexOf(r)])) - mean(bottom.map((r) => resid[rows.indexOf(r)]));
console.log(`Head coaches, top quarter vs bottom quarter, wins beyond the roster: ${gap.toFixed(2)} (target 1-1.5)`);
console.log(`Young players (26 and under): ${young.length}, share of their room grown a year ${mean(young.map((y) => y.growth)).toFixed(2)}, r with the teaching staff ${corr(young.map((y) => y.growth), young.map((y) => y.coach)).toFixed(2)} (target about .2)`);
const quarterGap = (k: "chem" | "morale") => {
  const order = rows.map((r, i) => ({ v: r[k], e: resid[i] })).sort((a, b) => b.v - a.v);
  return mean(order.slice(0, q).map((x) => x.e)) - mean(order.slice(-q).map((x) => x.e));
};
const sd = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
console.log(`Win percentage spread: ${sd(wins.map((w) => w / 17)).toFixed(3)} (NFL about .18 to .20). Mood and chemistry below include reverse cause: winning teams are happier.`);
console.log(`Locker room: starters' mood at the deadline averages ${mean(rows.map((r) => r.morale)).toFixed(1)}, spread between clubs ${sd(rows.map((r) => r.morale)).toFixed(1)}; chemistry spread ${sd(rows.map((r) => r.chem)).toFixed(1)}`);
console.log(`Top vs bottom quarter, wins beyond the roster: chemistry ${quarterGap("chem").toFixed(2)}, mood ${quarterGap("morale").toFixed(2)} (target about 1 for chemistry)`);

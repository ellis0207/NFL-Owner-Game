// How skills age by position: average change in physical and skill traits by
// age over a few simulated offseasons, from a saved state at season end.
//   npx vite-node tests/aging-report.ts [seasons] [seed]
import { stateAt } from "./fixtures";
import { HIDDEN_RATINGS, PLAYER_BY_ID } from "../src/engine/league";
import { PHYSICAL } from "../src/engine/aging";
import { progressPlayers } from "../src/engine/careers";
import { ageOn } from "../src/engine/dates";

const seasons = Number(process.argv[2] ?? 4);
const seed = Number(process.argv[3] ?? 7);
const state = await stateAt("NYG", seed);
const groups: Record<string, string[]> = { QB: ["QB"], RB: ["RB"], WR: ["WR", "TE"], OL: ["OT", "OG", "C"], DL: ["EDGE", "IDL"], DB: ["CB", "S", "LB"] };
const acc: Record<string, Record<number, { n: number; body: number; craft: number; all: number }>> = {};
const snapshot = () => Object.fromEntries(Object.keys(state.players).map((id) => [id, { dev: state.players[id].dev ?? 0, tdev: { ...(state.players[id].tdev ?? {}) } }]));
for (let s = 0; s < seasons; s++) {
  const before = snapshot();
  progressPlayers(state, 2027 + s);
  for (const [id, p] of Object.entries(state.players)) {
    const data = PLAYER_BY_ID[id];
    const r = HIDDEN_RATINGS[id];
    if (!data || !r || p.status === "retired" || !before[id]) continue;
    const g = Object.keys(groups).find((k) => groups[k].includes(data.position));
    if (!g) continue;
    const age = Math.min(36, Math.max(22, ageOn(data.birthDate, `${2027 + s}-09-01`) ?? 27));
    const d = (t: string) => (p.dev ?? 0) - before[id].dev + (p.tdev?.[t] ?? 0) - (before[id].tdev[t] ?? 0);
    const names = Object.keys(r.traits);
    const body = names.filter((t) => (PHYSICAL[t] ?? 0.5) >= 0.7);
    const craft = names.filter((t) => (PHYSICAL[t] ?? 0.5) <= 0.3);
    const cell = ((acc[g] ??= {})[age] ??= { n: 0, body: 0, craft: 0, all: 0 });
    cell.n++;
    cell.all += (p.dev ?? 0) - before[id].dev;
    cell.body += body.length ? body.reduce((s2, t) => s2 + d(t), 0) / body.length : 0;
    cell.craft += craft.length ? craft.reduce((s2, t) => s2 + d(t), 0) / craft.length : 0;
  }
}
for (const [g, rows] of Object.entries(acc)) {
  console.log(`\n${g}  age: overall / body / craft per year`);
  for (const [age, c] of Object.entries(rows).sort((a, b) => +a[0] - +b[0])) {
    if (c.n < 5) continue;
    console.log(`  ${age}: ${(c.all / c.n).toFixed(1).padStart(5)} ${(c.body / c.n).toFixed(1).padStart(5)} ${(c.craft / c.n).toFixed(1).padStart(5)}   (n=${c.n})`);
  }
}

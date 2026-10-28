// Trade calibration: what notable players are worth, and the trades a season produces.
// npx vite-node tests/trade-report.ts [seed]
import { PLAYERS } from "../src/engine/league";
import { advanceDay, newGame } from "../src/engine/season";
import { headline, chartValue, direction, outlook, picksOf, pickValue, playerValue, trades } from "../src/engine/trades";
import { RULES } from "../src/engine/league";

const seed = Number(process.argv[2] ?? 7);
const state = newGame("DET", "Calibration", { capRules: "real" }, seed);
const names = ["Micah Parsons", "Myles Garrett", "Maxx Crosby", "Sauce Gardner", "Quinnen Williams", "Ja'Marr Chase", "Justin Jefferson", "Davante Adams", "Patrick Mahomes", "Josh Allen", "Kirk Cousins", "Christian McCaffrey", "Brock Bowers", "Malik Nabers", "Trey Hendrickson", "Cooper Kupp", "Jakobi Meyers", "Tyreek Hill", "Jalen Ramsey", "Brian Thomas"];
const wp = outlook(state);
console.log("dir", Object.fromEntries(Object.keys(wp).map((t) => [t, `${wp[t].toFixed(2)} ${direction(state, t)}`])));
for (const n of names) {
  const p = PLAYERS.find((x) => x.name === n);
  if (!p || !state.players[p.id].team) continue;
  const own = playerValue(state, "gm", state.players[p.id].team!, p.id);
  const kc = playerValue(state, "gm", "BUF", p.id);
  console.log(n.padEnd(20), p.position, state.players[p.id].team, "own", own.points.toFixed(0), "BUF", kc.points.toFixed(0), "worth", (own.worth / 1e6).toFixed(1), "cost", (own.cost / 1e6).toFixed(1), "role", own.role);
}
console.log("chart", [1, 10, 32, 50, 64, 96, 150, 224].map((x) => `${x}:${chartValue(x).toFixed(0)}`).join(" "));
console.log("DET picks", picksOf(state, "DET").slice(0, 8).map((p) => `${p}:${pickValue(state, "DET", p).toFixed(0)}`).join(" "));
const end = process.argv[3] ?? RULES.keyDates.tradeDeadline;
while (state.date <= end) advanceDay(state);
const log = trades(state).log;
console.log(`${log.length} trades by ${state.date}`);
for (const t of [...log].reverse()) {
  console.log(t.date, t.blockbuster ? "*" : " ", headline(state, t), JSON.stringify(t.edge));
}
console.log("offers to owner", trades(state).offers.length, "requests", Object.keys(trades(state).requests).length);

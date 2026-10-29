// Plays a save through the draft and prints the business side: the P&L by
// league year, the gate at each home game, stadium events and cash.
// Run: [FROM=<key date|date|end>] npx vite-node tests/business-report.ts [team] [seed]
import { advanceDay } from "../src/engine/season";
import { answerOffer, business, cashBalance, CATEGORY, operatingEstimate, pnl, revenueEstimate, valuation, billions } from "../src/engine/business";
import { money } from "../src/engine/inbox";
import { TEAMS } from "../src/engine/league";
import { STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { reportStart } from "./fixtures";

const team = process.argv[2] ?? "NYG";
const seed = Number(process.argv[3] ?? 7);
const t0 = Date.now();
const state = reportStart(team, seed);
let low = Infinity;
// One season: through the draft, until the league moves on.
while ((state.season ?? 2026) === 2026) {
  for (const e of business(state).events) if (e.status === "offered") answerOffer(state, e.id, true);
  advanceDay(state);
  low = Math.min(low, cashBalance(state));
}
const b = business(state);
console.log(`${team} (${STADIUM_BY_TEAM[team].structure}) in ${((Date.now() - t0) / 1000).toFixed(0)}s. Cash ${money(cashBalance(state))}, low ${money(low)}, fans ${state.pressure.fans.toFixed(0)}`);
for (const y of [2026, 2027]) {
  const p = pnl(state, y);
  console.log(`\n== ${y} league year: revenue ${money(p.totalRevenue)}, expenses ${money(p.totalExpenses)}, operating ${money(p.operating)}`);
  for (const r of [...p.revenue, ...p.expenses, ...p.financing]) console.log(`  ${CATEGORY[r.cat].label.padEnd(48)} ${money(r.amount)}`);
}
console.log("\nGates:");
for (const g of [...b.gates].reverse()) console.log(`  ${g.date} ${g.type} vs ${g.opp}: ${g.sold}/${g.capacity} (${Math.round((g.sold / g.capacity) * 100)}%), ST ${g.seasonHolders}, single ${g.singleSold}/${g.singleSeats} @ $${g.price}, heat ${g.heat}, ${money(g.revenue)}`);
console.log("\nEvents:");
for (const e of b.events) console.log(`  ${e.date} [${e.by}/${e.status}] ${e.name}: ${money(e.low)}-${money(e.high)}${e.ours !== undefined ? ` -> ours ${money(e.ours)}` : ""}${e.note ? ` (${e.note})` : ""}`);
console.log(`\nRenewal: ${JSON.stringify(b.renewal)}`);
console.log("\nLeague estimates:");
for (const t of [...TEAMS].sort((a, c) => valuation(state, c.id) - valuation(state, a.id))) console.log(`  ${t.id.padEnd(4)} rev ${money(revenueEstimate(state, t.id))} op ${money(operatingEstimate(state, t.id))} value ${billions(valuation(state, t.id))}`);

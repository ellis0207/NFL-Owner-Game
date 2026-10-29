// Plays one college season on its own and prints what it looked like: scoring,
// polls, the playoff, bowls, award winners and the stat leaders among prospects.
// Run: [FROM=<key date|date|end>] npx vite-node tests/college-report.ts [seed]
import { addDays } from "../src/engine/dates";
import {
  AWARDS, collegeDaily, collegeGames, collegeRecords, conferenceChampions, latestPoll, prospectLine, prospectTotals,
} from "../src/engine/college";
import { schoolName } from "../src/engine/collegeData";
import { draftClass } from "../src/engine/prospects";
import { addAssignment, knowledge, scoutingDaily, scoutReport } from "../src/engine/scouting";
import { reportStart } from "./fixtures";

const seed = Number(process.argv[2] ?? 7);
const t0 = Date.now();
const state = reportStart("NYG", seed);
addAssignment(state, { conference: "SEC", positions: ["CB"] }, "campus");
const dc = draftClass(seed);
const five = dc.prospects.filter((p) => p.position === "QB").slice(0, 5).map((p) => p.id);
addAssignment(state, { players: five }, "deep");
while (state.date < "2027-01-27") {
  collegeDaily(state);
  scoutingDaily(state);
  state.date = addDays(state.date, 1);
}
const c = state.college!;
const games = collegeGames(state).filter((g) => c.results[g.id]);
const pts = games.reduce((s, g) => s + c.results[g.id][0] + c.results[g.id][1], 0);
const homeWins = games.filter((g) => !g.site && c.results[g.id][1] > c.results[g.id][0]).length;
console.log(`${games.length} games, ${(pts / games.length / 2).toFixed(1)} pts per team, home teams won ${(100 * homeWins / games.filter((g) => !g.site).length).toFixed(0)}%, ${games.filter((g) => c.results[g.id][2]).length} OT`);
const recs = collegeRecords(state);
const ap = latestPoll(state, "ap")!;
console.log(`Final AP top 10: ${ap.ranks.slice(0, 10).map((t, i) => `${i + 1}. ${schoolName(t)} ${recs[t].w}-${recs[t].l}`).join(", ")}`);
console.log(`Conference champions: ${Object.entries(conferenceChampions(state)).map(([k, v]) => `${k} ${schoolName(v!)}`).join(", ")}`);
console.log(`CFP field: ${c.cfpField?.map((t, i) => `${i + 1}. ${schoolName(t)}`).join(", ")}`);
console.log(`Champion: ${c.champion && schoolName(c.champion)}; bowls: ${c.post.filter((g) => g.kind === "bowl").length}`);
const undefeated = Object.entries(recs).filter(([, r]) => r.l === 0).map(([t]) => schoolName(t));
console.log(`Undefeated: ${undefeated.join(", ") || "none"}`);
for (const a of AWARDS) {
  const w = c.awards[a.id]?.winner;
  if (w) console.log(`${a.name}: ${dc.byId[w].position} ${dc.byId[w].name} (${schoolName(dc.byId[w].school)}) ${prospectLine(dc.byId[w], prospectTotals(state, w))}`);
}
for (const pos of ["QB", "RB", "WR", "TE", "EDGE", "LB", "CB"] as const) {
  const key = { QB: "passYds", RB: "rushYds", WR: "recYds", TE: "recYds", EDGE: "sacks", LB: "tkl", CB: "defInt" }[pos];
  const best = dc.prospects.filter((p) => p.position === pos).map((p) => [p, prospectTotals(state, p.id)] as const).sort((a, b) => (b[1][key] ?? 0) - (a[1][key] ?? 0)).slice(0, 3);
  console.log(`${pos} leaders: ${best.map(([p, t]) => `${p.name} (${schoolName(p.school)}) ${prospectLine(p, t)}`).join(" | ")}`);
}
console.log(`Scouting spent $${c.scouting.spent.toLocaleString()} of $${c.scouting.budget.toLocaleString()}; known prospects: ${Object.keys(c.scouting.know).length}`);
for (const id of five.slice(0, 2)) {
  const p = dc.byId[id];
  console.log(p.name, knowledge(state, id), JSON.stringify(scoutReport(state, id)), "true value", dc.hidden[id].value.toFixed(1), "overall", dc.hidden[id].overall);
}
const cb = dc.prospects.find((p) => p.position === "CB" && schoolName(p.school) === "Georgia");
if (cb) console.log("SEC CB", cb.name, knowledge(state, cb.id), scoutReport(state, cb.id).grade);
console.log(`Save size of college state: ${(JSON.stringify(c).length / 1024).toFixed(0)} KB; ${((Date.now() - t0) / 1000).toFixed(1)}s`);

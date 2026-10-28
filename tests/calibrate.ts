// Prints league-wide averages from simulated seasons, to compare with real NFL numbers.
// Run: npx vite-node tests/calibrate.ts [seasons]
import { GAME_BY_ID } from "../src/engine/league";
import { advanceDay, isSeasonOver, newGame } from "../src/engine/season";
import { stat } from "../src/engine/stats";
import { standings } from "../src/engine/standings";

const n = Number(process.argv[2] ?? 1);
const t0 = Date.now();
const agg: Record<string, number> = {};
const add = (k: string, v: number) => (agg[k] = (agg[k] ?? 0) + v);
let teamGames = 0;
const injuriesOut: number[] = [];
for (let s = 0; s < n; s++) {
  const state = newGame("DET", "Calib", { capRules: "real" }, 1000 + s);
  while (!isSeasonOver(state)) advanceDay(state);
  for (const [gid, box] of Object.entries(state.box)) {
    if (GAME_BY_ID[gid].type !== "REG") continue;
    const r = state.results[gid];
    add("games", 1);
    add("pts", r.awayScore + r.homeScore);
    add("homeWin", r.homeScore > r.awayScore ? 1 : 0);
    add("ties", r.homeScore === r.awayScore ? 1 : 0);
    add("ot", r.overtime ? 1 : 0);
    add("margin7", Math.abs(r.homeScore - r.awayScore) <= 7 ? 1 : 0);
    for (const side of ["away", "home"] as const) {
      teamGames++;
      const t = box.team[side];
      for (const k of Object.keys(t) as (keyof typeof t)[]) add(k, t[k]);
      for (const v of Object.values(box.players[side])) {
        add("ints", stat(v, "int"));
        add("passTd", stat(v, "passTd"));
        add("rushTd", stat(v, "rushTd"));
        add("fga", stat(v, "fga"));
        add("fgm", stat(v, "fgm"));
        add("xpa", stat(v, "xpa"));
        add("xpm", stat(v, "xpm"));
        add("punts", stat(v, "punts"));
        add("puntYds", stat(v, "puntYds"));
        add("fumLost", stat(v, "fumLost"));
        add("kr", stat(v, "kr"));
        add("krYds", stat(v, "krYds"));
      }
      add("injuries", box.injuries.filter((i) => i.team === r[side]).length);
    }
  }
  const st = standings(state);
  const wins = Object.values(st).map((x) => x.w).sort((a, b) => a - b);
  const mean = wins.reduce((a, b) => a + b, 0) / wins.length;
  const sd = Math.sqrt(wins.reduce((a, b) => a + (b - mean) ** 2, 0) / wins.length);
  const top = Object.entries(st).sort((a, b) => b[1].w - a[1].w).map(([t, x]) => `${t} ${x.w}`).join(" ");
  console.log(`season ${s}: wins sd ${sd.toFixed(2)} (NFL ~3.1) min ${wins[0]} max ${wins[wins.length - 1]}, champion ${state.champion}\n  ${top}`);
  let ir = 0;
  for (const p of Object.values(state.players)) if (p.status === "ir") ir++;
  injuriesOut.push(ir);
}
const g = agg.games;
const per = (k: string) => (agg[k] / teamGames).toFixed(2);
console.log(`time ${((Date.now() - t0) / 1000).toFixed(1)}s for ${n} season(s)`);
console.log(`points/team ${(agg.pts / teamGames).toFixed(1)} (NFL ~22-23)  homeWin ${(agg.homeWin / g).toFixed(3)} (~0.54)  ties ${agg.ties}  OT ${(agg.ot / g).toFixed(3)} (~0.06)  within7 ${(agg.margin7 / g).toFixed(2)} (~0.5)`);
console.log(`plays ${per("plays")} (~62)  yards ${per("yards")} (~330)  pass ${per("passYds")} rush ${per("rushYds")} (~120)  firstDowns ${per("firstDowns")} (~19.5)`);
console.log(`att ${per("passAtt")} (~33)  cmp% ${(agg.cmp / agg.passAtt).toFixed(3)} (~0.65)  ypa ${(agg.passYds / agg.passAtt).toFixed(2)} (gross ~7.0)  sacks ${per("sacked")} (~2.4)  INT ${per("ints")} (~0.75)  passTD ${per("passTd")} (~1.45)`);
console.log(`rushAtt ${per("rushAtt")} (~27)  ypc ${(agg.rushYds / agg.rushAtt).toFixed(2)} (~4.4)  rushTD ${per("rushTd")} (~0.85)  fumLost ${per("fumLost")} (~0.45)  turnovers ${per("turnovers")} (~1.25)`);
console.log(`3rd ${(agg.thirdConv / agg.thirdAtt).toFixed(3)} (~0.39) 3rdAtt ${per("thirdAtt")} (~13)  4th ${(agg.fourthConv / agg.fourthAtt).toFixed(3)} (~0.53) 4thAtt ${per("fourthAtt")} (~1.4)  RZ TD ${(agg.redZoneTd / agg.redZoneAtt).toFixed(3)} (~0.56) RZ att ${per("redZoneAtt")} (~3.3)`);
console.log(`FG ${(agg.fgm / agg.fga).toFixed(3)} (~0.85) FGA ${per("fga")} (~1.8)  XP ${(agg.xpm / agg.xpa).toFixed(3)} (~0.95)  punts ${per("punts")} (~3.8) avg ${(agg.puntYds / agg.punts).toFixed(1)} (~47)  KR avg ${(agg.krYds / agg.kr).toFixed(1)}  penalties ${per("penalties")} (~6.5) yds ${per("penYds")} (~55)`);
console.log(`TOP ${(agg.top / teamGames / 60).toFixed(1)} min  injuries/team-game ${per("injuries")}  IR at season end (league) ${injuriesOut.join(",")}`);

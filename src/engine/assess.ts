// Position assessments from the season's plays, the way an analytics staff
// breaks a player down: quarterbacks by accuracy, pressure, sacks and
// turnovers; blockers by the pressure they give up for the snaps they play;
// defenders by pressure, coverage and run stops with the unit's situational
// results; special teams by kick, punt, return and coverage numbers. All of
// it comes from the box scores everyone can see.
import { PLAYER_BY_ID, GAME_BY_ID } from "./league";
import { playerLines, seasonAdv } from "./strategy";
import { seasonTotals, stat } from "./stats";
import type { GameState } from "./types";

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export interface QbRow { id: string; dropbacks: number; cmpPct: number; ypa: number; pressuredPct: number; sackPct: number; pressureToSack: number; toPct: number; epa: number }
export interface LineRow { id: string; snaps: number; allowed: number; perHundred: number }
export interface DefRow { id: string; snaps: number; pressures: number; sacks: number; tfl: number; coverage: number; tackles: number }
export interface StRow { id: string; role: string; line: string }

/** The four assessments for one team's players this regular season. */
export function assessments(state: GameState, team = state.userTeam): { qb: QbRow[]; line: LineRow[]; def: DefRow[]; st: StRow[]; unit: { thirdDownStop: number; explosiveAllowed: number; pressureRate: number } } {
  const totals = seasonTotals(state, "REG");
  const mine = Object.entries(totals).filter(([, r]) => r.team === team);
  const epa = new Map(playerLines(state, team).filter((p) => p.role === "q").map((p) => [p.id, p.n ? p.epa / p.n : 0]));
  const v = (l: Record<string, number>, k: string) => Number(l[k] ?? 0);
  const qb: QbRow[] = [];
  const line: LineRow[] = [];
  const def: DefRow[] = [];
  const st: StRow[] = [];
  let teamDropbacks = 0;
  for (const [, r] of mine) {
    const l = r.line as Record<string, number>;
    teamDropbacks += v(l, "att") + v(l, "sacked");
  }
  for (const [id, r] of mine) {
    const l = r.line as Record<string, number>;
    const pos = PLAYER_BY_ID[id]?.position;
    if (pos === "QB" && v(l, "att") >= 20) {
      const db = v(l, "att") + v(l, "sacked");
      qb.push({
        id, dropbacks: db, cmpPct: pct(v(l, "cmp"), v(l, "att")), ypa: r1(v(l, "passYds") / Math.max(1, v(l, "att"))),
        pressuredPct: pct(v(l, "pressured"), db), sackPct: pct(v(l, "sacked"), db), pressureToSack: pct(v(l, "sacked"), v(l, "pressured")),
        toPct: pct(v(l, "int") + v(l, "fumLost"), db), epa: Math.round((epa.get(id) ?? 0) * 100) / 100,
      });
    }
    if ((pos === "OT" || pos === "OG" || pos === "C") && v(l, "offSnaps") >= 50) {
      // Pass-blocking snaps: his share of the offense's snaps times the team's dropbacks.
      const teamSnaps = Math.max(1, ...mine.map(([, x]) => Number((x.line as Record<string, number>).offSnaps ?? 0)));
      const pb = teamDropbacks * (v(l, "offSnaps") / teamSnaps);
      line.push({ id, snaps: v(l, "offSnaps"), allowed: v(l, "pressAllowed"), perHundred: r1((v(l, "pressAllowed") / Math.max(1, pb)) * 100) });
    }
    if (["EDGE", "IDL", "LB", "CB", "S"].includes(pos ?? "") && v(l, "defSnaps") >= 50) {
      def.push({ id, snaps: v(l, "defSnaps"), pressures: v(l, "pressures"), sacks: v(l, "sacks"), tfl: v(l, "tfl"), coverage: v(l, "pd") + v(l, "defInt"), tackles: v(l, "tklSolo") + v(l, "tklAst") });
    }
    if (pos === "K" && v(l, "fga")) st.push({ id, role: "Kicker", line: `${v(l, "fgm")}/${v(l, "fga")} field goals (${pct(v(l, "fgm"), v(l, "fga"))}%), ${v(l, "fgm50")}/${v(l, "fga50")} from 50+, ${v(l, "xpm")}/${v(l, "xpa")} extra points` });
    if (pos === "P" && v(l, "punts")) st.push({ id, role: "Punter", line: `${v(l, "punts")} punts, ${r1(v(l, "puntYds") / v(l, "punts"))} gross, ${v(l, "puntIn20")} inside the 20, ${v(l, "puntTb")} touchbacks` });
    if (v(l, "kr") >= 5) st.push({ id, role: "Kick returner", line: `${v(l, "kr")} returns, ${r1(v(l, "krYds") / v(l, "kr"))} a return${v(l, "krTd") ? `, ${v(l, "krTd")} TD` : ""}` });
    if (v(l, "pr") >= 5) st.push({ id, role: "Punt returner", line: `${v(l, "pr")} returns, ${r1(v(l, "prYds") / v(l, "pr"))} a return${v(l, "prTd") ? `, ${v(l, "prTd")} TD` : ""}` });
    if (v(l, "stSnaps") >= 100 && !["K", "P", "LS"].includes(pos ?? "")) st.push({ id, role: "Coverage", line: `${v(l, "stSnaps")} special teams snaps` });
  }
  // The unit's situational results: third downs stopped, explosive plays given up, pressure on dropbacks faced.
  let oppThird = 0, oppThirdConv = 0, oppDropbacks = 0, ourPressures = 0;
  for (const [gid, box] of Object.entries(state.box)) {
    const g = GAME_BY_ID[gid];
    const res = state.results[gid];
    if (!g || g.type !== "REG" || !res || (res.away !== team && res.home !== team)) continue;
    const them = res.away === team ? "home" : "away";
    const us = res.away === team ? "away" : "home";
    oppThird += box.team[them].thirdAtt;
    oppThirdConv += box.team[them].thirdConv;
    oppDropbacks += box.team[them].passAtt + box.team[them].sacked;
    for (const vals of Object.values(box.players[us])) ourPressures += stat(vals, "pressures");
  }
  const adv = seasonAdv(state)[team];
  const explosiveAllowed = adv && adv.def.pn + adv.def.rn ? r1((adv.def.x / (adv.def.pn + adv.def.rn)) * 100) : 0;
  qb.sort((a, b) => b.dropbacks - a.dropbacks);
  line.sort((a, b) => a.perHundred - b.perHundred);
  def.sort((a, b) => b.pressures + b.coverage * 2 - (a.pressures + a.coverage * 2));
  return { qb, line, def, st, unit: { thirdDownStop: oppThird ? Math.round((1 - oppThirdConv / oppThird) * 1000) / 10 : 0, explosiveAllowed, pressureRate: pct(ourPressures, oppDropbacks) } };
}

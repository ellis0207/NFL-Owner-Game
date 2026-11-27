// What happens on its own after a historical start that follows real history
// (eras.ts): the real sales of clubs on their dates, inheritances of control at
// each new season, and word of the real moves and renames as they take effect.
// Under alternate history none of it happens. The 2020 labor deal is in
// labor.ts, the caps in setCap (offseason.ts), the rules in rulesFor.

import { eraName, eraOwner, HOMES, REAL_EXPANSION, REALIGNED } from "./eras";
import { awardRealClub } from "./expansion";
import { franchise, REAL_SALES } from "./franchisemarket";
import { news } from "./inbox";
import { CONTROL } from "./investors";
import { RULES, TEAMS, TEAM_BY_ID } from "./league";
import type { GameState } from "./types";

/** Who controls each club at the start: the owner of that season where it wasn't the 2026 one. */
export function eraStartControl(state: GameState): void {
  if (!state.era) return;
  const f = franchise(state);
  for (const t of TEAMS) {
    const o = eraOwner(t.id, state.era.start);
    if (o) f.control[t.id] = o;
  }
  // A real expansion already awarded when the season began (Carolina and Jacksonville before 1994,
  // Cleveland's new Browns in 1996, Houston in 1999) opens on the league's usual schedule.
  if (!state.era.alt) awardDue(state, state.era.start);
}

/** Awards the real expansion whose award season has come and whose clubs haven't joined, one at a time. */
function awardDue(state: GameState, season: number): void {
  const x = state.expansion;
  if (x?.clubs.some((c) => !c.activated)) return;
  const next = REAL_EXPANSION.find((r) => r.awarded <= season && r.clubs.some((c) => c.joins > season && !TEAM_BY_ID[c.id]));
  if (!next) return;
  for (const c of next.clubs) awardRealClub(state, { ...c, staff: { ...c.staff } }, c.joins - season);
  if (season > state.era!.start) {
    news(state, "league", `The league awards ${next.clubs.map((c) => `${c.city}'s ${c.name}`).join(" and ")}, to play from ${next.clubs[0].joins}`);
  }
}

/** Called at each new season (the day after the draft), once the season is applied. */
export function eraNewSeason(state: GameState): void {
  const e = state.era;
  if (!e || e.alt) return;
  const season = RULES.season;
  const f = franchise(state);
  const soldInSave = new Set(f.sales.filter((x) => !("real" in x && x.real)).map((x) => x.team));
  for (const t of TEAMS) {
    // A club sold in this save, ours, or one whose real sale is still ahead keeps its owner for now.
    if (soldInSave.has(t.id) || t.id === state.userTeam || REAL_SALES.some((x) => x.team === t.id && x.date > state.date)) continue;
    const now = eraOwner(t.id, season) ?? CONTROL[t.id];
    if (now && (f.control[t.id] ?? CONTROL[t.id]) !== now) {
      f.control[t.id] = now;
      news(state, "ownership", `Control of the ${TEAM_BY_ID[t.id].name} passes to ${now}`);
    }
  }
  for (const h of HOMES) if (season === h.until && e.start < h.until && !state.relocation?.moves.some((m) => m.team === h.team)) {
    news(state, "ownership", `The ${TEAM_BY_ID[h.team].name} play their first season in ${TEAM_BY_ID[h.team].city} after leaving ${h.city}`);
  }
  awardDue(state, season);
  if (season === REALIGNED && e.start < REALIGNED) news(state, "league", "The league plays its first season in eight divisions of four, with the Texans in the new AFC South");
  for (const id of ["WAS", "TEN"]) {
    const now = eraName(id, season);
    if (TEAM_BY_ID[id] && now !== eraName(id, season - 1) && !(id === "TEN" && season <= e.start)) news(state, "ownership", `${TEAM_BY_ID[id].city}'s club plays this season as the ${now}`);
  }
}

/**
 * The USFL, a spring league from 1983 to 1985, for the wire only: the game
 * doesn't take its players away (the real rosters of 1983-1985 already lack
 * the ones who went there, and real draft classes keep theirs in the league).
 */
const USFL_WIRE: Record<string, string> = {
  "1983-03-06": "A new spring league, the USFL, plays its first games, with some of last fall's college stars on its rosters",
  "1984-01-20": "The USFL outbids the league for more of this year's college stars, and salaries climb on both sides",
  "1986-07-29": "A jury finds the league broke the antitrust laws against the USFL but awards it one dollar",
  "1986-08-04": "The USFL calls off its fall season; its players may now sign with the clubs that hold their league rights",
};

/** The real sales of clubs, on the day the owners approved them. */
export function erasDaily(state: GameState): void {
  const e = state.era;
  if (!e || e.alt) return;
  if (USFL_WIRE[state.date] && e.start <= 1986) news(state, "league", USFL_WIRE[state.date]);
  // 1987: three weeks of games with replacement players, while some veterans cross the line.
  if (state.date === "1987-10-02" && e.start <= 1987) news(state, "labor", "This weekend's games go ahead with replacement players, and a few veterans cross the picket line");
  if (state.date === "1987-10-15" && e.start <= 1987) news(state, "labor", "The players end their strike without a deal and return to work; the union takes the league to court");
  for (const x of REAL_SALES) {
    if (x.date !== state.date || x.team === state.userTeam) continue;
    const f = franchise(state);
    if (f.sales.some((s) => s.team === x.team && s.date === x.date)) continue;
    f.sales.push({ ...x });
    f.control[x.team] = x.buyer;
    news(state, "ownership", `League owners approve the sale of the ${TEAM_BY_ID[x.team].name} to ${x.buyer}`);
  }
}

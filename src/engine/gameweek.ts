// The game week: the practice report, game-day status, the practice plan, the
// emergency list, and how likely a player we cut is to be claimed.
//
// Clubs file a practice report on the three practice days before a game:
// did not participate, limited or full. The last one carries the game status
// (out, doubtful, questionable). Veterans get the odd rest day, and players
// away for personal matters show as such, nothing more.
//
// The practice plan is the week's emphasis: install the game plan, work on
// fundamentals, or lighten up to recover. The emergency list is the pro
// scouts' short list of street free agents at the positions a team can't be
// caught short at: quarterback and the three specialists.
//
// A player signed or claimed on game day can't play that day: the league
// needs the paperwork in before the deadline.
import { teamPlayerIds } from "./cap";
import { posOf } from "./clubhouse";
import { addDays, ageOn, daysBetween } from "./dates";
import { injuryStatus } from "./injuries";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES } from "./league";
import { rngFor } from "./rng";
import { matchup } from "./standings";
import { perceivedAbility, staffEffects } from "./staff";
import type { GameState, Position, ScheduledGame } from "./types";

export type Emphasis = "balanced" | "plan" | "fundamentals" | "recovery";

export const EMPHASIS: Record<Emphasis, { label: string; what: string }> = {
  balanced: { label: "Balanced", what: "A normal week: the game plan, some fundamentals, a walkthrough day." },
  plan: { label: "Game plan", what: "Most of the week on this opponent: a sharper plan, a little less individual growth." },
  fundamentals: { label: "Fundamentals", what: "More individual work: young players grow faster, the plan is a bit thinner." },
  recovery: { label: "Recovery", what: "Lighter practices and more treatment: fewer practice injuries, a thinner plan." },
};

/** Did not participate, limited, full. */
export type Participation = "DNP" | "LP" | "FP";

export interface PracticeReport {
  gameId: string;
  team: string;
  /** Practice day to player id to [participation, reason]. */
  days: Record<string, Record<string, [Participation, string]>>;
}

export interface GameWeekState {
  /** The latest practice report for each team, for its next game. */
  reports: Record<string, PracticeReport>;
}

export function gameWeek(state: GameState): GameWeekState {
  return (state.gameWeek ??= { reports: {} });
}

export function emphasis(state: GameState): Emphasis {
  return state.clubhouse?.programs.emphasis ?? "balanced";
}

/** What the week's emphasis adds to the game plan's preparation, in the plan's raw points. */
export function emphasisPlanBonus(state: GameState, team: string): number {
  if (team !== state.userTeam) return 0;
  return { balanced: 0, plan: 2.5, fundamentals: -1.5, recovery: -1 }[emphasis(state)];
}

/** In season, the emphasis's effect on growth and practice injuries for our players. */
export function emphasisFactors(state: GameState): { growth: number; practiceRisk: number } {
  const inSeason = state.date > RULES.keyDates.regularSeasonStart && state.date <= RULES.keyDates.superBowl;
  if (!inSeason) return { growth: 1, practiceRisk: 1 };
  return {
    balanced: { growth: 1, practiceRisk: 1 },
    plan: { growth: 0.96, practiceRisk: 1 },
    fundamentals: { growth: 1.07, practiceRisk: 1.05 },
    recovery: { growth: 0.97, practiceRisk: 0.75 },
  }[emphasis(state)];
}

/** A team's next game within the next few days, if any. */
export function nextGame(state: GameState, team: string, within = 6): ScheduledGame | undefined {
  for (let i = 0; i <= within; i++) {
    const d = addDays(state.date, i);
    for (const g of GAMES_BY_DATE[d] ?? []) {
      if (state.results[g.id]) continue;
      const m = matchup(state, g);
      if (m && (m.away === team || m.home === team)) return g;
    }
  }
  return undefined;
}

const LABEL: Record<Participation, string> = { DNP: "Did not practice", LP: "Limited", FP: "Full" };
export const participationLabel = (p: Participation) => LABEL[p];

/** One practice day's report for a team, given its next game. */
function reportDay(state: GameState, team: string, g: ScheduledGame, first: boolean): Record<string, [Participation, string]> {
  const out: Record<string, [Participation, string]> = {};
  const rng = rngFor(state.seed, `practice-report:${team}:${state.date}`);
  const restVets = team === state.userTeam && !!state.clubhouse?.programs.restVets;
  for (const id of teamPlayerIds(state, team)) {
    const ps = state.players[id];
    if (ps.status !== "active") continue;
    const inj = ps.injury;
    if (inj && inj.returnDate > state.date) {
      if (inj.type === "Personal matter") { out[id] = ["DNP", "Personal matter"]; continue; }
      const days = daysBetween(state.date, inj.returnDate);
      const part: Participation = inj.returnDate > g.date || days >= 3 ? "DNP" : days >= 1 ? "LP" : "FP";
      out[id] = [part, inj.type];
      continue;
    }
    if (ps.rust && ps.rust.until > state.date && first) { out[id] = ["LP", "Easing back in"]; continue; }
    const age = ageOn(PLAYER_BY_ID[id].birthDate, state.date) ?? 26;
    // The first practice of the week is when veterans get their rest.
    if (first && age >= (restVets ? 30 : 32) && (restVets || rng() < 0.3)) out[id] = ["DNP", "Rest"];
  }
  return out;
}

/** Files the practice report for every team on the three practice days before its game. */
function fileReports(state: GameState): void {
  const gw = gameWeek(state);
  const teams = new Set<string>();
  for (let i = 2; i <= 4; i++) for (const g of GAMES_BY_DATE[addDays(state.date, i)] ?? []) {
    const m = matchup(state, g);
    if (m) { teams.add(m.away); teams.add(m.home); }
  }
  for (const team of teams) {
    const g = nextGame(state, team, 4);
    if (!g || g.type === "PRE") continue;
    const left = daysBetween(state.date, g.date);
    if (left < 2 || left > 4) continue;
    if (gw.reports[team]?.gameId !== g.id) gw.reports[team] = { gameId: g.id, team, days: {} };
    gw.reports[team].days[state.date] = reportDay(state, team, g, left === 4);
  }
}

/** The status for the game, filed with the last practice report. */
export function gameStatus(state: GameState, id: string, g: ScheduledGame): string | null {
  return injuryStatus(state, id, g.date);
}

// ---- Emergency list ----

const SCARCE: Position[] = ["QB", "K", "P", "LS"];

/** The pro scouts' short list of free agents who could be signed in an emergency, by position. */
export function emergencyList(state: GameState, team = state.userTeam): { pos: Position; ids: string[] }[] {
  const skill = staffEffects(team).proScouting;
  const free = Object.keys(state.players).filter((id) => state.players[id].status === "fa" && !state.players[id].injury && PLAYER_BY_ID[id]);
  return SCARCE.map((pos) => ({
    pos,
    ids: free.filter((id) => PLAYER_BY_ID[id].position === pos)
      .map((id) => ({ id, v: perceivedAbility(state, id, `pro:${team}`, skill) }))
      .sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.id),
  }));
}

/** Players at a scarce position the roster has only one of (or none). */
export function thinSpots(state: GameState, team = state.userTeam): Position[] {
  const ids = teamPlayerIds(state, team).filter((id) => state.players[id].status === "active" && !state.players[id].injury);
  return SCARCE.filter((pos) => ids.filter((id) => posOf(state, id) === pos).length < (pos === "QB" ? 2 : 1));
}

// ---- Game-day eligibility ----

/** Signed, claimed or traded for on game day: not eligible until the next game. */
export function joinedToday(state: GameState, id: string, team: string, date: string): boolean {
  const t = state.transactions;
  if (!t?.length) return false;
  // The wire is newest first.
  for (let i = 0; i < t.length && t[i].date >= date; i++) {
    const x = t[i];
    if (x.date === date && x.player === id && x.team === team && (x.kind === "signed" || x.kind === "claimed" || x.kind === "traded" || x.kind === "poached")) return true;
  }
  return false;
}

export function gameWeekDaily(state: GameState): void {
  const K = RULES.keyDates;
  if (state.date < K.regularSeasonStart || state.date > K.superBowl) return;
  fileReports(state);
  // Old reports for games already played go.
  const gw = gameWeek(state);
  for (const [team, r] of Object.entries(gw.reports)) if (state.results[r.gameId]) delete gw.reports[team];
}

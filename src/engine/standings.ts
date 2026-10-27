// Standings, playoff seeding and the postseason bracket.
import { SCHEDULE, TEAMS, TEAM_BY_ID } from "./league";
import { hashString } from "./rng";
import type { GameState, PlayoffRound, ScheduledGame } from "./types";

export interface Record_ {
  team: string;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  divW: number;
  divL: number;
  divT: number;
  confW: number;
  confL: number;
  confT: number;
  streak: string;
}

export function winPct(w: number, l: number, t: number): number {
  const g = w + l + t;
  return g ? (w + t / 2) / g : 0;
}

export function standings(state: GameState): Record<string, Record_> {
  const table: Record<string, Record_> = {};
  for (const t of TEAMS) {
    table[t.id] = { team: t.id, w: 0, l: 0, t: 0, pf: 0, pa: 0, divW: 0, divL: 0, divT: 0, confW: 0, confL: 0, confT: 0, streak: "" };
  }
  const streaks: Record<string, string[]> = {};
  for (const g of SCHEDULE) {
    if (g.type !== "REG") continue;
    const r = state.results[g.id];
    if (!r) continue;
    const sameDiv = TEAM_BY_ID[r.away].conference === TEAM_BY_ID[r.home].conference
      && TEAM_BY_ID[r.away].division === TEAM_BY_ID[r.home].division;
    const sameConf = TEAM_BY_ID[r.away].conference === TEAM_BY_ID[r.home].conference;
    for (const [team, us, them] of [[r.away, r.awayScore, r.homeScore], [r.home, r.homeScore, r.awayScore]] as const) {
      const row = table[team];
      row.pf += us;
      row.pa += them;
      const res = us > them ? "W" : us < them ? "L" : "T";
      if (res === "W") row.w++; else if (res === "L") row.l++; else row.t++;
      if (sameDiv) { if (res === "W") row.divW++; else if (res === "L") row.divL++; else row.divT++; }
      if (sameConf) { if (res === "W") row.confW++; else if (res === "L") row.confL++; else row.confT++; }
      (streaks[team] ??= []).push(res);
    }
  }
  for (const [team, list] of Object.entries(streaks)) {
    const last = list[list.length - 1];
    let n = 0;
    for (let i = list.length - 1; i >= 0 && list[i] === last; i--) n++;
    table[team].streak = `${last}${n}`;
  }
  return table;
}

/** Simplified NFL tiebreakers: win pct, then division (for division races) or
 * conference record, then point differential, then a fixed coin flip. */
function compare(a: Record_, b: Record_, division: boolean): number {
  const keys: ((r: Record_) => number)[] = [
    (r) => winPct(r.w, r.l, r.t),
    division ? (r) => winPct(r.divW, r.divL, r.divT) : (r) => winPct(r.confW, r.confL, r.confT),
    (r) => winPct(r.confW, r.confL, r.confT),
    (r) => r.pf - r.pa,
    (r) => hashString(r.team) / 2 ** 32,
  ];
  for (const k of keys) {
    const d = k(b) - k(a);
    if (Math.abs(d) > 1e-9) return d;
  }
  return 0;
}

export function divisionStandings(state: GameState): { conference: string; division: string; rows: Record_[] }[] {
  const table = standings(state);
  const out = [];
  for (const conference of ["AFC", "NFC"] as const) {
    for (const division of ["East", "North", "South", "West"] as const) {
      const rows = TEAMS.filter((t) => t.conference === conference && t.division === division)
        .map((t) => table[t.id])
        .sort((a, b) => compare(a, b, true));
      out.push({ conference, division, rows });
    }
  }
  return out;
}

export function seedConference(state: GameState, conference: "AFC" | "NFC"): string[] {
  const divisions = divisionStandings(state).filter((d) => d.conference === conference);
  const winners = divisions.map((d) => d.rows[0]).sort((a, b) => compare(a, b, false));
  const winnerIds = new Set(winners.map((w) => w.team));
  const table = standings(state);
  const wildcards = TEAMS.filter((t) => t.conference === conference && !winnerIds.has(t.id))
    .map((t) => table[t.id])
    .sort((a, b) => compare(a, b, false))
    .slice(0, 3);
  return [...winners, ...wildcards].map((r) => r.team);
}

const slots = (round: PlayoffRound) => SCHEDULE.filter((g) => g.type === "POST" && g.round === round);

function winner(state: GameState, gameId: string): string | undefined {
  const r = state.results[gameId];
  if (!r) return undefined;
  return r.homeScore > r.awayScore ? r.home : r.away;
}

/** Wild Card weekend: 2v7, 3v6, 4v5 in each conference; the 1 seed rests. */
export function fillWildCard(state: GameState): void {
  const seeds = { AFC: seedConference(state, "AFC"), NFC: seedConference(state, "NFC") };
  state.seeds = seeds;
  const pairs: ["AFC" | "NFC", number, number][] = [
    ["AFC", 4, 5], ["NFC", 4, 5], ["AFC", 3, 6], ["NFC", 2, 7], ["AFC", 2, 7], ["NFC", 3, 6],
  ];
  slots("WC").forEach((g, i) => {
    const [conf, hi, lo] = pairs[i];
    state.playoffTeams[g.id] = { home: seeds[conf][hi - 1], away: seeds[conf][lo - 1] };
  });
}

function seedOf(state: GameState, team: string): number {
  const conf = TEAM_BY_ID[team].conference;
  return (state.seeds?.[conf].indexOf(team) ?? 99) + 1;
}

function survivors(state: GameState, round: PlayoffRound, conference: "AFC" | "NFC"): string[] {
  return slots(round)
    .map((g) => winner(state, g.id))
    .filter((t): t is string => !!t && TEAM_BY_ID[t].conference === conference);
}

/** Divisional round: the 1 seed hosts the lowest seed left, the other two play. */
export function fillDivisional(state: GameState): void {
  const games: { home: string; away: string }[] = [];
  for (const conf of ["AFC", "NFC"] as const) {
    const left = [state.seeds![conf][0], ...survivors(state, "WC", conf)].sort((a, b) => seedOf(state, a) - seedOf(state, b));
    games.push({ home: left[0], away: left[3] }, { home: left[1], away: left[2] });
  }
  const order = [games[0], games[2], games[1], games[3]]; // alternate conferences across the weekend
  slots("DIV").forEach((g, i) => { state.playoffTeams[g.id] = order[i]; });
}

export function fillConference(state: GameState): void {
  for (const g of slots("CONF")) {
    const left = survivors(state, "DIV", g.conference!).sort((a, b) => seedOf(state, a) - seedOf(state, b));
    state.playoffTeams[g.id] = { home: left[0], away: left[1] };
  }
}

export function fillSuperBowl(state: GameState): void {
  const sb = slots("SB")[0];
  const champ = (conf: "AFC" | "NFC") => winner(state, slots("CONF").find((g) => g.conference === conf)!.id)!;
  // Super Bowl LXI: the NFC champion is the designated home team.
  state.playoffTeams[sb.id] = { home: champ("NFC"), away: champ("AFC") };
}

export function matchup(state: GameState, game: ScheduledGame): { away: string; home: string } | null {
  if (game.away && game.home) return { away: game.away, home: game.home };
  return state.playoffTeams[game.id] ?? null;
}

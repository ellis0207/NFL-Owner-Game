// Games on the clock: each kicks off at its scheduled time, runs about three
// hours (shown a play at a time as the clock moves) and goes final at the
// whistle, when the result, the box score and the reports that follow land.
import { cancelGame, lockedOut } from "./labor";
import { businessGame } from "./business";
import { superBowlName } from "./calendar";
import { DAY, gameLength, minuteOf } from "./clock";
import { addDays, daysBetween, shortDate } from "./dates";
import { gameDayOps } from "./gameops";
import { digest, news, send } from "./inbox";
import { PLAYER_BY_ID, TEAM_BY_ID } from "./league";
import { knownReturn } from "./medical";
import { depthChart, gameDayElevations } from "./roster";
import { simulateGame } from "./sim";
import { teamStaff } from "./staff";
import { matchup, standings } from "./standings";
import { noteBox, stat } from "./stats";
import type { BoxScore, GameResult, GameState, Position, ScheduledGame } from "./types";

/** The schedule's name for a game: "Week 3", "Wild Card", the Super Bowl's numeral. */
export function gameTypeLabel(g: ScheduledGame): string {
  if (g.type === "PRE") return g.week === 0 ? "Hall of Fame Game" : `Preseason Week ${g.week}`;
  if (g.type === "REG") return `Week ${g.week}`;
  return { WC: "Wild Card", DIV: "Divisional Round", CONF: `${g.conference} Championship`, SB: g.label ?? superBowlName(Number(g.id.slice(0, 4))) }[g.round!];
}

/**
 * Kickoff: game-day practice squad elevations, then the whole game is played
 * out at once (so the result can't depend on when anyone looks) and kept as
 * live until the final whistle. Returns false when there's no game to play.
 */
export function kickoffGame(state: GameState, g: ScheduledGame): boolean {
  if (state.results[g.id] || state.live?.[g.id]) return true;
  const m = matchup(state, g);
  if (!m) return false;
  // No games are played during a lockout.
  if (lockedOut(state)) { cancelGame(state, g); return false; }
  if (g.type !== "PRE") {
    for (const team of [m.away, m.home]) {
      const up = gameDayElevations(state, team);
      if (team === state.userTeam && up.length) {
        digest(state, "roster", `Elevated ${up.map((id) => `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name}`).join(" and ")} from the practice squad for the ${shortDate(state.date)} game.`);
      }
    }
  }
  const { result, box, log } = simulateGame(state, g, m.away, m.home);
  const kick = minuteOf(g.timeET);
  (state.pbp ??= {})[g.id] = log;
  (state.live ??= {})[g.id] = { result, box, kick, end: Math.min(DAY, kick + gameLength(log.plays.length, !!result.overtime)) };
  return true;
}

/** The final whistle: the result and box score go in the books, then the gate, game-day operations and the reports. */
export function finishGame(state: GameState, g: ScheduledGame): GameResult | undefined {
  const live = state.live?.[g.id];
  if (!live) return state.results[g.id];
  delete state.live![g.id];
  if (!Object.keys(state.live!).length) delete state.live;
  const { result, box } = live;
  state.results[g.id] = result;
  state.box[g.id] = box;
  noteBox(state);
  gameDayOps(state, g, result);
  businessGame(state, g, result);
  reportGame(state, g, result, box);
  return result;
}

/** A whole game at once, kickoff to final. */
export function playGame(state: GameState, g: ScheduledGame): GameResult | undefined {
  if (state.results[g.id]) return state.results[g.id];
  if (!kickoffGame(state, g)) return undefined;
  return finishGame(state, g);
}

function reportGame(state: GameState, g: ScheduledGame, r: GameResult, box: BoxScore): void {
  const winnerHome = r.homeScore > r.awayScore;
  const tie = r.homeScore === r.awayScore;
  const line = tie
    ? `${r.away} and ${r.home} tie ${r.awayScore}-${r.homeScore}`
    : `${winnerHome ? r.home : r.away} ${Math.max(r.homeScore, r.awayScore)}, ${winnerHome ? r.away : r.home} ${Math.min(r.homeScore, r.awayScore)}${r.overtime ? " (OT)" : ""}`;
  news(state, "games", `${gameTypeLabel(g)}: ${line}`);
  // League injury news for starters.
  for (const inj of box.injuries) {
    if (inj.team === state.userTeam) continue;
    const pos = PLAYER_BY_ID[inj.player].position;
    const chart = depthChart(state, inj.team, addDays(state.date, -1));
    if (chart[pos].slice(0, STARTERS[pos] ?? 1).includes(inj.player) && state.players[inj.player].injury?.date === state.date) {
      const out = state.players[inj.player].injury!;
      if (daysBetween(state.date, out.returnDate) >= 7) {
        news(state, "games", `${TEAM_BY_ID[inj.team].name} ${pos} ${PLAYER_BY_ID[inj.player].name}: ${out.type.toLowerCase()}, ${outLabel(state.date, knownReturn(state, out), out.seasonEnding)}`);
      }
    }
  }
  const us = state.userTeam;
  if (r.away !== us && r.home !== us) return;
  const side = r.home === us ? "home" : "away";
  const ours = r.home === us ? r.homeScore : r.awayScore;
  const theirs = r.home === us ? r.awayScore : r.homeScore;
  const opp = r.home === us ? r.away : r.home;
  const verdict = ours > theirs ? "We won" : ours < theirs ? "We lost" : "We tied";
  const rec = standings(state)[us];
  const record = g.type === "REG" ? ` We're ${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ""}.` : "";
  const tone = g.type === "PRE"
    ? "Most of the starters sat, so the tape is mostly about the depth chart."
    : ours > theirs ? "Good week of work showed up on game day." : "We'll get it fixed on the practice field.";
  const hurt = box.injuries.filter((i) => i.team === us).map((i) => {
    const inj = state.players[i.player].injury;
    return `${PLAYER_BY_ID[i.player].name} (${i.type.toLowerCase()}${inj && inj.date === state.date ? `, ${outLabel(state.date, knownReturn(state, inj), inj.seasonEnding)}` : ", returned"})`;
  });
  const hc = teamStaff(us).HC?.name ?? "Head Coach";
  send(state, "game", `${hc}, head coach`, `${verdict} ${ours}-${theirs} against ${TEAM_BY_ID[opp].name}${r.overtime ? " in overtime" : ""}`,
    `${gameTypeLabel(g)}. ${tone}${record}\n\n${standouts(box, side)}` +
    (hurt.length ? `\n\nInjuries: ${hurt.join("; ")}.` : ""),
    g.id);
}

const STARTERS: Partial<Record<Position, number>> = { QB: 1, RB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, IDL: 2, LB: 2, CB: 3, S: 2, K: 1, P: 1 };

/** "out about 3 weeks", "out for the season" */
export function outLabel(from: string, returnDate: string, seasonEnding: boolean): string {
  if (seasonEnding) return "out for the season";
  const days = daysBetween(from, returnDate);
  if (days <= 3) return "day to day";
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? "out about a week" : `out about ${weeks} weeks`;
}

/** A coach's quick summary of who stood out for one team. */
function standouts(box: BoxScore, side: "away" | "home"): string {
  const lines = Object.entries(box.players[side]);
  const best = (key: Parameters<typeof stat>[1]) => lines.reduce<[string, number[]] | null>((a, b) => (stat(b[1], key) > (a ? stat(a[1], key) : 0) ? b : a), null);
  const out: string[] = [];
  const qb = best("att");
  if (qb) out.push(`${PLAYER_BY_ID[qb[0]].name} went ${stat(qb[1], "cmp")} of ${stat(qb[1], "att")} for ${stat(qb[1], "passYds")} yards, ${stat(qb[1], "passTd")} TD and ${stat(qb[1], "int")} INT.`);
  const rb = best("rushYds");
  if (rb && stat(rb[1], "rushYds") >= 40) out.push(`${PLAYER_BY_ID[rb[0]].name} ran for ${stat(rb[1], "rushYds")} yards on ${stat(rb[1], "car")} carries.`);
  const wr = best("recYds");
  if (wr && stat(wr[1], "recYds") >= 40) out.push(`${PLAYER_BY_ID[wr[0]].name} caught ${stat(wr[1], "rec")} for ${stat(wr[1], "recYds")} yards.`);
  const sacker = best("sacks");
  if (sacker && stat(sacker[1], "sacks") >= 1) out.push(`${PLAYER_BY_ID[sacker[0]].name} had ${stat(sacker[1], "sacks")} sack${stat(sacker[1], "sacks") === 1 ? "" : "s"}.`);
  const picker = best("defInt");
  if (picker && stat(picker[1], "defInt") >= 1) out.push(`${PLAYER_BY_ID[picker[0]].name} picked one off.`);
  return out.join(" ");
}
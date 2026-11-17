// Leaf module: how the coverage reads for a club, a player and the owner, for
// the systems that feel it (fans, sponsors, agents, CPU owners, free agents,
// the league office, voters). Written by media/coverage.ts each day; read here
// without pulling the media code into the systems that ask.
import type { GameState } from "../types";

/** The tone of a club's coverage lately, -50 (savaged) to 50 (glowing); 0 is neutral. */
export function pressTone(state: GameState, team: string): number {
  return state.media?.climate?.tone[team] ?? 0;
}

/** How a player is being written about lately, -50 to 50. */
export function playerPress(state: GameState, id: string): number {
  return state.media?.climate?.players[id] ?? 0;
}

/** How closely the league office is watching what our owner says in public, 0-100. */
export function leagueAttention(state: GameState): number {
  return state.media?.climate?.league ?? 0;
}

/** Guest columns the owner has run on a topic since a date (the stadium column feeds the vote). */
export function opEdsSince(state: GameState, topic: string, since: string): number {
  return (state.media?.desk?.opeds ?? []).filter((o) => o.topic === topic && o.date >= since).length;
}

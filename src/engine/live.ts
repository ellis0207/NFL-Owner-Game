// Players who can still take part: everyone but the retired. Retired players
// stay in the save for history, so after a few decades they outnumber the
// league's working players; daily loops walk this list instead of all of them.
// Rebuilt each day and whenever a player is added. A player who retires
// during the day stays on the list until the next rebuild, so loops still
// check status as they did before.
import type { GameState } from "./types";

const cache = new WeakMap<object, { date: string; n: number; ids: string[] }>();

export function liveIds(state: GameState): string[] {
  const all = Object.keys(state.players);
  const c = cache.get(state.players);
  if (c && c.date === state.date && c.n === all.length) return c.ids;
  const ids = all.filter((id) => state.players[id].status !== "retired");
  cache.set(state.players, { date: state.date, n: all.length, ids });
  return ids;
}

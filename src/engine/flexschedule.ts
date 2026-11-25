// Opponents for a league that isn't 32 clubs in eight divisions of four:
// after expansion, two divisions hold five clubs. The league keeps what it
// can of the usual shape. Every club plays its division home and away, then
// fills the season with conference and cross-conference games, no opponent
// twice, and each club gets as close to half its games at home as the count
// allows. The standard 32-club rotation in calendar.ts is untouched.
import { TEAMS } from "./league";
import type { Rng } from "./rng";

export interface FlexPairing { away: string; home: string; division: boolean }

/** True when the league is the usual 32 clubs, four to a division. */
export function standardLeague(): boolean {
  if (TEAMS.length !== 32) return false;
  const size: Record<string, number> = {};
  for (const t of TEAMS) size[`${t.conference}-${t.division}`] = (size[`${t.conference}-${t.division}`] ?? 0) + 1;
  return Object.values(size).every((n) => n === 4);
}

function divKey(id: string): string {
  const t = TEAMS.find((x) => x.id === id)!;
  return `${t.conference}-${t.division}`;
}

/** Pairings for any division sizes, or null if this draw didn't work out (the caller tries again). */
function attempt(rng: Rng, games: number): FlexPairing[] | null {
  const ids = TEAMS.map((t) => t.id);
  const div = Object.fromEntries(ids.map((id) => [id, divKey(id)]));
  const conf = Object.fromEntries(TEAMS.map((t) => [t.id, t.conference]));
  const out: FlexPairing[] = [];
  const need: Record<string, number> = {};
  const met = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  // The division, home and away.
  for (const a of ids) {
    const mates = ids.filter((b) => b !== a && div[b] === div[a]);
    need[a] = games - 2 * mates.length;
    for (const b of mates) if (a < b) {
      out.push({ home: a, away: b, division: true }, { home: b, away: a, division: true });
      met.add(key(a, b));
    }
  }
  if (Object.values(need).some((n) => n < 0)) return null;
  // The rest: the club with the most games left picks first, conference rivals a little more often.
  const edges: [string, string][] = [];
  const swapIn = (a: string, b: string | null): boolean => {
    for (let n = 0; n < 60; n++) {
      const i = Math.floor(rng() * edges.length);
      if (i >= edges.length) return false;
      const [c, d] = edges[i];
      if (c === a || d === a || c === b || d === b) continue;
      if (need[a] >= 2 && !met.has(key(a, c)) && !met.has(key(a, d))) {
        met.delete(key(c, d));
        edges.splice(i, 1, [a, c], [a, d]);
        met.add(key(a, c)); met.add(key(a, d));
        need[a] -= 2;
        return true;
      }
      if (b && (!met.has(key(a, c)) && !met.has(key(b, d)) || !met.has(key(a, d)) && !met.has(key(b, c)))) {
        const [x, y] = !met.has(key(a, c)) && !met.has(key(b, d)) ? [c, d] : [d, c];
        met.delete(key(c, d));
        edges.splice(i, 1, [a, x], [b, y]);
        met.add(key(a, x)); met.add(key(b, y));
        need[a]--; need[b]--;
        return true;
      }
    }
    return false;
  };
  for (;;) {
    const open = ids.filter((t) => need[t] > 0);
    if (!open.length) break;
    const top = Math.max(...open.map((t) => need[t]));
    const firsts = open.filter((t) => need[t] === top);
    const a = firsts[Math.floor(rng() * firsts.length)];
    const cands = open.filter((b) => b !== a && !met.has(key(a, b)));
    if (!cands.length) {
      // Everyone left has already met him: break up a game between two clubs he hasn't played and
      // give him both (or one, with another club still short taking the other).
      if (!swapIn(a, open.find((b) => b !== a) ?? null)) return null;
      continue;
    }
    const w = cands.map((b) => (conf[b] === conf[a] ? 1.6 : 1) * (need[b] + 0.5));
    let r = rng() * w.reduce((s, x) => s + x, 0);
    let i = 0;
    while (i < cands.length - 1 && (r -= w[i]) > 0) i++;
    const b = cands[i];
    edges.push([a, b]);
    met.add(key(a, b));
    need[a]--;
    need[b]--;
  }
  // Home and away: walk the games as closed trails (each trail enters a club as often as it leaves), so
  // every club hosts exactly half its games. With an odd count, a stand-in club joins the clubs left odd
  // and its games are dropped afterwards, so they end one game from even.
  const host = orient(rng, ids, edges);
  if (!host) return null;
  edges.forEach(([a, b], i) => out.push({ home: host[i], away: host[i] === a ? b : a, division: false }));
  return out;
}

/** Picks a host for each game so every club hosts half its games (within one when its count is odd). */
function orient(rng: Rng, ids: string[], edges: [string, string][]): string[] | null {
  const ghost = "\u0000";
  const all: [string, string][] = [...edges];
  const deg: Record<string, number> = {};
  for (const [a, b] of edges) { deg[a] = (deg[a] ?? 0) + 1; deg[b] = (deg[b] ?? 0) + 1; }
  for (const t of ids) if ((deg[t] ?? 0) % 2) all.push([t, ghost]);
  const adj: Record<string, number[]> = {};
  all.forEach(([a, b], i) => { (adj[a] ??= []).push(i); (adj[b] ??= []).push(i); });
  for (const list of Object.values(adj)) for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  const used = new Array(all.length).fill(false);
  const from: string[] = new Array(all.length);
  // Hierholzer's walk from every club with games left: each step leaves the current club by an unused game.
  for (const start of [...ids, ghost]) {
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const list = adj[v] ?? [];
      while (list.length && used[list[list.length - 1]]) list.pop();
      if (!list.length) { stack.pop(); continue; }
      const e = list.pop()!;
      used[e] = true;
      from[e] = v;
      stack.push(all[e][0] === v ? all[e][1] : all[e][0]);
    }
  }
  if (used.some((u) => !u)) return null;
  // The club a trail leaves is the visitor, so the one it reaches is the host.
  return edges.map(([a, b], i) => (from[i] === a ? b : a));
}

/** Every club's opponents for the season in a league of any shape. */
export function flexPairings(rng: Rng, games: number): FlexPairing[] {
  for (let tries = 0; tries < 400; tries++) {
    const p = attempt(rng, games);
    if (p) return p;
  }
  throw new Error("Could not pair the league's opponents");
}

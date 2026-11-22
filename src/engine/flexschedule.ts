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
  for (;;) {
    const open = ids.filter((t) => need[t] > 0);
    if (!open.length) break;
    const top = Math.max(...open.map((t) => need[t]));
    const firsts = open.filter((t) => need[t] === top);
    const a = firsts[Math.floor(rng() * firsts.length)];
    const cands = open.filter((b) => b !== a && !met.has(key(a, b)));
    if (!cands.length) return null;
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
  // Home and away: each game goes to the club with fewer home games so far, then a few flips even it out.
  const home: Record<string, number> = Object.fromEntries(ids.map((t) => [t, ids.filter((b) => b !== t && div[b] === div[t]).length]));
  const order = edges.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const host: string[] = new Array(edges.length);
  for (const i of order) {
    const [a, b] = edges[i];
    const h = home[a] < home[b] || (home[a] === home[b] && rng() < 0.5) ? a : b;
    host[i] = h;
    home[h]++;
  }
  const hi = Math.ceil(games / 2);
  const lo = Math.floor(games / 2);
  for (let pass = 0; pass < 6; pass++) {
    let fixed = true;
    for (let i = 0; i < edges.length; i++) {
      const h = host[i];
      const a = edges[i][0] === h ? edges[i][1] : edges[i][0];
      if (home[h] > hi && home[a] < hi) { host[i] = a; home[h]--; home[a]++; }
      else if (home[a] < lo && home[h] > lo) { host[i] = a; home[h]--; home[a]++; }
    }
    for (const t of ids) if (home[t] > hi || home[t] < lo) fixed = false;
    if (fixed) break;
  }
  if (ids.some((t) => home[t] > hi || home[t] < lo)) return null;
  edges.forEach(([a, b], i) => out.push({ home: host[i], away: host[i] === a ? b : a, division: false }));
  return out;
}

/** Every club's opponents for the season in a league of any shape. */
export function flexPairings(rng: Rng, games: number): FlexPairing[] {
  for (let tries = 0; tries < 400; tries++) {
    const p = attempt(rng, games);
    if (p) return p;
  }
  throw new Error("Could not pair the league's opponents");
}

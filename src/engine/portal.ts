// The transfer portal, for the players we track (next year's draft class and
// the one after it). Two windows: three weeks in December after the
// conference title games, and ten days in April after spring practice. A
// quarterback stuck behind a better one leaves most often; so do players
// buried on a crowded depth chart, players whose coach was fired, and the
// standouts at smaller schools who want a bigger stage. Each one picks a
// program near his own level that needs him. He plays there from the next
// season on: the move takes effect at the rollover, so this season's game
// logs stay with the school he played for.
import { addDays } from "./dates";
import { collegePlayer, COLLEGE_SEASON } from "./college";
import { cfbDate, COLLEGE_TEAM, COLLEGE_TEAMS, CONFERENCES, schoolName } from "./collegeData";
import { draftClass, type DraftClass } from "./prospects";
import { news } from "./inbox";
import { RULES } from "./league";
import { gaussian, rngFor } from "./rng";
import { cfbFact, schoolSlots } from "./cfbmedia";
import type { GameState, Position } from "./types";

const WINTER = "2026-12-09";
const SPRING = "2027-04-16";

function windows(): { open: string; days: number; share: number }[] {
  return [{ open: cfbDate(WINTER), days: 20, share: 0.75 }, { open: cfbDate(SPRING), days: 9, share: 0.25 }];
}

const GROUP: Partial<Record<Position, string>> = { OT: "OL", OG: "OL", C: "OL", EDGE: "DL", IDL: "DL", CB: "DB", S: "DB", FB: "RB" };
const group = (p: Position) => GROUP[p] ?? p;

/** The classes still in school next fall, as the portal sees them. */
function classes(state: GameState): DraftClass[] {
  return [draftClass(state.seed, COLLEGE_SEASON + 2), draftClass(state.seed, COLLEGE_SEASON + 3)];
}

/** Who is ahead of whom at each school next fall (level on the production scale, engine only). */
function depth(cls: DraftClass[]): Record<string, Record<string, { id: string; lvl: number }[]>> {
  const out: Record<string, Record<string, { id: string; lvl: number }[]>> = {};
  cls.forEach((dc, i) => {
    for (const p of dc.prospects) {
      const h = dc.hidden[p.id];
      const lvl = h.college - i * (3 + Math.max(0, h.potential - h.overall) * 0.3);
      ((out[p.school] ??= {})[group(p.position)] ??= []).push({ id: p.id, lvl });
    }
  });
  for (const s of Object.values(out)) for (const g of Object.values(s)) g.sort((a, b) => b.lvl - a.lvl);
  return out;
}

const ROOM: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1, OL: 4, DL: 3, LB: 2, DB: 3, K: 1, P: 1, LS: 1 };

function enter(state: GameState, open: string, share: number): void {
  const w = state.cfb!;
  const portal = (w.portal ??= {});
  const cls = classes(state);
  const d = depth(cls);
  const since = addDays(open, -60);
  const shaken = new Set(w.log.filter((m) => m.date >= since && m.kind !== "hired").map((m) => m.team));
  cls.forEach((dc, ci) => {
    const order = dc.prospects.map((p) => p.id).sort((a, b) => dc.hidden[b].value - dc.hidden[a].value);
    const rankOf = Object.fromEntries(order.map((id, i) => [id, i]));
    for (const p of dc.prospects) {
      if (portal[p.id]) continue;
      const g = group(p.position);
      const room = d[p.school]?.[g] ?? [];
      const at = room.findIndex((x) => x.id === p.id);
      let chance = 0.02;
      if (at >= (ROOM[g] ?? 2)) chance += g === "QB" ? 0.4 : 0.15;
      if (shaken.has(p.school)) chance += 0.08;
      const small = !CONFERENCES[COLLEGE_TEAM[p.school].conference]?.power;
      const up = small && rankOf[p.id] < 150;
      if (up) chance += ci === 0 ? 0.2 : 0.1;
      if (rngFor(state.seed, `portal:${open}:${p.id}`)() >= chance * share) continue;
      const day = addDays(open, 2 + Math.floor(rngFor(state.seed, `portal-day:${p.id}`)() * 16));
      portal[p.id] = [p.school, up ? "+" : "", day];
    }
  });
}

/** Where he goes: a program near his level that needs him, the bigger stage for a standout. */
function destination(state: GameState, id: string, from: string, up: boolean): string {
  const w = state.cfb!;
  const p = collegePlayer(state, id) ?? classes(state).map((dc) => dc.byId[id]).find(Boolean);
  if (!p) return from;
  const dc = classes(state).find((x) => x.byId[id]) ?? classes(state)[0];
  const h = dc.hidden[id];
  const want = 64 + (h.value - 62) * 0.9 + (up ? 6 : 0);
  const d = depth(classes(state));
  const g = group(p.position);
  let best = from;
  let top = -Infinity;
  for (const t of COLLEGE_TEAMS) {
    if (t.id === from) continue;
    const s = w.programs[t.id].strength;
    const room = (d[t.id]?.[g] ?? []).filter((x) => x.id !== id && x.lvl > h.college - 2).length;
    let x = -Math.abs(want - s) / 7 - room * (g === "QB" ? 1.6 : 0.5) + gaussian(rngFor(state.seed, `portal-fit:${id}:${t.id}`)) * 0.7;
    if (up && CONFERENCES[t.conference]?.power) x += 1.2;
    if (t.region === COLLEGE_TEAM[from].region) x += 0.3;
    if (x > top) {
      top = x;
      best = t.id;
    }
  }
  return best;
}

export function portalDaily(state: GameState): void {
  const w = state.cfb;
  if (!w) return;
  for (const win of windows()) if (state.date === win.open) enter(state, win.open, win.share);
  for (const [id, e] of Object.entries(w.portal ?? {})) {
    if (e[2] !== state.date || (e[1] && e[1] !== "+")) continue;
    const to = destination(state, id, e[0], e[1] === "+");
    e[1] = to;
    const dc = classes(state).find((x) => x.byId[id]);
    const p = dc?.byId[id];
    if (!dc || !p || to === e[0]) continue;
    const rank = dc.prospects.map((x) => dc.hidden[x.id].value).filter((v) => v > dc.hidden[id].value).length + 1;
    if (rank > 200 && p.position !== "QB") continue;
    const up = !CONFERENCES[COLLEGE_TEAM[e[0]].conference]?.power && !!CONFERENCES[COLLEGE_TEAM[to].conference]?.power;
    news(state, "college", `CFB · Transfer: ${p.position} ${p.name} leaves ${schoolName(e[0])} for ${schoolName(to)}`);
    cfbFact(state, "portal", 30 + Math.max(0, 200 - rank) / 6 + (p.position === "QB" ? 8 : 0), {
      P: { name: p.name, pos: p.position, line: "" }, F: schoolSlots(state, e[0]), S: schoolSlots(state, to),
    }, { up, qb: p.position === "QB" });
  }
}

/** At the rollover: everyone who found a school plays there now; the portal empties. */
export function portalRollover(state: GameState): void {
  const w = state.cfb!;
  const tr = (w.transfers ??= {});
  for (const [id, [from, to]] of Object.entries(w.portal ?? {})) {
    if (!to || to === "+" || to === from) continue;
    for (const year of [RULES.season + 1, RULES.season + 2]) {
      if (draftClass(state.seed, year).byId[id]) (tr[year] ??= {})[id] = to;
    }
  }
  w.portal = {};
  for (const y of Object.keys(tr)) if (Number(y) <= RULES.season) delete tr[Number(y)];
}

/** This offseason's portal, newest moves first: player, old school, new school (empty while he's looking), date. */
export function portalMoves(state: GameState): { id: string; name: string; position: Position; from: string; to: string; date: string }[] {
  const out = [];
  const cls = classes(state);
  for (const [id, [from, to, date]] of Object.entries(state.cfb?.portal ?? {})) {
    const p = cls.map((dc) => dc.byId[id]).find(Boolean);
    if (!p) continue;
    out.push({ id, name: p.name, position: p.position, from, to: to === "+" ? "" : to, date });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

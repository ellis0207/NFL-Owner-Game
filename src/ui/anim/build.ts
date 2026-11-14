// Works a row of the play-by-play out into 22 moving players and a ball.
//
// The result is already in the log; this only decides how to show it. The
// offense follows the play book drawn in Blender (formations, routes, the
// back's path on a handoff), the defense lines up against what it sees and
// reacts, and every play is bent so it ends exactly where the sim said it did:
// the carrier goes down on the spot, the man the feed credits makes the
// tackle, the pass is caught by the man it was thrown to. No hidden rating is
// used: everyone moves at the same football pace.
//
// Plays are built in "play space": yards from the ball at the snap, x toward
// the goal the offense attacks and y toward the offense's left. `finish`
// turns that into field yards for the drawing.
import { castAt, fieldX } from "../../engine/gamecast";
import { PLAYER_BY_ID } from "../../engine/league";
import { STAT_INDEX } from "../../engine/stats";
import type { GameLog } from "../../engine/types";
import { ACT, sample, type Call, type PlayBook, type Slot, type Track } from "./book";
import { playerNamed, readCall } from "./read";

const RATE = 20, DT = 1 / RATE;
const RUN = 7.8;        // yards a second with the ball in the open field
const CHASE = 6.9;      // a defender in pursuit
const TRENCH = 4.3;     // a lineman working off a block
// The route tree was drawn at a sprint; receivers run it a little under that.
const PACE = 0.85;
const HASH = 3.1;       // the hash marks, yards from the middle of the field
const SIDELINE = 26.2;

type P = [number, number];
type Move = (s: number, me: Man, sc: Scene) => void;

interface Man {
  team: 0 | 1;
  group: string;
  body: "skill" | "line";
  id: string | null;
  slot: Slot | null;
  x: number;
  y: number;
  /** Where he lined up. */
  x0: number;
  y0: number;
  /** What he does, each from a time on; the latest one that has begun is in force. */
  phases: [number, Move][];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const ease = (k: number) => { const c = clamp(k, 0, 1); return c * c * (3 - 2 * c); };

/** A fraction that is always the same for the same row and purpose: variety without touching the game's dice. */
function frac(n: number, k: number): number {
  let h = (Math.imul(n + 1, 2654435761) ^ Math.imul(k + 7, 40503)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 8) / 16777216;
}

/** A path through timed points, easing in and out of each leg; it holds the last point. */
function line(pts: [number, number, number][]): (s: number) => P {
  return (s) => {
    if (s <= pts[0][0]) return [pts[0][1], pts[0][2]];
    for (let i = 1; i < pts.length; i++) {
      if (s <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i], k = ease((s - a[0]) / Math.max(1e-6, b[0] - a[0]));
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      }
    }
    const z = pts[pts.length - 1];
    return [z[1], z[2]];
  };
}

/** The same, at a steady pace: a man already running, who doesn't slow at each turn. */
function steady(pts: [number, number, number][]): (s: number) => P {
  return (s) => {
    if (s <= pts[0][0]) return [pts[0][1], pts[0][2]];
    for (let i = 1; i < pts.length; i++) {
      if (s <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i], k = (s - a[0]) / Math.max(1e-6, b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      }
    }
    const z = pts[pts.length - 1];
    return [z[1], z[2]];
  };
}

/** Follow a set path. */
const rail = (f: (s: number) => P): Move => (s, me) => { const p = f(s); me.x = p[0]; me.y = p[1]; };
/** Head for a moving target at a top speed, stopping short of it by `stop` yards. */
const toward = (target: (s: number, sc: Scene, me: Man) => P, speed: number, stop = 0): Move => (s, me, sc) => {
  const [tx, ty] = target(s, sc, me);
  const dx = tx - me.x, dy = ty - me.y, far = Math.hypot(dx, dy);
  const step = Math.min(Math.max(0, far - stop), speed * DT);
  if (far > 1e-6) { me.x += dx / far * step; me.y += dy / far * step; }
};
/** Be at a point at a time, from wherever he is when this begins. */
const reach = (to: P, at: number): Move => {
  let s0 = -1, x0 = 0, y0 = 0;
  return (s, me) => {
    if (s0 < 0) { s0 = s - DT; x0 = me.x; y0 = me.y; }
    const k = ease((s - s0) / Math.max(DT, at - s0));
    me.x = x0 + (to[0] - x0) * k; me.y = y0 + (to[1] - y0) * k;
  };
};

class Scene {
  men: Man[] = [];
  /** The ball each frame: x, y, height, and who holds it (-1 nobody). */
  ballAt: (s: number, sc: Scene) => [number, number, number, number] = () => [0, 0, 0, -1];

  add(team: 0 | 1, group: string, id: string | null, at: P, slot?: Slot | null): number {
    const p = id ? PLAYER_BY_ID[id] : undefined;
    this.men.push({
      team, group, id, body: group === "OL" || group === "IDL" || group === "EDGE" ? "line" : "skill",
      slot: slot !== undefined ? slot : id ? { id, number: p?.jersey ?? null, name: p?.lastName ?? p?.name ?? "" } : null,
      x: at[0], y: at[1], x0: at[0], y0: at[1], phases: [],
    });
    return this.men.length - 1;
  }

  /** From `from` seconds on, man `i` does this. */
  then(i: number, from: number, move: Move): void {
    if (i >= 0) this.men[i].phases.push([from, move]);
  }

  at(i: number): P { return [this.men[i].x, this.men[i].y]; }
  of(team: 0 | 1): number[] { return this.men.map((m, i) => (m.team === team ? i : -1)).filter((i) => i >= 0); }
  byId(id: string | undefined): number { return id ? this.men.findIndex((m) => m.id === id) : -1; }
  group(team: 0 | 1, g: string): number[] { return this.men.map((m, i) => (m.team === team && m.group === g ? i : -1)).filter((i) => i >= 0); }

  /** Plays it through and keeps every frame. */
  run(dur: number): Take {
    const frames = Math.ceil(dur * RATE) + 1;
    const pos = this.men.map(() => new Float32Array(frames * 2));
    const ball = new Float32Array(frames * 3), holder = new Int8Array(frames);
    for (const m of this.men) m.phases.sort((a, b) => a[0] - b[0]);
    for (let f = 0; f < frames; f++) {
      const s = f / RATE;
      this.men.forEach((m, i) => {
        let move: Move | null = null;
        for (const [from, mv] of m.phases) if (from <= s + 1e-9) move = mv;
        if (move && f > 0) move(s, m, this);
        pos[i][f * 2] = m.x; pos[i][f * 2 + 1] = m.y;
      });
      const b = this.ballAt(s, this);
      ball[f * 3] = b[0]; ball[f * 3 + 1] = b[1]; ball[f * 3 + 2] = b[2]; holder[f] = b[3];
    }
    return { frames, pos, ball, holder, act: this.men.map(() => new Uint8Array(frames)), face: this.men.map(() => new Int8Array(frames).fill(-1)), named: [] };
  }
}

interface Take {
  frames: number;
  pos: Float32Array[];
  ball: Float32Array;
  holder: Int8Array;
  act: Uint8Array[];
  face: Int8Array[];
  named: Track["named"];
}

const fr = (s: number) => Math.max(0, Math.round(s * RATE));

/** Marks what a man is doing between two times. */
function mark(t: Take, i: number, from: number, to: number, act: number): void {
  if (i >= 0) t.act[i].fill(act, Math.min(t.frames, fr(from)), Math.min(t.frames, fr(to)));
}

/**
 * Has a man break for a spot early enough to be there at frame `e` at a run,
 * not a teleport; `hold` keeps him there afterward (a tackler on the pile).
 */
function arrive(t: Take, i: number, e: number, spot: P, hold: boolean, shy = 0.5, carryOn = true): void {
  const p = t.pos[i];
  e = Math.min(t.frames - 1, e);
  let span = Math.min(e, Math.round(0.4 * RATE));
  while (span < e && Math.hypot(spot[0] - p[(e - span) * 2], spot[1] - p[(e - span) * 2 + 1]) / span * RATE > 8.4) span++;
  span = Math.max(1, span);
  const sx = p[(e - span) * 2], sy = p[(e - span) * 2 + 1];
  const far = Math.hypot(spot[0] - sx, spot[1] - sy) || 1;
  const hx = spot[0] - (spot[0] - sx) / far * shy, hy = spot[1] - (spot[1] - sy) / far * shy;
  // A man who isn't held there carries on from the spot with whatever he was going to do next.
  const ox = hx - p[e * 2], oy = hy - p[e * 2 + 1];
  for (let f = e - span; f < t.frames; f++) {
    if (f > e && !hold) { if (!carryOn) break; p[f * 2] += ox; p[f * 2 + 1] += oy; continue; }
    const k = Math.min(1, (f - (e - span)) / span);
    p[f * 2] = sx + (hx - sx) * k; p[f * 2 + 1] = sy + (hy - sy) * k;
  }
}

/** The nearest of some men to a spot at a frame. */
function nearest(t: Take, who: number[], f: number, spot: P): number {
  let best = -1, far = Infinity;
  f = Math.min(t.frames - 1, f);
  for (const i of who) {
    const d = Math.hypot(t.pos[i][f * 2] - spot[0], t.pos[i][f * 2 + 1] - spot[1]);
    if (d < far) { far = d; best = i; }
  }
  return best;
}

/**
 * Who makes a play at a spot: the man the log credits if he can get there,
 * and if he is across the field, the nearest man, drawn as him.
 */
function standIn(sc: Scene, t: Take, named: number, pool: number[], e: number, spot: P): number {
  const close = nearest(t, pool, e, spot);
  if (close < 0 || named < 0 || !pool.includes(named) || named === close) return close;
  if (Math.hypot(t.pos[named][e * 2] - spot[0], t.pos[named][e * 2 + 1] - spot[1]) < 5) return named;
  const a = sc.men[named], b = sc.men[close];
  [a.id, b.id] = [b.id, a.id];
  [a.slot, b.slot] = [b.slot, a.slot];
  return close;
}

/** Brings a ball carrier down at `end`: the credited tackler (or the nearest man) gets there, and both go to ground. */
function tackle(sc: Scene, t: Take, carrier: number, end: number, by: number[], id: string | undefined): number {
  const e = Math.min(t.frames - 1, fr(end));
  const spot: P = [t.pos[carrier][e * 2], t.pos[carrier][e * 2 + 1]];
  const tackler = standIn(sc, t, sc.byId(id), by, e, spot);
  if (tackler < 0) return -1;
  arrive(t, tackler, e, spot, true);
  mark(t, carrier, end, 99, ACT.fall);
  mark(t, tackler, end - 0.15, 99, ACT.fall);
  t.named.push({ who: tackler, from: e, to: t.frames });
  return tackler;
}

/**
 * A ball carrier's path cut to the play's gain: he follows `path` until he
 * reaches `gain` yards (never before `earliest`), and a scorer runs on into the end zone.
 */
function carry(path: (s: number) => P, gain: number, earliest: number, score: boolean): { end: number; f: (s: number) => P } {
  let end = earliest;
  while (path(end)[0] < gain && end < 30) end += DT;
  const over = Math.max(0, path(end)[0] - gain);
  return {
    end,
    f: (s) => {
      const p = path(Math.min(s, end));
      p[0] -= over * ease(s / end);
      if (score && s > end) p[0] += Math.min(4, (s - end) * RUN * 0.8);
      return p;
    },
  };
}

/** After `free`, keep going straight downfield at a run. */
const openField = (path: (s: number) => P, free: number) => (s: number): P => {
  if (s <= free) return path(s);
  const p = path(free);
  return [p[0] + (s - free) * RUN, p[1]];
};

// ---- Lining up ----

interface Offense { qb: number; rb: number; fb: number; wr: number[]; te: number[]; ol: number[]; c: number; eligible: number[] }

/** The offense in its formation. `flip` puts the strong side on the other side. */
function offense(sc: Scene, book: PlayBook, call: Call, groups: string[][], flip: 1 | -1): Offense {
  const [qbs, rbs, fbs, wrs, tes, ol] = groups;
  const personnel = fbs.length ? "21" : wrs.length >= 4 ? "10" : wrs.length === 3 ? "11" : wrs.length === 2 ? "12" : "13";
  const spots = (book.formations[call.formation] ?? book.formations["Under center"])[personnel];
  const put = (g: string, ids: (string | null)[]) => ids.map((id, i) => {
    const s = spots[g][i] ?? [spots[g].at(-1)?.[0] ?? -1.5, (spots[g].at(-1)?.[1] ?? 6) + 2.5 * (i + 1)];
    return sc.add(0, g, id, [s[0], g === "OL" ? s[1] : s[1] * flip]);
  });
  // The sim lists the line as tackles, guards, center; the drawing wants it left to right.
  const order = [0, 2, 4, 3, 1].map((i) => ol[i] ?? null);
  const line5 = put("OL", order);
  const qb = put("QB", [qbs[0] ?? null])[0];
  const rb = rbs.length ? put("RB", [rbs[0]])[0] : -1;
  const fb = fbs.length ? put("FB", [fbs[0]])[0] : -1;
  const wr = put("WR", wrs), te = put("TE", tes);
  return { qb, rb, fb, wr, te, ol: line5, c: line5[2], eligible: [...wr, ...te, ...(rb >= 0 ? [rb] : []), ...(fb >= 0 ? [fb] : [])] };
}

interface Defense { rush: number[]; lb: number[]; cb: number[]; s: number[]; cover: Map<number, number>; zone: Map<number, P>; blitzer: number }

/** The defense, lined up against what the offense shows: a front, linebackers behind it, corners over the widest receivers, safeties by the shell. */
function defense(sc: Scene, call: Call, groups: string[][], o: Offense): Defense {
  const [edge, idl, lb, cb, s] = groups;
  const strong = Math.sign(o.te.length ? sc.men[o.te[0]].y : -1) || -1;
  // The front: tackles inside, ends outside; a third and fourth edge player stand up wide.
  const front = [edge[0], ...idl, edge[1]].filter((id) => id !== undefined);
  const rush = front.map((id, i) => sc.add(1, i === 0 || i === front.length - 1 ? "EDGE" : "IDL", id ?? null,
    [1.0, ((front.length - 1) / 2 - i) * 2.7 + (i === 0 ? 0.7 : i === front.length - 1 ? -0.7 : 0)]));
  edge.slice(2).forEach((id, i) => rush.push(sc.add(1, "EDGE", id, [1.6, (i ? -1 : 1) * 7.2])));
  const lbs = lb.map((id, i) => sc.add(1, "LB", id, [4.6, ((lb.length - 1) / 2 - i) * 3.7 + strong * 0.6]));
  // Corners take the widest receivers, one a side first.
  const wide = [...o.wr, ...o.te.filter((i) => Math.abs(sc.men[i].y) > 7), ...(o.rb >= 0 && sc.men[o.rb].x > -2 ? [o.rb] : [])]
    .sort((a, b) => Math.abs(sc.men[b].y) - Math.abs(sc.men[a].y));
  const depth = call.man ? 2.2 : 6.5;
  const cover = new Map<number, number>();
  const cbs = cb.map((id, i) => {
    const r = wide[i];
    const at: P = r === undefined ? [7, (i % 2 ? -1 : 1) * 6] : [depth + (i > 1 ? 1.5 : 0), sc.men[r].y - Math.sign(sc.men[r].y) * 0.6];
    const me = sc.add(1, "CB", id, at);
    if (r !== undefined) cover.set(me, r);
    return me;
  });
  const ss = s.map((id, i) => {
    const at: P = call.twoHigh ? (i < 2 ? [12.5, (i ? -1 : 1) * 7.5] : [9, 0]) : i === 0 ? [13.5, 0] : i === 1 ? [7.5, strong * 6] : [9, -strong * 5];
    return sc.add(1, "S", id, at);
  });
  // In man coverage whoever is left is picked up by the strong safety and the linebackers.
  const left = o.eligible.filter((r) => ![...cover.values()].includes(r));
  const spare = [...(call.twoHigh ? ss.slice(2) : ss.slice(1)), ...lbs];
  left.forEach((r, i) => { if (spare[i] !== undefined) cover.set(spare[i], r); });
  // In zone everyone has a patch of grass.
  const zone = new Map<number, P>();
  cbs.forEach((me, i) => zone.set(me, i > 1 ? [6.5, Math.sign(sc.men[me].y || 1) * 8] : call.twoHigh ? [5.5, Math.sign(sc.men[me].y || 1) * 15] : [13, Math.sign(sc.men[me].y || 1) * 15.5]));
  lbs.forEach((me) => zone.set(me, [6.5, sc.men[me].y * 1.3]));
  ss.forEach((me, i) => zone.set(me, call.twoHigh ? (i < 2 ? [16.5, (i ? -1 : 1) * 8.5] : [9, 0]) : i === 0 ? [17, 0] : [8.5, sc.men[me].y * 1.3]));
  const blitzer = call.blitz && lbs.length ? lbs[0] : -1;
  if (blitzer >= 0) { sc.men[blitzer].x = sc.men[blitzer].x0 = 2.4; cover.delete(blitzer); }
  return { rush, lb: lbs, cb: cbs, s: ss, cover, zone, blitzer };
}

/** Each side's most-used players by position, for logs that don't say who was on the field. */
function boxGroups(players: Record<string, number[]> | undefined, off: boolean): string[][] {
  const snaps = off ? STAT_INDEX.offSnaps : STAT_INDEX.defSnaps;
  const want: [string, number][] = off ? [["QB", 1], ["RB", 1], ["FB", 0], ["WR", 3], ["TE", 1], ["OT", 2], ["OG", 2], ["C", 1]] : [["EDGE", 2], ["IDL", 2], ["LB", 2], ["CB", 3], ["S", 2]];
  const by = want.map(([position, n]) => Object.keys(players ?? {}).filter((id) => PLAYER_BY_ID[id]?.position === position)
    .sort((a, b) => (players![b][snaps] ?? 0) - (players![a][snaps] ?? 0) || (a < b ? -1 : 1)).slice(0, n));
  const pad = (ids: string[], n: number) => [...ids, ...Array<string>(Math.max(0, n - ids.length)).fill("")];
  return off ? [pad(by[0], 1), pad(by[1], 1), [], pad(by[3], 3), pad(by[4], 1), [...pad(by[5], 2), ...pad(by[6], 2), ...pad(by[7], 1)]]
    : by.map((ids, i) => pad(ids, want[i][1]));
}

/** Puts a man the row names into his group when the lineup we have doesn't hold him. */
function seat(groups: string[][], g: number, id: string | undefined): void {
  if (!id || groups.some((ids) => ids.includes(id))) return;
  if (groups[g].length) groups[g][0] = id;
}

// ---- The plays ----

interface Built { sc: Scene; take: Take; flagAt?: number }

/** Linemen come out of their stances and lean on each other. */
function trenches(t: Take, o: Offense, d: Defense, until: number): void {
  for (const i of [...o.ol, ...d.rush]) {
    mark(t, i, 0, 0.15, ACT.set);
    mark(t, i, 0.15, until, ACT.block);
  }
}

/** The defense chasing a ball carrier from `from` on. */
function pursue(sc: Scene, who: number[], from: number, carrier: number, slow = 1): void {
  who.forEach((i, k) => sc.then(i, from, toward((_s, s2) => {
    const [x, y] = s2.at(carrier);
    return [x + ((k % 3) - 1) * 0.7, y + ((k % 4) - 1.5) * 0.6];
  }, (sc.men[i].body === "line" ? TRENCH : CHASE) * slow, 1.1)));
}

function runPlay(book: PlayBook, call: Call, off: string[][], def: string[][], _n: number, flip: 1 | -1): Built {
  const sc = new Scene();
  const o = offense(sc, book, call, off, flip);
  const d = defense(sc, call, def, o);
  const word = call.formation === "Empty" ? "Shotgun" : call.formation;
  const side = call.lane || 1;
  const tpl = book.runs.find((r) => r.formation === word && r.where === (call.kind === "keep" ? "end" : call.where)) ?? book.runs[0];
  const hole = { middle: 0.9, tackle: 4.2, end: 9 }[call.where] * side;
  const flow = clamp(hole, -8, 8) * 0.25;
  const back = (s: number): P => { const p = sample(tpl.back, book.rate, s); return [p[0], p[1] * side]; };
  const qbPath = (s: number): P => { const p = sample(tpl.qb, book.rate, s); return [p[0], p[1] * side]; };
  let carrier = o.rb >= 0 ? o.rb : o.qb, handoff = tpl.handoff, path: (s: number) => P, earliest = tpl.handoff + 0.2;
  const q = sc.men[o.qb];

  if (call.kind === "kneel") {
    carrier = o.qb; handoff = 99;
    path = line([[0, q.x0, q.y0], [0.7, q.x0 - 1.2, q.y0]]);
  } else if (call.kind === "keep" || o.rb < 0) {
    carrier = o.qb; handoff = 99;
    if (call.style === "sneak") { path = openField(line([[0, q.x0, q.y0], [0.5, -0.3, 0.3 * side]]), 0.5); earliest = 0.5; }
    else if (call.style === "draw") { path = openField(line([[0, q.x0, q.y0], [0.8, Math.min(q.x0 - 1, -4.5), 0], [1.5, -0.5, 0.8 * side], [2.2, 4, 1.2 * side]]), 2.2); earliest = 1.2; }
    else {
      // The back takes the fake one way and the quarterback keeps it around the other end.
      path = openField(line([[0, q.x0, q.y0], [tpl.handoff, q.x0 - 0.4, 0.6 * side], [tpl.handoff + 1.0, -1, 6.5 * side], [tpl.handoff + 1.9, 3.5, 8.5 * side]]), tpl.handoff + 1.9);
      if (o.rb >= 0) sc.then(o.rb, 0, rail((s) => { const p = sample(tpl.back, book.rate, s); return [Math.min(p[0], 1.5), -p[1] * side * 0.6]; }));
    }
  } else {
    path = openField(back, tpl.free);
    sc.then(o.qb, 0, rail(qbPath));
  }
  const run = carry(path!, call.kind === "kneel" ? -1.2 : call.gain, earliest, call.score);
  const end = call.kind === "kneel" ? 1.0 : run.end;
  sc.then(carrier, 0, rail(run.f));

  // Blocking: the line fires out and slides toward the hole; the fullback leads through it; receivers block the men over them.
  const kneel = call.kind === "kneel";
  for (const i of [...o.ol, ...o.te]) {
    const m = sc.men[i];
    sc.then(i, 0, rail(kneel ? line([[0, m.x0, m.y0], [0.6, m.x0 + 0.3, m.y0]]) : line([[0, m.x0, m.y0], [0.8, 1.2, m.y0 + flow * 0.6], [2.0, 2.2, m.y0 + flow], [9, 4, m.y0 + flow]])));
  }
  if (o.fb >= 0 && !kneel) {
    const m = sc.men[o.fb];
    const at = Math.max(handoff > 9 ? 0.6 : handoff + 0.25, 0.15 + Math.hypot(-0.4 - m.x0, hole - m.y0) / 6.8);
    sc.then(o.fb, 0, rail(steady([[0, m.x0, m.y0], [0.15, m.x0, m.y0], [at, -0.4, hole], [at + 0.6, 3, hole + 0.6 * side], [at + 6, 6, hole + side]])));
  }
  for (const i of o.wr) { const m = sc.men[i]; sc.then(i, 0, rail(kneel ? () => [m.x0, m.y0] : line([[0, m.x0, m.y0], [1.2, 4.6, m.y0 * 0.97], [2.4, 6, m.y0 * 0.94]]))); }

  // The defense holds its ground, reads run, and comes after the ball.
  const startPursuit = kneel ? 99 : Math.min(0.9, end * 0.6);
  for (const i of d.rush) { const m = sc.men[i]; sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.8, kneel ? 0.9 : 0.6, m.y0 + (kneel ? 0 : flow * 0.5)]]))); }
  for (const i of d.lb) { const m = sc.men[i]; if (!kneel) sc.then(i, 0.35, toward(() => [2.6, m.y0 + (hole - m.y0) * 0.6], 5)); }
  for (const i of d.cb) { const m = sc.men[i]; if (!kneel) sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.8, m.x0 + 1.6, m.y0]]))); }
  for (const i of d.s) { const m = sc.men[i]; if (!kneel) sc.then(i, 0.5, toward(() => [m.x0 - 3, m.y0 + (hole - m.y0) * 0.3], 4)); }
  const defenders = sc.of(1);
  pursue(sc, defenders, startPursuit, carrier, call.score ? 0.85 : 1);
  if (!kneel && !call.score) for (const i of defenders) sc.then(i, end + 0.3, () => {});

  const c = o.c;
  sc.ballAt = (s, s2) => {
    const who = s >= handoff ? carrier : o.qb;
    const [hx, hy] = s2.at(who);
    if (s < 0.25) { const k = s / 0.25, [cx, cy] = s2.at(c); return [cx + (hx - cx) * k, cy + (hy - cy) * k, 0.4, -1]; }
    return [hx, hy, 0, who];
  };
  const take = sc.run(end + (kneel ? 0.8 : call.score ? 1.6 : 0.9));
  trenches(take, o, d, kneel ? 99 : end);
  if (kneel) mark(take, o.qb, 0.7, 99, ACT.kneel);
  else if (call.score) mark(take, carrier, end + 0.6, 99, ACT.cheer);
  else tackle(sc, take, carrier, end, defenders, call.ids.tackler);
  take.named.push({ who: o.qb, from: 0, to: fr(Math.min(handoff, end + 9)) }, { who: carrier, from: carrier === o.qb ? 0 : fr(handoff), to: take.frames });
  return { sc, take, flagAt: call.flagged ? end : undefined };
}

/** A flag before the snap: both teams set, somebody moves early, and the play never starts. */
function flagPlay(book: PlayBook, call: Call, off: string[][], def: string[][], n: number, flip: 1 | -1): Built {
  const sc = new Scene();
  const o = offense(sc, book, call, off, flip);
  const d = defense(sc, call, def, o);
  const defensive = /Encroachment|offside|Neutral zone/.test(call.style);
  // The man who jumps: a lineman on a false start, a rusher on the defense's fouls. Nobody moves on a delay of game.
  const who = defensive ? d.rush[Math.floor(frac(n, 1) * d.rush.length)] : /False start|Illegal shift/.test(call.style) ? o.ol[Math.floor(frac(n, 1) * o.ol.length)] : -1;
  if (who >= 0) {
    const m = sc.men[who];
    const lurch = defensive ? -1.6 : 0.5;
    sc.then(who, 0.5, rail(line([[0.5, m.x0, m.y0], [0.75, m.x0 + lurch, m.y0], [1.5, m.x0 + lurch * 0.4, m.y0]])));
  }
  sc.ballAt = (_s, s2) => { const [cx, cy] = s2.at(o.c); return [cx + 0.4, cy, 0, -1]; };
  const take = sc.run(2.0);
  for (const i of [...o.ol, ...d.rush]) if (i !== who) mark(take, i, 0, 99, ACT.set);
  if (who >= 0) mark(take, who, 0, 0.5, ACT.set);
  take.named.push({ who: o.qb, from: 0, to: take.frames });
  return { sc, take, flagAt: 0.85 };
}

// Routes the other receivers run, by how deep the play is looking: [wide, slot, tight end].
const CONCEPTS: Record<string, [string[], string[], string[]]> = {
  c: [["hitch", "go"], ["hitch", "flat"], ["flat", "hitch"]],
  s: [["hitch", "slant", "out"], ["flat", "cross", "slant"], ["flat", "hitch"]],
  i: [["curl", "dig", "out"], ["cross", "dig", "curl"], ["dig", "seam"]],
  d: [["go", "post", "corner"], ["seam", "post", "cross"], ["seam", "cross"]],
};
const THROW_AT: Record<string, number> = { c: 1.15, s: 1.7, i: 2.35, d: 2.95 };
const AIR: Record<string, number> = { c: -2, s: 6, i: 13, d: 28 };

function passPlay(book: PlayBook, call: Call, off: string[][], def: string[][], n: number, flip: 1 | -1, ydl: number, hash: number): Built {
  const sc = new Scene();
  const o = offense(sc, book, call, off, flip);
  const d = defense(sc, call, def, o);
  const q = sc.men[o.qb];
  const style = call.kind === "pass" ? call.style : "i";
  const room = 100 - ydl;
  const side = call.lane || 1;
  const underCenter = q.x0 > -2;
  const fake = call.playAction && o.rb >= 0 && sc.men[o.rb].x0 < -3;
  const dropAt = (underCenter ? 1.25 : 0.7) + (fake ? 0.35 : 0);
  const dropTo: P = [underCenter ? -6.6 : Math.min(q.x0 - 1.6, -6.6), 0];
  let throwAt = THROW_AT[style] + (fake ? 0.4 : 0) + frac(n, 1) * 0.3;
  if (style !== "c") throwAt = Math.max(throwAt, dropAt + 0.2);

  // The quarterback: his drop, then whatever the play became.
  let qbPath = line([[0, q.x0, q.y0], ...(fake ? [[0.55, q.x0 - 1.6, 0.7 * side] as [number, number, number]] : []), [dropAt, dropTo[0], dropTo[1]]]);
  let end = 0, carrier = -1, catchAt = 0, target = -1;
  let spot: P = [0, 0], land: P = [0, 0];
  const sackAt = 2.3 + frac(n, 2) * 0.7;
  if (call.kind === "sack") {
    end = sackAt;
    qbPath = line([[0, q.x0, q.y0], [Math.min(dropAt, end - 0.6), Math.min(dropTo[0], call.gain - 1), 0], [end, call.gain, (frac(n, 3) - 0.5) * 3]]);
    carrier = o.qb;
  } else if (call.kind === "scramble") {
    const escape = openField(line([[0, q.x0, q.y0], [dropAt, dropTo[0], 0], [1.9, dropTo[0] + 0.5, 0], [2.7, -4.5, 5.5 * side], [3.4, -0.5, (7 + frac(n, 3) * 3) * side]]), 3.4);
    const run = carry(escape, call.gain, 2.9, call.score);
    qbPath = run.f; end = run.end; carrier = o.qb;
  }
  sc.then(o.qb, 0, rail(qbPath));

  // The throw: who it goes to, and where he is when it gets there.
  const throws = call.kind === "pass" || call.kind === "away";
  if (call.kind === "pass") {
    target = sc.byId(call.ids.target);
    if (target < 0 || !o.eligible.includes(target)) {
      const fits = o.eligible.filter((i) => (style === "c" ? i === o.rb : call.lane === 0 ? Math.abs(sc.men[i].y0) < 12 : Math.sign(sc.men[i].y0) === call.lane));
      target = fits[Math.floor(frac(n, 4) * fits.length)] ?? o.eligible[0];
    }
    const m = sc.men[target];
    const air = call.result !== "gain" ? AIR[style]
      : style === "c" ? Math.min(-1.5, call.gain) : style === "s" ? clamp(call.gain - 2, Math.min(1, call.gain), 7)
        : style === "i" ? Math.min(call.gain, clamp(call.gain - 3, 9, 16)) : Math.min(call.gain, clamp(call.gain - 4, 18, 45));
    const ax = Math.min(air, room + 5);
    const wiggle = (frac(n, 5) - 0.5) * 4;
    let ay = call.lane === 0 ? clamp(m.y0 * 0.2, -3.5, 3.5) + wiggle * 0.7
      : Math.sign(m.y0) === call.lane && Math.abs(m.y0) > 5 ? m.y0 + wiggle : call.lane * (8 + frac(n, 5) * 4);
    if (style === "c") ay = m.y0 + side * (m.x0 < -3 ? 5 : 2);
    ay = clamp(ay, -SIDELINE + 1.5 - hash, SIDELINE - 1.5 - hash);
    spot = [ax, ay];
    // He runs his stem, breaks to the ball, and the throw is timed to meet him.
    const stem: P = ax > 4 ? [ax * 0.72, m.y0] : [m.x0 + (ax - m.x0) * 0.4, m.y0 + (ay - m.y0) * 0.3];
    const legs = Math.hypot(stem[0] - m.x0, stem[1] - m.y0) + Math.hypot(ax - stem[0], ay - stem[1]);
    const flight = (at: number) => Math.max(0.3, Math.hypot(ax - qbPath(at)[0], ay - qbPath(at)[1]) / (style === "d" ? 19 : 22));
    throwAt = Math.max(throwAt, legs / 7.4 - flight(throwAt));
    catchAt = throwAt + flight(throwAt);
    const there = Math.max(0.5, Math.min(catchAt, legs / 6.6));
    const stemAt = there * Math.hypot(stem[0] - m.x0, stem[1] - m.y0) / Math.max(0.1, legs);
    const route = steady([[0, m.x0, m.y0], [stemAt, stem[0], stem[1]], [there, ax, ay]]);
    if (call.result === "gain") {
      // After the catch he takes it to where the play ended.
      const yac = Math.max(0.25, Math.abs(call.gain - ax) / RUN);
      end = catchAt + yac;
      const after = steady([[catchAt, ax, ay], [end, call.gain, clamp(ay + side * Math.min(3, (call.gain - ax) * 0.15), -SIDELINE + 1 - hash, SIDELINE - 1 - hash)]]);
      sc.then(target, 0, rail((s) => {
        if (s <= catchAt) return route(s);
        const p = after(Math.min(s, end));
        if (call.score && s > end) p[0] += Math.min(4, (s - end) * RUN * 0.8);
        return p;
      }));
      carrier = target;
    } else {
      sc.then(target, 0, rail(route));
      end = catchAt + 0.6;
      const long = frac(n, 6) < 0.5 ? 1 : -1;
      land = call.brokenUp || call.result === "picked" ? spot : [ax + 2.6 * long, ay + 1.4 * side];
    }
  } else if (call.kind === "away") {
    throwAt = 2.2 + frac(n, 2) * 0.6;
    land = [7, side * (SIDELINE + 2) - hash];
    catchAt = throwAt + 0.9; end = catchAt + 0.3;
  }

  // Everyone else runs a route off the tree; the back stays in to block unless the ball is his.
  const concept = CONCEPTS[style];
  o.eligible.forEach((i, k) => {
    if (i === target) return;
    const m = sc.men[i];
    const out = Math.sign(m.y0) || 1;
    if (i === o.rb || i === o.fb) {
      if (m.x0 > -2) { const r = book.routes[concept[1][k % concept[1].length]]; sc.then(i, 0, rail((s) => { const p = sample(r, book.rate, s * PACE); return [m.x0 + p[0], m.y0 + out * p[1]]; })); return; }
      const tpl = book.runs.find((r) => r.formation === (call.formation === "Empty" ? "Shotgun" : call.formation) && r.where === "middle") ?? book.runs[0];
      const stay: P = [dropTo[0] + 1.8, (i === o.fb ? -1.6 : 1.6) * (m.y0 >= 0 ? 1 : -1)];
      if (fake && i === o.rb) sc.then(i, 0, rail((s) => { const p = sample(tpl.back, book.rate, Math.min(s, tpl.handoff + 0.5)); return [Math.min(p[0], 0.2), p[1] * side]; }));
      else sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.8, stay[0], stay[1]]])));
      return;
    }
    const wide = Math.abs(m.y0) > 14 ? 0 : m.group === "TE" ? 2 : 1;
    // A second tight end stays in to help the tackles.
    if (m.group === "TE" && o.te.indexOf(i) > 0 && style !== "c") { sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.8, m.x0 - 1.4, m.y0 * 1.05]]))); return; }
    const r = book.routes[concept[wide][Math.floor(frac(n, 20 + k) * concept[wide].length)]];
    sc.then(i, 0, rail((s) => { const p = sample(r, book.rate, s * PACE); return [m.x0 + p[0], clamp(m.y0 + out * p[1], -SIDELINE + 1 - hash, SIDELINE - 1 - hash)]; }));
  });

  // The line sets the pocket; on a screen it lets the rush come and gets out in front.
  for (const i of o.ol) {
    const m = sc.men[i];
    if (style === "c" && call.kind === "pass") {
      sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.8, m.x0 - 1.2, m.y0]])));
      sc.then(i, 0.9, toward(() => [5, m.y0 * 0.5 + spot[1] * 0.6], TRENCH + 1.2));
    } else sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.8, m.x0 - 1.6, m.y0 * 1.08], [3.2, m.x0 - 2.6, m.y0 * 1.12]])));
  }

  // The rush works on the man in front of it; whoever gets the sack comes free.
  const sacker = call.kind === "sack" ? (sc.byId(call.ids.sacker) >= 0 ? sc.byId(call.ids.sacker) : d.rush[Math.floor(frac(n, 7) * d.rush.length)]) : -1;
  for (const i of d.rush) {
    const m = sc.men[i];
    const blocker = o.ol.reduce((a, b) => (Math.abs(sc.men[b].y0 - m.y0) < Math.abs(sc.men[a].y0 - m.y0) ? b : a));
    sc.then(i, 0, toward((_s, s2) => { const [bx, by] = s2.at(blocker); return [bx + 0.9, by + Math.sign(m.y0 - by || 1) * 0.5]; }, TRENCH + 1));
    if (style === "c" && call.kind === "pass") sc.then(i, 0.8, toward((_s, s2) => s2.at(o.qb), 5.5, 1.5));
  }
  if (d.blitzer >= 0) sc.then(d.blitzer, 0.1, toward((_s, s2) => s2.at(o.qb), 6.3, 1.6));
  if (sacker >= 0) sc.then(sacker, end - 0.9, toward((_s, s2) => s2.at(o.qb), 7.6, 0.4));

  // Coverage: man defenders run with their receivers, zone defenders sink to their spots and break on the throw.
  const coverage = [...d.cb, ...d.s, ...d.lb].filter((i) => i !== d.blitzer);
  for (const i of coverage) {
    const m = sc.men[i];
    const r = call.man ? d.cover.get(i) : undefined;
    if (r !== undefined) sc.then(i, 0.25, toward((_s, s2) => { const [rx, ry] = s2.at(r); return [rx + 0.9, ry - Math.sign(ry || 1) * 0.5]; }, 7.3));
    else sc.then(i, 0.2, toward(() => d.zone.get(i) ?? [m.x0, m.y0], 5.2));
    if (throws && call.kind === "pass" && Math.hypot((d.zone.get(i)?.[0] ?? m.x0) - spot[0], (d.zone.get(i)?.[1] ?? m.y0) - spot[1]) < 15) sc.then(i, throwAt + 0.1, toward(() => spot, 7.2, 1.2));
  }
  const defenders = sc.of(1), attackers = sc.of(0);
  if (carrier >= 0 && call.kind !== "sack") pursue(sc, defenders, call.kind === "scramble" ? 2.3 : catchAt, carrier, call.score ? 0.85 : 1);
  if (carrier >= 0 && !call.score) for (const i of defenders) sc.then(i, end + 0.3, () => {});

  // An interception: the defender takes it the other way and the offense has to tackle him.
  let picker = -1, backTo = 0, pickEnd = 0;
  if (call.result === "picked") {
    // The man credited makes the catch if the ball comes down near him; otherwise the defender nearest it is drawn as him.
    const from = (i: number) => Math.hypot(sc.men[i].x0 - spot[0], sc.men[i].y0 - spot[1]);
    const close = coverage.reduce((a, b) => (from(b) < from(a) ? b : a));
    const credited = sc.byId(call.ids.picker);
    picker = credited >= 0 && coverage.includes(credited) && from(credited) < from(close) + 6 ? credited : close;
    if (credited >= 0 && credited !== picker) {
      const a = sc.men[credited], b = sc.men[picker];
      [a.id, b.id] = [b.id, a.id];
      [a.slot, b.slot] = [b.slot, a.slot];
    }
    const house = call.ret >= 100;
    backTo = house ? -ydl - 4 : call.next ?? spot[0] - call.ret;
    pickEnd = catchAt + Math.max(0.3, Math.abs(spot[0] - backTo) / RUN);
    const back = steady([[catchAt, spot[0], spot[1]], [pickEnd, backTo, spot[1] * 0.7]]);
    sc.then(picker, catchAt, rail((s) => back(Math.min(s, pickEnd))));
    attackers.forEach((i, k) => sc.then(i, catchAt + 0.2, toward((_s, s2) => { const [x, y] = s2.at(picker); return [x - ((k % 3) - 1) * 0.7, y + ((k % 4) - 1.5) * 0.6]; }, (sc.men[i].body === "line" ? TRENCH : CHASE - 0.4) * (house ? 0.8 : 1), 1.1)));
    for (const i of defenders) if (i !== picker) sc.then(i, catchAt + 0.1, toward((_s, s2) => { const [x, y] = s2.at(picker); return [x - 3, y + (i % 2 ? 4 : -4)]; }, 5.5, 2));
    end = pickEnd;
  }

  const c = o.c;
  sc.ballAt = (s, s2) => {
    const [qx, qy] = s2.at(o.qb);
    if (s < 0.3) { const k = s / 0.3, [cx, cy] = s2.at(c); return [cx + (qx - cx) * k, cy + (qy - cy) * k, 0.4, -1]; }
    if (!throws || s < throwAt) return [qx, qy, 0, o.qb];
    const [fx, fy] = qbPath(throwAt);
    const to: P = call.kind === "away" || (call.result === "incomplete" && !call.brokenUp) ? land : spot;
    if (s < catchAt) {
      const k = (s - throwAt) / (catchAt - throwAt), far = Math.hypot(to[0] - fx, to[1] - fy);
      return [fx + (to[0] - fx) * k, fy + (to[1] - fy) * k, 1.6 + 4 * Math.min(9, 0.8 + far * 0.16) * k * (1 - k) - 0.6 * k, -1];
    }
    if (call.result === "gain" && carrier >= 0) { const [x, y] = s2.at(carrier); return [x, y, 0, carrier]; }
    if (picker >= 0) { const [x, y] = s2.at(picker); return [x, y, 0, picker]; }
    // On the ground: a ball that was knocked down drops where it was hit, the rest skip on a little.
    const k = Math.min(1, (s - catchAt) / 0.4);
    return [to[0] + (call.brokenUp ? 0.6 : 1.5) * k, to[1], Math.max(0, 1 - k * 2.5), -1];
  };

  const take = sc.run(end + (call.score || (picker >= 0 && call.ret >= 100) ? 1.6 : 0.9));
  trenches(take, o, d, call.result === "picked" ? catchAt : end);
  if (throws) mark(take, o.qb, throwAt - 0.2, throwAt + 0.35, ACT.throw);
  // Zone defenders keep their eyes on the quarterback until the ball is out.
  if (!call.man) for (const i of coverage) take.face[i].fill(4, 0, Math.min(take.frames, fr(throws ? throwAt : end)));
  if (call.kind === "pass") {
    mark(take, target, catchAt - 0.15, catchAt + 0.2, ACT.catch);
    if (call.brokenUp) { const by = nearest(take, coverage, fr(catchAt), spot); if (by >= 0) { arrive(take, by, fr(catchAt), spot, false, 0.8); mark(take, by, catchAt - 0.1, catchAt + 0.25, ACT.catch); } }
    take.named.push({ who: target, from: fr(throwAt), to: take.frames });
  }
  if (picker >= 0) {
    arrive(take, picker, Math.max(0, Math.ceil(catchAt * RATE - 1e-6) - 1), spot, false, 0, false);
    mark(take, picker, catchAt - 0.15, catchAt + 0.15, ACT.catch);
    take.named.push({ who: picker, from: fr(catchAt), to: take.frames });
    if (call.ret >= 100) mark(take, picker, pickEnd + 0.6, 99, ACT.cheer);
    else tackle(sc, take, picker, pickEnd, attackers, undefined);
  } else if (call.kind === "sack") {
    arrive(take, sacker, fr(end), [qbPath(end)[0], qbPath(end)[1]], true);
    mark(take, o.qb, end, 99, ACT.fall);
    mark(take, sacker, end - 0.15, 99, ACT.fall);
    take.named.push({ who: sacker, from: fr(end), to: take.frames });
  } else if (carrier >= 0) {
    if (call.score) mark(take, carrier, end + 0.6, 99, ACT.cheer);
    else tackle(sc, take, carrier, end, defenders, call.ids.tackler);
  }
  take.named.push({ who: o.qb, from: 0, to: throws ? fr(throwAt + 0.4) : take.frames });
  return { sc, take, flagAt: call.flagged ? end : undefined };
}

/** A made-up slot for a kicker or returner the feed names. */
function named(id: string | undefined, name: string | undefined): { id: string | null; slot: Slot | null } {
  const real = id ?? playerNamed(name);
  if (real) return { id: real, slot: undefined as unknown as Slot | null };
  return { id: null, slot: name ? { id: null, number: null, name: name.split(" ").slice(1).join(" ") || name } : null };
}

function add(sc: Scene, team: 0 | 1, group: string, at: P, who?: { id: string | null; slot: Slot | null }): number {
  return who ? (who.id ? sc.add(team, group, who.id, at) : sc.add(team, group, null, at, who.slot)) : sc.add(team, group, null, at, null);
}

/** A returner's trip with the ball and the coverage's to him, shared by kickoffs and punts. */
function returnIt(sc: Scene, ret: number, cover: number[], blockers: number[], caught: number, from: P, to: P, score: boolean): number {
  const end = caught + Math.max(0.3, Math.hypot(to[0] - from[0], to[1] - from[1]) / (RUN - 0.3));
  const back = steady([[caught, from[0], from[1]], [end, to[0], to[1]]]);
  sc.then(ret, caught, rail((s) => back(Math.min(s, end))));
  blockers.forEach((b, k) => { const man = cover[k % cover.length]; sc.then(b, caught, toward((_s, s2) => s2.at(man), 6.2, 0.9)); });
  if (!score) for (const i of cover) sc.then(i, end + 0.3, () => {});
  return end;
}

function kickoff(call: Call, n: number, endX: number): Built {
  const sc = new Scene();
  const k = add(sc, 0, "K", [-4, 0.8], named(call.ids.kicker, call.names.kicker));
  const cover = Array.from({ length: 10 }, (_, i) => add(sc, 0, "ST", [-1, -22.5 + i * 5]));
  const front = Array.from({ length: 5 }, (_, i) => add(sc, 1, "ST", [15, -16 + i * 8]));
  const mid = Array.from({ length: 4 }, (_, i) => add(sc, 1, "ST", [30, -15 + i * 10]));
  const side = frac(n, 1) < 0.5 ? 1 : -1;
  const deep = add(sc, 1, "KR", [62, 6 * side], named(call.ids.returner, call.names.returner));
  const other = add(sc, 1, "KR", [62, -6 * side]);
  const kickAt = 0.9, hang = 3.7;
  const tb = call.style === "touchback";
  const land: P = [tb ? 69 : 62, (frac(n, 2) - 0.5) * 10 + 3 * side];
  const caught = kickAt + hang;
  sc.then(k, 0, rail(line([[0, -4, 0.8], [kickAt, -0.6, 0.1], [kickAt + 0.8, 1.5, 0]])));
  for (const i of cover) { const m = sc.men[i]; sc.then(i, kickAt - 0.25, toward((_s, s2) => { const [rx, ry] = tb ? land : s2.at(deep); const far = Math.abs(rx - m.x); return [rx, far > 12 ? ry * 0.5 + m.y0 * 0.5 : ry]; }, 7.3, tb ? 14 : 1.2)); }
  for (const i of [...front, ...mid]) { const m = sc.men[i]; sc.then(i, kickAt, toward(() => [Math.min(50, land[0] - 12), m.y0 * 0.7], 5.8)); }
  let end = caught + 0.6;
  if (!tb) {
    sc.then(deep, kickAt + 0.4, reach(land, caught - 0.2));
    sc.then(other, kickAt + 0.6, toward(() => [land[0] - 5, land[1] * 0.5], 5.5));
    end = returnIt(sc, deep, cover, [...front, ...mid, other], caught, land, [call.score ? -39 : endX, land[1] * 0.4 + (frac(n, 3) - 0.5) * 12], call.score);
  }
  sc.ballAt = (s, s2) => {
    if (s < kickAt) return [-0.3, 0, 0, -1];
    if (s < caught) { const q = (s - kickAt) / hang; return [-0.3 + (land[0] + 0.3) * q, land[1] * q, 4 * 17 * q * (1 - q), -1]; }
    if (tb) return [land[0] + Math.min(3, (s - caught) * 4), land[1], 0, -1];
    const [x, y] = s2.at(deep);
    return [x, y, 0, deep];
  };
  const take = sc.run(end + (call.score ? 1.6 : 0.9));
  mark(take, k, kickAt - 0.2, kickAt + 0.3, ACT.kick);
  take.named.push({ who: k, from: 0, to: fr(kickAt + 1.2) });
  if (!tb) {
    mark(take, deep, caught - 0.15, caught + 0.15, ACT.catch);
    take.named.push({ who: deep, from: fr(caught), to: take.frames });
    if (call.score) mark(take, deep, end + 0.6, 99, ACT.cheer);
    else tackle(sc, take, deep, end, cover, call.ids.tackler);
  }
  return { sc, take };
}

function punt(call: Call, n: number, ydl: number, hash: number): Built {
  const sc = new Scene();
  const room = 100 - ydl;
  const ls = add(sc, 0, "OL", [-0.3, 0]);
  const wall = [-4.5, -3, -1.5, 1.5, 3, 4.5].map((y) => add(sc, 0, "OL", [-0.5, y]));
  const gunners = [19, -19].map((y) => add(sc, 0, "ST", [-0.5, y]));
  const guard = add(sc, 0, "ST", [-6, -1.5]);
  const p = add(sc, 0, "P", [-14, 0], named(call.ids.kicker, call.names.kicker));
  const rushers = [-5.2, -3.2, -1.2, 1.2, 3.2, 5.2].map((y) => add(sc, 1, "IDL", [1, y]));
  const jammers = [19, -19].map((y) => add(sc, 1, "ST", [1.6, y]));
  const backers = [3, -3].map((y) => add(sc, 1, "ST", [5, y]));
  const tb = call.style === "touchback";
  const out = call.style === "out";
  const side = frac(n, 1) < 0.5 ? 1 : -1;
  // The spot the receiving team takes over from wins over the yards the feed gives the kick, which are rounded.
  const dead = call.next !== null && call.style !== "return" ? call.next : call.next !== null ? call.next + call.ret : call.gain;
  const land: P = [tb ? room + 4 : Math.min(dead, room - 1), out ? side * (SIDELINE + 1) - hash : (frac(n, 2) - 0.5) * 16];
  const ret = add(sc, 1, "PR", [Math.min(room - 1, land[0] + 1), clamp(land[1] * 0.4, -8, 8)], named(call.ids.returner, call.names.returner));
  const kickAt = 1.75, hang = 3.5 + land[0] * 0.02, caught = kickAt + hang;
  sc.then(p, 0.7, rail(line([[0.7, -14, 0], [kickAt, -12.3, 0], [kickAt + 0.8, -11, 0]])));
  for (const i of wall) { const m = sc.men[i]; sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.9, m.x0 - 1.3, m.y0 * 1.1]]))); }
  sc.then(guard, 0, rail(line([[0, -6, -1.5], [1.0, -7, 0]])));
  for (const i of rushers) { const m = sc.men[i]; sc.then(i, 0, toward(() => [-3.4, m.y0 * 0.8], 4.2)); sc.then(i, kickAt + 0.2, toward(() => [land[0] - 14, m.y0 * 1.6], 5.5)); }
  for (const i of backers) { const m = sc.men[i]; sc.then(i, kickAt, toward(() => [land[0] - 10, m.y0 * 2], 5.5)); }
  const live = call.style === "return";
  const cover = [...gunners, ...wall, guard, ls];
  cover.forEach((i, k) => { const m = sc.men[i]; sc.then(i, k < 2 ? 0.25 : kickAt - 0.3, toward((_s, s2) => { const [rx, ry] = live ? s2.at(ret) : land; const far = Math.abs(rx - m.x); return [rx, far > 12 ? ry * 0.5 + m.y0 * 0.6 : ry]; }, k < 2 ? 7.4 : 6.8, live ? 1.2 : k < 2 ? 1.5 : 6)); });
  jammers.forEach((i, k) => sc.then(i, 0.3, toward((_s, s2) => { const [gx, gy] = s2.at(gunners[k]); return [gx + 0.9, gy - Math.sign(gy || 1) * 0.6]; }, 7.0)));
  let end = caught + (call.style === "fair" ? 0.7 : 1.2);
  if (live || call.style === "fair") sc.then(ret, kickAt + 0.5, reach(land, caught - 0.2));
  else sc.then(ret, kickAt + 1, toward(() => [land[0] - 6, land[1] + (land[1] > 0 ? -7 : 7)], 4.5));
  if (live) end = returnIt(sc, ret, cover, [...jammers, ...backers, ...rushers], caught, land, [call.score ? -ydl - 4 : land[0] - call.ret, land[1] * 0.4 + (frac(n, 3) - 0.5) * 10], call.score);
  sc.ballAt = (s, s2) => {
    const [px, py] = s2.at(p);
    if (s < 0.7) { const q = s / 0.7; return [-0.3 + (px + 0.3) * q, py * q, 0.8, -1]; }
    if (s < kickAt) return [px, py, 0, p];
    // A punt nobody catches comes down short of where it is downed and rolls there; one into the end zone rolls on.
    const roll = call.style === "downed" ? 4 : 0;
    if (s < caught) { const q = (s - kickAt) / hang; return [-12 + (land[0] - roll + 12) * q, land[1] * q, 4 * 19 * q * (1 - q), -1]; }
    if (live || call.style === "fair") { const [x, y] = s2.at(ret); return [x, y, 0, ret]; }
    return [land[0] - roll + Math.min(tb ? 3 : roll, (s - caught) * 4), land[1], 0, -1];
  };
  const take = sc.run(end + (call.score ? 1.6 : 0.8));
  for (const i of [...wall, ...rushers]) { mark(take, i, 0, 0.15, ACT.set); mark(take, i, 0.15, kickAt, ACT.block); }
  mark(take, p, kickAt - 0.2, kickAt + 0.3, ACT.kick);
  take.named.push({ who: p, from: 0, to: fr(kickAt + 1.2) });
  if (live || call.style === "fair") { mark(take, ret, caught - 0.15, caught + 0.2, ACT.catch); take.named.push({ who: ret, from: fr(caught), to: take.frames }); }
  if (live) {
    if (call.score) mark(take, ret, end + 0.6, 99, ACT.cheer);
    else tackle(sc, take, ret, end, cover, call.ids.tackler);
  } else if (call.style === "downed") arrive(take, gunners[0], fr(caught + 1), [land[0], land[1]], true, 0.6);
  return { sc, take };
}

function fieldGoal(call: Call, ydl: number, hash: number): Built {
  const sc = new Scene();
  const room = 100 - ydl;
  add(sc, 0, "OL", [-0.3, 0]);
  const wall = [-6, -4.5, -3, -1.5, 1.5, 3, 4.5, 6].map((y) => add(sc, 0, "OL", [Math.abs(y) > 5 ? -1 : -0.5, y]));
  const holder = add(sc, 0, "ST", [-7.5, 0.5]);
  const k = add(sc, 0, "K", [-10, 2.3], named(call.ids.kicker, call.names.kicker));
  const rushers = [-6.4, -4.6, -2.8, -1, 1, 2.8, 4.6, 6.4].map((y) => add(sc, 1, "IDL", [1, y]));
  [0, 4, -4].forEach((y) => add(sc, 1, "ST", [4.5, y]));
  const kickAt = 1.3;
  // The posts stand in the middle of the field at the back of the end zone.
  const wide = call.style === "left" ? 5.5 : call.style === "right" ? -5.5 : 0;
  const short = call.style === "short";
  const land: P = short ? [room - 3, -hash + 1.5] : [room + 16, -hash + wide * 1.5];
  const hang = 1.5 + land[0] * 0.022;
  sc.then(k, 0.55, rail(line([[0.55, -10, 2.3], [kickAt, -8.1, 0.9], [kickAt + 0.7, -7, 0.4]])));
  for (const i of wall) { const m = sc.men[i]; sc.then(i, 0, rail(line([[0, m.x0, m.y0], [0.9, m.x0 - 0.5, m.y0]]))); }
  for (const i of rushers) { const m = sc.men[i]; sc.then(i, 0, toward(() => [-1.2, m.y0 * 0.75], 2.6)); }
  sc.ballAt = (s) => {
    if (s < 0.6) { const q = s / 0.6; return [-0.3 - 7 * q, 0.45 * q, 0.7, -1]; }
    if (s < kickAt) return [-7.3, 0.45, 0, -1];
    const q = Math.min(1, (s - kickAt) / hang);
    return [-7.3 + (land[0] + 7.3) * q, 0.45 + (land[1] - 0.45) * q, 4 * (short ? 8 : 12) * q * (1 - q), -1];
  };
  const take = sc.run(kickAt + hang + 0.9);
  for (const i of [...wall, ...rushers]) { mark(take, i, 0, 0.15, ACT.set); mark(take, i, 0.15, 99, ACT.block); }
  mark(take, holder, 0, kickAt + 0.3, ACT.kneel);
  mark(take, k, kickAt - 0.2, kickAt + 0.3, ACT.kick);
  if (call.style === "good") { mark(take, k, kickAt + hang * 0.75, 99, ACT.cheer); mark(take, holder, kickAt + hang * 0.75, 99, ACT.cheer); }
  take.named.push({ who: k, from: 0, to: take.frames });
  return { sc, take };
}

/** Where on the field the ball is spotted across its width, as the offense sees it: on a hash after a play to that side. */
function hashOf(log: GameLog, n: number): number {
  const row = log.plays[n];
  for (let i = n - 1; i >= 0 && i >= n - 3; i--) {
    const p = log.plays[i];
    if (p[6] !== row[6] || p[2] !== row[2] || p[3] === 0) break;
    if (/ left/.test(p[7])) return HASH;
    if (/ right/.test(p[7])) return -HASH;
    if (/ middle|sneak|draw|kneels/.test(p[7])) return 0;
  }
  return 0;
}

/**
 * Row `n` of the log as a play, or null when there is nothing to act out.
 * `box` is the game's box score, used only to guess the lineups of logs kept
 * before the players on the field were written down.
 */
export function buildTrack(book: PlayBook, log: GameLog, n: number, box?: { away: Record<string, number[]>; home: Record<string, number[]> }): Track | null {
  const call = readCall(log, n);
  if (!call) return null;
  const row = log.plays[n];
  const o = row[2];
  const dir: 1 | -1 = o === 0 ? 1 : -1;
  const los = fieldX(o, row[5]);
  const kick = call.kind === "kickoff";
  const hash = kick ? 0 : hashOf(log, n);
  const sides = ["away", "home"] as const;
  const off = (call.off ?? boxGroups(box?.[sides[o]], true)).map((g) => [...g]);
  const def = (call.def ?? boxGroups(box?.[sides[1 - o]], false)).map((g) => [...g]);
  // The men the row names are on the field even when the lineup had to be guessed.
  if (!call.off) { seat(off, call.ids.carrier && PLAYER_BY_ID[call.ids.carrier]?.position === "QB" ? 0 : 1, call.ids.carrier); seat(off, 0, call.ids.passer); seat(off, 3, call.ids.target); }
  const flip: 1 | -1 = (row[6] + Math.floor(n / 3)) % 2 ? 1 : -1;
  let built: Built;
  if (call.kind === "flag") built = flagPlay(book, call, off, def, n, flip);
  else if (call.kind === "run" || call.kind === "keep" || call.kind === "kneel") built = runPlay(book, call, off, def, n, flip);
  else if (call.kind === "kickoff") {
    const to = castAt(log, n + 1).last?.to;
    built = kickoff(call, n, to === null || to === undefined ? 30 : (to - los) * dir);
  } else if (call.kind === "punt") built = punt(call, n, row[5], hash);
  else if (call.kind === "fg") built = fieldGoal(call, row[5], hash);
  else built = passPlay(book, call, off, def, n, flip, row[5], hash);

  // Onto the field.
  const { sc, take } = built;
  const X = (x: number) => los + dir * x;
  const Y = (y: number) => clamp(dir * (hash + y), -SIDELINE - 3, SIDELINE + 3);
  let lo = Infinity, hi = -Infinity;
  const pos = take.pos.map((p) => {
    const out = new Float32Array(p.length);
    for (let f = 0; f < take.frames; f++) { out[f * 2] = X(p[f * 2]); out[f * 2 + 1] = clamp(Y(p[f * 2 + 1]), -SIDELINE, SIDELINE); }
    return out;
  });
  const ball = new Float32Array(take.ball.length);
  for (let f = 0; f < take.frames; f++) {
    ball[f * 3] = X(take.ball[f * 3]); ball[f * 3 + 1] = Y(take.ball[f * 3 + 1]); ball[f * 3 + 2] = take.ball[f * 3 + 2];
    lo = Math.min(lo, ball[f * 3]); hi = Math.max(hi, ball[f * 3]);
  }
  const dist = pos.map((p) => {
    const d = new Float32Array(take.frames);
    for (let f = 1; f < take.frames; f++) d[f] = d[f - 1] + Math.hypot(p[f * 2] - p[f * 2 - 2], p[f * 2 + 1] - p[f * 2 - 1]);
    return d;
  });
  // Facings were set as the offense sees them; turn them to the field.
  const face = take.face.map((a) => (dir > 0 ? a : a.map((v) => (v < 0 ? v : (v + 4) % 8))));
  const flagF = built.flagAt === undefined ? null : Math.min(take.frames - 1, fr(built.flagAt));
  return {
    rate: RATE, dur: (take.frames - 1) / RATE,
    team: sc.men.map((m) => m.team), body: sc.men.map((m) => m.body), slot: sc.men.map((m) => m.slot),
    pos, dist, act: take.act, face, ball, holder: take.holder, named: take.named.filter((x) => x.who >= 0),
    flag: flagF === null ? null : [flagF, X(1.5), Y(4)],
    span: [Math.max(-10, lo), Math.min(110, hi)], dir,
  };
}

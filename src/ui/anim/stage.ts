// Turns one row of a game's play-by-play into moving players for the field
// view. The play's result is already in the log; this only works out where
// each of the 22 would be, from a play template drawn in Blender
// (pipeline/anim/export_plays.py) bent to end where the play really ended.
// Nothing here is read by the sim, and no hidden rating is used: every player
// moves at the template's pace.
//
// Positions are in field yards: x from the away goal line (as gamecast.ts),
// y across the field from its middle, positive toward the far sideline.
import { PLAYER_BY_ID } from "../../engine/league";
import { PLAY_FLAGS as F } from "../../engine/playlog";
import { STAT_INDEX } from "../../engine/stats";
import type { GameLog, PlayRow } from "../../engine/types";

export interface PlayTemplate {
  family: "run";
  formation: string;
  where: "middle" | "tackle" | "end";
  /** Who ends up with the ball, and who hands it to him. */
  carrier: string;
  from: string;
  /** Seconds after the snap of the handoff, and of the point the carrier is past the template and running free. */
  handoff: number;
  free: number;
  /** For each role, x then y in tenths of a yard from the ball at the snap, `rate` times a second. */
  paths: Record<string, number[]>;
}

export interface PlayBook {
  rate: number;
  /** Roles drawn with the lineman's body; the rest use the lighter one. */
  bodies: Record<string, string>;
  offense: string[];
  defense: string[];
  plays: PlayTemplate[];
}

/** One player on the field: who he is, if the box score tells us. */
export interface Slot {
  role: string;
  id: string | null;
  number: number | null;
  name: string;
}

/** What a run row says, in the terms a template needs. */
export interface RunCall {
  where: PlayTemplate["where"];
  /** The play goes to the offense's right: the left-side template mirrored. */
  right: boolean;
  formation: string;
  carrier: string | null;
  tackler: string | null;
  score: boolean;
}

/** A play worked out frame by frame. */
export interface Track {
  /** Frames a second, and seconds the whole thing lasts. */
  rate: number;
  dur: number;
  roles: string[];
  /** The first `offense` roles have the ball. */
  offense: number;
  /** Per role: x, y for every frame, and the distance covered so far (which paces the stride). */
  pos: Float32Array[];
  dist: Float32Array[];
  carrier: number;
  from: number;
  tackler: number;
  handoff: number;
  /** When the carrier is brought down or crosses the goal line. */
  end: number;
  score: boolean;
  /** +1 when the offense heads toward x = 100. */
  dir: 1 | -1;
}

const RATE = 20;
const RUN_SPEED = 8.2;      // yards a second in the open field
const PURSUIT = 6.6;
const ENGAGED = 4.2;        // a lineman working off a block
const FORMATIONS = ["Under center", "Pistol", "Shotgun"];

/** The formation word in a row's look ("Shotgun · Cover 3"); an empty backfield lines up as shotgun for now. */
export function formationOf(look: string | undefined): string {
  return FORMATIONS.find((f) => look?.startsWith(f)) ?? (look?.startsWith("Empty") ? "Shotgun" : "Under center");
}

/**
 * Reads a row as a handoff we can draw: where it went and who carried and
 * tackled. Plays wiped out by a flag, fumbles and scrambles are left to the
 * arrow for now.
 */
export function runCall(log: GameLog, n: number): RunCall | null {
  const row: PlayRow | undefined = log.plays[n];
  if (!row || row[3] === 0 || row[8] & (F.penalty | F.turnover)) return null;
  const m = / runs (around|wide|off|behind the pulling guard|up the middle|left guard|right guard)( left| right)?/.exec(row[7]);
  if (!m) return null;
  const where = m[1] === "around" || m[1] === "wide" ? "end" : m[1] === "off" || m[1].startsWith("behind") ? "tackle" : "middle";
  // The feed doesn't say which side a run up the middle or behind the guard went; the row number decides, the same way every time.
  const right = m[2] ? m[2] === " right" : m[1] === "right guard" ? true : m[1] === "left guard" ? false : n % 2 === 1;
  let carrier: string | null = null, tackler: string | null = null, score = false;
  const d = log.box?.[n];
  if (d && log.ids) {
    const q = d[1];
    for (let i = 0; i < q.length; i += 4) {
      const id = log.ids[q[i]][q[i + 1]];
      if (q[i + 2] === STAT_INDEX.car) carrier = id;
      else if (q[i + 2] === STAT_INDEX.tklSolo || (q[i + 2] === STAT_INDEX.tklAst && !tackler)) tackler = id;
      else if (q[i + 2] === STAT_INDEX.rushTd) score = true;
    }
  }
  return { where, right, formation: formationOf(row[11]), carrier, tackler, score };
}

const template = (book: PlayBook, formation: string, where: string): PlayTemplate =>
  book.plays.find((p) => p.formation === formation && p.where === where) ?? book.plays.find((p) => p.where === where) ?? book.plays[0];

/** A template path at a time, in yards from the ball. */
function at(path: number[], rate: number, t: number): [number, number] {
  const last = path.length / 2 - 1;
  const f = Math.min(last, Math.max(0, t * rate));
  const i = Math.min(last - 1, Math.floor(f)), k = f - i;
  return [(path[i * 2] * (1 - k) + path[i * 2 + 2] * k) / 10, (path[i * 2 + 1] * (1 - k) + path[i * 2 + 3] * k) / 10];
}

/** Where both teams stand before the snap: [x, y] by role, in field yards. */
export function lineUp(book: PlayBook, formation: string, los: number, dir: 1 | -1): { roles: string[]; offense: number; spots: [number, number][] } {
  const t = template(book, formation, "middle");
  const roles = [...book.offense, ...book.defense];
  return { roles, offense: book.offense.length, spots: roles.map((r) => [los + dir * t.paths[r][0] / 10, dir * t.paths[r][1] / 10]) };
}

/**
 * A run, start to whistle. `gain` is the yards the play made (negative for a
 * loss) from the line of scrimmage `los`.
 */
export function runTrack(book: PlayBook, call: RunCall, los: number, dir: 1 | -1, gain: number): Track {
  const t = template(book, call.formation, call.where);
  const flip = call.right ? -1 : 1;
  const roles = [...book.offense, ...book.defense];
  const nOff = book.offense.length;
  const c = roles.indexOf(t.carrier);
  // The carrier follows the drawing through the hole, then runs straight on.
  const [fx, fy] = at(t.paths[t.carrier], book.rate, t.free);
  const carrierAt = (s: number): [number, number] => (s <= t.free ? at(t.paths[t.carrier], book.rate, s) : [fx + (s - t.free) * RUN_SPEED, fy]);
  // He goes down (or scores) when he reaches the gain; a loss ends in the backfield soon after the handoff.
  let end = t.handoff + 0.2;
  while (carrierAt(end)[0] < gain && end < 20) end += 1 / RATE;
  const over = Math.max(0, carrierAt(end)[0] - gain);
  const after = call.score ? 0.7 : 0.9;
  const frames = Math.ceil((end + after) * RATE) + 1;
  const local: Float32Array[] = roles.map(() => new Float32Array(frames * 2));
  const startPursuit = Math.min(0.9, end * 0.6);
  for (let f = 0; f < frames; f++) {
    const s = f / RATE;
    // The carrier.
    let [x, y] = carrierAt(Math.min(s, end));
    x -= over * Math.min(1, s / end);
    if (call.score && s > end) x += Math.min(3, (s - end) * RUN_SPEED * 0.8);
    local[c][f * 2] = x; local[c][f * 2 + 1] = y;
    for (let r = 0; r < roles.length; r++) {
      if (r === c) continue;
      const p = local[r];
      if (r < nOff || s <= startPursuit) {
        // Blockers keep to the drawing, and trail a long run downfield.
        const [px, py] = at(t.paths[roles[r]], book.rate, s);
        const late = Math.max(0, Math.min(s, end) - t.paths[roles[r]].length / 2 / book.rate);
        p[f * 2] = px + late * 3; p[f * 2 + 1] = py;
      } else if (s > end + 0.3) {
        p[f * 2] = p[f * 2 - 2]; p[f * 2 + 1] = p[f * 2 - 1];
      } else {
        // Defenders leave the drawing and chase the ball, each a step off the next man's line.
        const tx = x + ((r % 3) - 1) * 0.7, ty = y + ((r % 4) - 1.5) * 0.6;
        const dx = tx - p[f * 2 - 2], dy = ty - p[f * 2 - 1], far = Math.hypot(dx, dy);
        const step = Math.min(Math.max(0, far - 1.1), (roles[r].startsWith("D") ? ENGAGED : PURSUIT) / RATE * (call.score ? 0.85 : 1));
        p[f * 2] = p[f * 2 - 2] + (far ? dx / far * step : 0); p[f * 2 + 1] = p[f * 2 - 1] + (far ? dy / far * step : 0);
      }
    }
  }
  // The tackle: the nearest defender at the end closes the last yards so he is there at the whistle.
  let tackler = -1;
  if (!call.score) {
    const e = Math.round(end * RATE), ex = local[c][e * 2], ey = local[c][e * 2 + 1];
    let best = Infinity;
    for (let r = nOff; r < roles.length; r++) {
      const far = Math.hypot(local[r][e * 2] - ex, local[r][e * 2 + 1] - ey);
      if (far < best) { best = far; tackler = r; }
    }
    const p = local[tackler];
    // He breaks for the spot early enough to get there at a run, not a teleport.
    let span = Math.min(e - 1, Math.round(0.4 * RATE));
    while (span < e - 1 && Math.hypot(ex - p[(e - span) * 2], ey - p[(e - span) * 2 + 1]) / span * RATE > 8) span++;
    span = Math.max(1, span);
    const sx = p[(e - span) * 2], sy = p[(e - span) * 2 + 1];
    const far = Math.hypot(ex - sx, ey - sy) || 1;
    const hx = ex - (ex - sx) / far * 0.5, hy = ey - (ey - sy) / far * 0.5;
    for (let f = e - span; f < frames; f++) {
      const k = Math.min(1, (f - (e - span)) / span);
      p[f * 2] = sx + (hx - sx) * k; p[f * 2 + 1] = sy + (hy - sy) * k;
    }
  }
  // Onto the field, with the distance each man has covered.
  const pos = local.map((p) => {
    const out = new Float32Array(p.length);
    for (let f = 0; f < frames; f++) { out[f * 2] = los + dir * p[f * 2]; out[f * 2 + 1] = dir * flip * p[f * 2 + 1]; }
    return out;
  });
  const dist = pos.map((p) => {
    const d = new Float32Array(frames);
    for (let f = 1; f < frames; f++) d[f] = d[f - 1] + Math.hypot(p[f * 2] - p[f * 2 - 2], p[f * 2 + 1] - p[f * 2 - 1]);
    return d;
  });
  return { rate: RATE, dur: (frames - 1) / RATE, roles, offense: nOff, pos, dist, carrier: c, from: roles.indexOf(t.from), tackler, handoff: t.handoff, end, score: call.score, dir };
}

// Which positions fill which spots in the drawing, in the order they're handed out.
const OFFENSE: [string, string[]][] = [["QB", ["QB"]], ["RB", ["RB"]], ["WR", ["X", "Z", "SL"]], ["TE", ["TE"]], ["OT", ["LT", "RT"]], ["OG", ["LG", "RG"]], ["C", ["C"]]];
const DEFENSE: [string, string[]][] = [["EDGE", ["DE1", "DE2"]], ["IDL", ["DT1", "DT2"]], ["LB", ["MLB", "WLB", "SLB"]], ["CB", ["CB1", "CB2"]], ["S", ["FS", "SS"]]];

/**
 * Puts names and numbers on a side's eleven: the players at each position
 * with the most snaps in the box score. `must` (the ball carrier or the
 * tackler) takes the first spot at his position, or `spot` if he plays
 * somewhere the drawing has no place for.
 */
export function eleven(players: Record<string, number[]>, offense: boolean, must: string | null, spot: string): Record<string, Slot> {
  const snaps = offense ? STAT_INDEX.offSnaps : STAT_INDEX.defSnaps;
  const out: Record<string, Slot> = {};
  const used = new Set<string>();
  const put = (role: string, id: string) => {
    const p = PLAYER_BY_ID[id];
    used.add(id);
    out[role] = { role, id, number: p?.jersey ?? null, name: p?.lastName ?? p?.name ?? "" };
  };
  for (const [position, roles] of offense ? OFFENSE : DEFENSE) {
    const ids = Object.keys(players).filter((id) => PLAYER_BY_ID[id]?.position === position)
      .sort((a, b) => (players[b][snaps] ?? 0) - (players[a][snaps] ?? 0) || (a < b ? -1 : 1));
    if (must && ids.includes(must)) { ids.splice(ids.indexOf(must), 1); ids.unshift(must); }
    roles.forEach((role, i) => { if (ids[i]) put(role, ids[i]); });
  }
  if (must && !used.has(must)) put(spot, must);
  return out;
}

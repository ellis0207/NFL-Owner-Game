// What happens around a play once build.ts has worked it out: the center's
// snap, the handoff exchange, linemen and defensive backs squared up to the
// men across from them, the officials on every snap and their signals, and
// teammates running to the man who scored.
//
// It only adds men and changes what they are doing or which way they face; the
// ball, the players' paths and the result stay as build.ts made them. Like
// build.ts, it works in play space: yards from the ball at the snap, x toward
// the goal the offense attacks, y toward the offense's left.
import { ACT, type Call } from "./book";
import type { Built, Take } from "./build";

/** Frames a second, as in build.ts. */
const RATE = 20;
/** Where the sidelines are from the middle of the field. */
const SIDELINE = 26.2;

type P = [number, number];
const fr = (s: number) => Math.max(0, Math.round(s * RATE));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Lengthens a finished take: everyone holds where he was. */
export function extend(t: Take, frames: number): void {
  if (frames <= t.frames) return;
  const longer = <A extends Float32Array | Int8Array | Uint8Array>(a: A, per: number): A => {
    const out = new (a.constructor as new (n: number) => A)(frames * per);
    out.set(a);
    for (let f = t.frames; f < frames; f++) for (let k = 0; k < per; k++) out[f * per + k] = a[(t.frames - 1) * per + k];
    return out;
  };
  t.pos = t.pos.map((p) => longer(p, 2));
  t.act = t.act.map((a) => longer(a, 1));
  t.face = t.face.map((a) => longer(a, 1));
  t.ball = longer(t.ball, 3);
  t.holder = longer(t.holder, 1);
  for (const x of t.named) if (x.to >= t.frames) x.to = frames;
  t.frames = frames;
}

function mark(t: Take, i: number, from: number, to: number, act: number): void {
  if (i >= 0) t.act[i].fill(act, Math.min(t.frames, fr(from)), Math.min(t.frames, fr(to)));
}

/** One of the eight facings build.ts uses (0 is downfield, counting toward the offense's left), for a direction. */
const facing = (dx: number, dy: number) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;

const speedAt = (t: Take, i: number, f: number): P => {
  const a = Math.max(0, f - 2), b = Math.min(t.frames - 1, f + 2);
  const dt = Math.max(1, b - a) / RATE;
  return [(t.pos[i][b * 2] - t.pos[i][a * 2]) / dt, (t.pos[i][b * 2 + 1] - t.pos[i][a * 2 + 1]) / dt];
};
const firstOf = (a: Uint8Array, code: number) => a.indexOf(code);

/** Where a play stands for the officials and the signals. */
export interface Stage {
  /** The offense's yard line at the snap, and the hash the ball was on (field yards toward the offense's left is +y here). */
  ydl: number;
  hash: number;
  /** The play moved the chains. */
  first: boolean;
  /** A play from scrimmage (the officials take their places for one); field goals and tries get two under the posts. */
  scrimmage: boolean;
}

/** Everything this module adds to a finished play. */
export function stage(b: Built, call: Call, at: Stage): void {
  if (at.scrimmage) {
    exchanges(b, call);
    squareUp(b, call);
  }
  const flagged = call.kind === "flag" || call.flagged;
  if (!flagged) celebrate(b);
  if (at.scrimmage) crew(b, call, at, flagged);
  else if (call.kind === "fg" && call.style !== "blocked") posts(b, call, at);
}

/** The snap, and the ball going from the quarterback to whoever runs with it. */
function exchanges(b: Built, call: Call): void {
  const { sc, take } = b;
  if (call.kind === "flag") return;
  // The center is the lineman over the ball.
  let center = -1, near = Infinity;
  sc.men.forEach((m, i) => {
    if (m.team !== 0 || m.group !== "OL") return;
    const d = Math.hypot(take.pos[i][0] - take.ball[0], take.pos[i][1] - take.ball[1]);
    if (d < near) { near = d; center = i; }
  });
  if (center >= 0 && near < 1.5) mark(take, center, 0.05, 0.5, ACT.snap);
  const qb = sc.men.findIndex((m) => m.team === 0 && m.group === "QB");
  if (qb < 0) return;
  for (let f = 1; f < take.frames; f++) {
    const was = take.holder[f - 1], is = take.holder[f];
    if (was !== qb || is < 0 || is === qb || sc.men[is].team !== 0) continue;
    // A pitch or a handoff: the quarterback turns and puts it away, the back takes it in stride.
    if (take.act[qb][f] === ACT.auto || take.act[qb][f] === ACT.set) mark(take, qb, f / RATE - 0.25, f / RATE + 0.35, ACT.handoff);
    if (take.act[is][f] === ACT.auto) mark(take, is, f / RATE - 0.15, f / RATE + 0.3, ACT.take);
    break;
  }
}

/**
 * Who looks where: linemen squared up to the man across from them, the quarterback
 * eyes downfield on his drop, and defensive backs in man coverage backpedaling
 * with their eyes in the backfield until the receiver commits.
 */
function squareUp(b: Built, call: Call): void {
  const { sc, take } = b;
  const qb = sc.men.findIndex((m) => m.team === 0 && m.group === "QB");
  const passing = call.kind === "pass" || call.kind === "sack" || call.kind === "scramble" || call.kind === "away";
  let thrown = qb >= 0 ? firstOf(take.act[qb], ACT.throw) : -1;
  if (thrown < 0) thrown = take.frames;
  sc.men.forEach((m, i) => {
    const face = take.face[i], act = take.act[i];
    for (let f = 0; f < take.frames; f++) {
      if (face[f] >= 0) continue;
      const [vx] = speedAt(take, i, f);
      if (m.team === 0 && m.group === "OL" && act[f] === ACT.block) face[f] = 0;
      else if (m.team === 1 && m.body === "line" && act[f] === ACT.block && vx < 1) face[f] = 4;
      else if (passing && i === qb && f < thrown && take.holder[f] === qb && vx < 0.5 && f < fr(2.6)) face[f] = 0;
      else if (passing && call.man && m.team === 1 && (m.group === "CB" || m.group === "S") && f < Math.min(thrown, fr(1.1)) && vx > 0.3) face[f] = 4;
    }
  });
}

/** After a score, the nearest teammates run to the man who scored and celebrate with him. */
function celebrate(b: Built): void {
  const { sc, take } = b;
  const last = take.frames - 1;
  const scorer = sc.men.findIndex((m, i) => m.team !== 2 && take.act[i][last] === ACT.cheer && take.holder.includes(i));
  if (scorer < 0) return;
  const c0 = take.act[scorer].indexOf(ACT.cheer);
  const spot: P = [take.pos[scorer][c0 * 2], take.pos[scorer][c0 * 2 + 1]];
  // The other side pulls up once the ball is over the line.
  sc.men.forEach((m, i) => {
    if (m.team === 2 || m.team === sc.men[scorer].team || take.act[i][last] === ACT.fall) return;
    const g = Math.max(1, c0 - fr(0.6));
    let vx = take.pos[i][g * 2] - take.pos[i][(g - 1) * 2], vy = take.pos[i][g * 2 + 1] - take.pos[i][(g - 1) * 2 + 1];
    for (let f = g + 1; f < take.frames; f++) {
      vx *= 0.86; vy *= 0.86;
      take.pos[i][f * 2] = take.pos[i][(f - 1) * 2] + vx; take.pos[i][f * 2 + 1] = take.pos[i][(f - 1) * 2 + 1] + vy;
    }
  });
  const mates = sc.men.map((_m, i) => i).filter((i) => i !== scorer && sc.men[i].team === sc.men[scorer].team && take.act[i][last] !== ACT.fall)
    .map((i) => ({ i, d: Math.hypot(take.pos[i][c0 * 2] - spot[0], take.pos[i][c0 * 2 + 1] - spot[1]) }))
    .filter((x) => x.d < 24).sort((a, b) => a.d - b.d).slice(0, 3);
  if (!mates.length) return;
  const run = 7.2;
  extend(take, c0 + fr(Math.max(...mates.map((x) => x.d)) / run + 1.6));
  mates.forEach(({ i }, k) => {
    const a = (k / mates.length) * Math.PI * 2 + 0.6;
    const to: P = [spot[0] + Math.cos(a) * 1.25, spot[1] + Math.sin(a) * 1.25];
    let [x, y] = [take.pos[i][c0 * 2], take.pos[i][c0 * 2 + 1]];
    let there = -1;
    for (let f = c0 + 1; f < take.frames; f++) {
      const dx = to[0] - x, dy = to[1] - y, d = Math.hypot(dx, dy), step = run / RATE;
      if (d <= step) { x = to[0]; y = to[1]; if (there < 0) there = f; }
      else { x += (dx / d) * step; y += (dy / d) * step; }
      take.pos[i][f * 2] = x; take.pos[i][f * 2 + 1] = y;
      take.act[i][f] = there >= 0 ? ACT.cheer : ACT.auto;
      take.face[i][f] = there >= 0 ? facing(spot[0] - x, spot[1] - y) : -1;
    }
  });
}

/**
 * The seven officials, where the NFL puts them, following the ball at their own
 * pace and facing it, and the signal once the play is over: arms up for a
 * score, the wave for an incomplete pass, the point for a first down. On a foul,
 * the nearest one throws his flag.
 */
function crew(b: Built, call: Call, at: Stage, flagged: boolean): void {
  const { take } = b;
  const goal = 100 - at.ydl, back = -at.ydl - 10;
  // The sidelines and the deepest spot an official stands, in play space.
  const left = SIDELINE + 0.6 - at.hash, right = -SIDELINE - 0.6 - at.hash;
  const deep = (x: number) => clamp(x, back + 1, goal + 10.5);
  const end = Math.min(take.frames - 1, fr(b.end ?? (take.frames - 1) / RATE - 0.9));
  // Room for the signals after the whistle.
  if (!flagged) extend(take, end + fr(1.6));
  const ballX = (f: number) => take.ball[f * 3], ballY = (f: number) => take.ball[f * 3 + 1];
  type Rule = (f: number, me: P) => P;
  const posts: { group: string; at: P; pace: number; go: Rule }[] = [
    // The referee, behind the quarterback on his throwing side; he trails the play once it has gone by.
    { group: "REF", at: [-12.5, -4.5], pace: 4.5, go: (f, me) => [Math.max(me[0], Math.min(ballX(f) - 9, me[0] + 30)), me[1]] },
    // The umpire, behind the linebackers; he gives ground to the ball and follows it once it is past him.
    { group: "REF", at: [7, 2], pace: 4.2, go: (f, me) => (ballX(f) > 5 ? [ballX(f) - 4, ballY(f) + 3] : Math.hypot(ballX(f) - me[0], ballY(f) - me[1]) < 3 ? [me[0] + 1.5, me[1] + 1.5] : me) },
    // The down judge and the line judge on the line of scrimmage, one on each sideline, moving with the ball.
    { group: "REF", at: [0, left], pace: 7.6, go: (f) => [deep(ballX(f)), left] },
    { group: "REF", at: [0, right], pace: 7.6, go: (f) => [deep(ballX(f)), right] },
    // The side judge and the field judge deep on each sideline, the back judge deep in the middle.
    { group: "REF", at: [deep(18), left], pace: 7.2, go: (f, me) => [deep(Math.max(me[0], ballX(f) + 3)), left] },
    { group: "REF", at: [deep(18), right], pace: 7.2, go: (f, me) => [deep(Math.max(me[0], ballX(f) + 3)), right] },
    { group: "REF", at: [deep(25), 0], pace: 7, go: (f, me) => [deep(Math.max(me[0], ballX(f) + 7)), me[1] + (ballY(f) * 0.4 - me[1]) * 0.05] },
  ];
  // On a penalty build.ts has already sent one official in to walk it off; he stands in for the umpire.
  const walking = b.sc.men.some((m) => m.team === 2);
  const crewIds = posts.map((p, k) => (walking && k === 1 ? -1 : official(b, p.at, p.pace, p.go)));
  // The foul: the nearest official throws his flag.
  if (b.flagAt !== undefined) {
    const f = Math.min(take.frames - 1, fr(b.flagAt));
    const by = nearestTo(take, crewIds.filter((i) => i >= 0), f, [ballX(f), ballY(f)]);
    mark(take, by, b.flagAt - 0.45, b.flagAt + 0.35, ACT.toss);
  }
  if (flagged) return;
  const spot: P = [ballX(end), ballY(end)];
  const after = (end + 4) / RATE, until = (take.frames + 1) / RATE;
  if (call.score) {
    // At the goal line both wing officials and the back judge put their arms up.
    for (const i of [crewIds[2], crewIds[3], crewIds[6], crewIds[4], crewIds[5]].slice(0, 4)) mark(take, i, after, until, ACT.cheer);
  } else if (call.result === "incomplete" || call.kind === "away") {
    // The ball is dead where it lands: the two officials nearest wave it off.
    let land = end;
    for (let f = fr(0.5); f < take.frames; f++) if (take.holder[f] < 0 && take.ball[f * 3 + 2] < 0.15 && take.holder[f - 1] < 0) { land = f; break; }
    const near = [...crewIds].sort((a, c) => dist(take, a, land, [ballX(land), ballY(land)]) - dist(take, c, land, [ballX(land), ballY(land)])).slice(0, 2);
    for (const i of near) mark(take, i, (land + 3) / RATE, Math.min(until, (land + 3) / RATE + 1.3), ACT.incomplete);
  } else if (at.first && call.result === "gain") {
    // The wing official on the near side marks the spot and points the way the offense is going.
    const wing = Math.abs(spot[1] - left) < Math.abs(spot[1] - right) ? crewIds[2] : crewIds[3];
    mark(take, wing, after + 0.2, until, ACT.first);
    for (let f = fr(after + 0.2); f < take.frames; f++) take.face[wing][f] = 0;
  }
}

/** The two officials under the goalposts on a kick, and their signal: arms up for good, the wave for no good. */
function posts(b: Built, call: Call, at: Stage): void {
  const { take } = b;
  const back = 100 - at.ydl + 10;
  const ids = [3.1, -3.1].map((y) => official(b, [back + 0.5, -at.hash + y], 0, (_f, me) => me));
  for (const i of ids) take.face[i].fill(4);
  // The snap back to the holder.
  const snapper = b.sc.men.findIndex((m, i) => m.team === 0 && Math.hypot(take.pos[i][0] - take.ball[0], take.pos[i][1] - take.ball[1]) < 1);
  if (snapper >= 0) mark(take, snapper, 0, 0.6, ACT.longsnap);
  let land = take.frames - 1;
  for (let f = 1; f < take.frames; f++) if (take.ball[f * 3] > back - 10 && take.ball[f * 3 + 2] > 0.1 && take.ball[(f - 1) * 3] <= back - 10) { land = f; break; }
  const from = (land + 2) / RATE, to = (take.frames + 1) / RATE;
  for (const i of ids) mark(take, i, from, to, call.style === "good" ? ACT.cheer : ACT.incomplete);
}

/** Adds an official who starts at `start` and heads, at his pace, for wherever `go` says, facing the ball. */
function official(b: Built, start: P, pace: number, go: (f: number, me: P) => P): number {
  const { sc, take } = b;
  const i = sc.add(2, "REF", null, start, null);
  const pos = new Float32Array(take.frames * 2), face = new Int8Array(take.frames);
  let me: P = [start[0], start[1]];
  let look = facing(take.ball[0] - me[0], take.ball[1] - me[1]);
  const step = pace / RATE;
  for (let f = 0; f < take.frames; f++) {
    if (f > 3 && pace > 0) {
      const want = go(f, me);
      const dx = want[0] - me[0], dy = want[1] - me[1], d = Math.hypot(dx, dy);
      // He eases into a move rather than snapping to full speed.
      if (d > 0.25) { const k = Math.min(step, d * 0.35) / d; me = [me[0] + dx * k, me[1] + dy * k]; }
    }
    pos[f * 2] = me[0]; pos[f * 2 + 1] = me[1];
    const bx = take.ball[f * 3] - me[0], by = take.ball[f * 3 + 1] - me[1];
    if (Math.hypot(bx, by) > 1.5) look = facing(bx, by);
    face[f] = look;
  }
  take.pos.push(pos);
  take.act.push(new Uint8Array(take.frames));
  take.face.push(face);
  return i;
}

const dist = (t: Take, i: number, f: number, p: P) => Math.hypot(t.pos[i][f * 2] - p[0], t.pos[i][f * 2 + 1] - p[1]);
function nearestTo(t: Take, who: number[], f: number, p: P): number {
  return who.reduce((a, c) => (dist(t, c, f, p) < dist(t, a, f, p) ? c : a), who[0]);
}

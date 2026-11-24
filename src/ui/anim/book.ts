// The shapes of the animation's data: the play book drawn in Blender
// (pipeline/anim/export_plays.py), what a row of the play-by-play says in the
// animation's terms, and a play worked out frame by frame.

/** The groups a lineup is written in, in `GameLog.who` order. */
export const OFFENSE_GROUPS = ["QB", "RB", "FB", "WR", "TE", "OL"] as const;
export const DEFENSE_GROUPS = ["EDGE", "IDL", "LB", "CB", "S"] as const;

export interface PlayBook {
  /** Samples a second in every path. */
  rate: number;
  /** Where each offensive group lines up, by the quarterback's spot and the personnel: [x, y] in yards from the ball. */
  formations: Record<string, Record<string, Record<string, [number, number][]>>>;
  /** The route tree: x then y in tenths of a yard from the receiver's stance, +y toward his sideline. */
  routes: Record<string, number[]>;
  /** Handoffs to the left: the back's path and the quarterback's, from the ball, in tenths of a yard. */
  runs: { formation: string; where: string; handoff: number; free: number; back: number[]; qb: number[] }[];
}

/** A sampled path at a time, in yards. It holds its last point once it runs out. */
export function sample(path: number[], rate: number, t: number): [number, number] {
  const last = path.length / 2 - 1;
  const f = Math.min(last, Math.max(0, t * rate));
  const i = Math.min(last - 1, Math.floor(f)), k = f - i;
  return [(path[i * 2] * (1 - k) + path[i * 2 + 2] * k) / 10, (path[i * 2 + 1] * (1 - k) + path[i * 2 + 3] * k) / 10];
}

/** One player on the field: who he is, when the log or the box score says. */
export interface Slot {
  id: string | null;
  number: number | null;
  name: string;
}

/** What a row of the play-by-play says happened, in the terms the animation needs. */
export interface Call {
  kind: "run" | "keep" | "kneel" | "pass" | "sack" | "scramble" | "away" | "kickoff" | "punt" | "fg" | "flag";
  /** The side of the field the play went to, as the offense sees it: 1 left, 0 middle, -1 right. */
  lane: 1 | 0 | -1;
  /** Runs: the hole. */
  where: "middle" | "tackle" | "end";
  /**
   * Runs by the quarterback: sneak, draw, option or keep. Passes: how deep the throw went (c screen, s short,
   * i intermediate, d deep). Kicks: touchback, return, fair, downed, out, muff, blocked, onside, good, left, right or short.
   * A flag before the snap: the foul's name.
   */
  style: string;
  result: "gain" | "incomplete" | "picked";
  /** Yards past the line of scrimmage where the play ended (kicks: how far the kick went). */
  gain: number;
  /** Where the other team takes over after a punt or an interception, in yards past the line of scrimmage, when the log's next snap says. */
  next: number | null;
  /** Yards a kick or an interception was brought back. */
  ret: number;
  score: boolean;
  fumble: boolean;
  /** A fumble the other side recovered, and who the feed says fell on it. */
  turnover: boolean;
  recoverer?: string;
  /** A penalty in the feed's words: who, what and how far. */
  caption?: string;
  /** An onside kick the kicking team got back. */
  kept?: boolean;
  /**
   * The try after a touchdown, which the feed keeps on the touchdown's own row: a kick or a play for two, whether
   * it counted, which club tried it and the kicker when the row says.
   */
  try?: { two: boolean; good: boolean; blocked?: boolean; side: 0 | 1; kicker?: string; kickerName?: string };
  /** Wiped out by a flag after it was run. */
  flagged: boolean;
  brokenUp: boolean;
  formation: string;
  playAction: boolean;
  blitz: boolean;
  man: boolean;
  twoHigh: boolean;
  /** The men the row names, by what they did. */
  ids: { carrier?: string; passer?: string; target?: string; tackler?: string; picker?: string; sacker?: string; kicker?: string; returner?: string };
  /** Names from the feed for kicks, where the log keeps no lineups. */
  names: { kicker?: string; returner?: string };
  /** The lineups on the field, group by group, when the log has them. */
  off: string[][] | null;
  def: string[][] | null;
}

// What a player is doing, when it isn't simply standing or running: kept per frame in `Track.act`.
export const ACT = {
  auto: 0, fall: 1, throw: 2, kick: 3, block: 4, catch: 5, cheer: 6, kneel: 7, set: 8,
  // The exchanges: the center's snap (a long snap to a holder or punter), the quarterback's handoff and the back taking it.
  snap: 9, longsnap: 10, handoff: 11, take: 12,
  // The officials' signals; a touchdown or a good kick is `cheer` with the arms straight up.
  incomplete: 13, first: 14, toss: 15,
} as const;

/** A play worked out frame by frame, in field yards (x from the away goal line, y from midfield toward the far sideline). */
export interface Track {
  /** Frames a second, and seconds the whole thing lasts. */
  rate: number;
  dur: number;
  /** Per player: which club (0 has the ball at the snap, 2 is an official), which body, and who he is. */
  team: (0 | 1 | 2)[];
  body: string[];
  slot: (Slot | null)[];
  /** Per player: x, y for every frame; the distance covered so far (it paces the stride); what he is doing; which way he faces when that isn't where he is going (-1). */
  pos: Float32Array[];
  dist: Float32Array[];
  act: Uint8Array[];
  face: Int8Array[];
  /** The ball: x, y and height for every frame, and who holds it (-1 in the air or on the ground). */
  ball: Float32Array;
  holder: Int8Array;
  /** Players whose names show, with the frames between which they do. */
  named: { who: number; from: number; to: number }[];
  /** A flag on the field: the frame it lands and where. */
  flag: [number, number, number] | null;
  /** Words shown over the field from a frame on: a foul and its yards, or what became of a kick. */
  caption: [number, string] | null;
  /** The stretch of field the play covers, for the camera. */
  span: [number, number];
  /** +1 when the offense heads toward x = 100. */
  dir: 1 | -1;
  /** Per player: his group in the lineup (QB, OL, CB, K, REF...), which picks his stance and moves in 3D. */
  group?: string[];
  /** Frames between which a loose ball tumbles end over end (a kick) instead of spiraling. */
  tumble?: [number, number];
  /** The try after a touchdown, played once this is over. */
  then?: Track;
}

// How each scheme family plays. The game engine reads these tendencies to
// call plays, and each kind of play leans on different player traits, so a
// roster that fits its coaches' scheme plays better than one that doesn't.
import type { DefenseScheme, OffenseScheme, Position } from "./types";

export type Personnel = "10" | "11" | "12" | "13" | "21";
export type RunType = "outsideZone" | "insideZone" | "gap" | "qbRun";

export interface OffenseStyle {
  /** Share of plays that are passes on a neutral down and distance. */
  passRate: number;
  /** Share of early-down dropbacks with a play fake. */
  playAction: number;
  /** Share of passes that are screens, short (under 10 air yards), and deep (20+). The rest are intermediate. */
  screen: number;
  short: number;
  deep: number;
  runMix: Record<RunType, number>;
  personnel: Partial<Record<Personnel, number>>;
  /** Multipliers on how often backs and tight ends are targeted. */
  rbTargets: number;
  teTargets: number;
  /** Pre-snap motion and shifts (0-1): helps receivers against man coverage and runners against slow fronts. */
  motion: number;
  /** Seconds between plays relative to a normal huddle (negative = faster). */
  tempo: number;
  /** Which traits the scheme asks for, by position: used for fit and scouting language. */
  wants: Partial<Record<Position, Record<string, number>>>;
}

export interface DefenseStyle {
  front: "34" | "43";
  /** Share of dropbacks met with five or more rushers. */
  blitz: number;
  /** Share of snaps in man coverage (the rest zone). */
  man: number;
  /** Share of snaps with two deep safeties. */
  twoHigh: number;
  /** Willingness to play light boxes: worse against the run, better against explosive passes. */
  lightBox: number;
  /** Disguise and post-snap rotation (0-1): more quarterback mistakes. */
  disguise: number;
  /** Week-to-week plans that take away the opponent's top receiver (0-1). */
  gamePlan: number;
  wants: Partial<Record<Position, Record<string, number>>>;
}

export const OFFENSE: Record<OffenseScheme, OffenseStyle> = {
  wideZone: {
    passRate: 0.53, playAction: 0.3, screen: 0.08, short: 0.46, deep: 0.11,
    runMix: { outsideZone: 0.55, insideZone: 0.2, gap: 0.2, qbRun: 0.05 },
    personnel: { "11": 0.55, "12": 0.2, "21": 0.22, "13": 0.03 },
    rbTargets: 1.1, teTargets: 1.1, motion: 0.8, tempo: 0,
    wants: {
      QB: { accuracy: 1, decisions: 1, mobility: 0.5 }, RB: { vision: 1, burst: 1, receiving: 0.5 },
      WR: { yac: 1, routes: 0.7, strength: 0.4 }, TE: { blocking: 1, receiving: 0.7 },
      OT: { agility: 1, runBlock: 0.8, passBlock: 0.6 }, OG: { agility: 1, runBlock: 0.8 }, C: { agility: 1, runBlock: 0.8 },
      FB: { blocking: 1, receiving: 0.5 },
    },
  },
  mcvay: {
    passRate: 0.58, playAction: 0.27, screen: 0.07, short: 0.45, deep: 0.12,
    runMix: { outsideZone: 0.45, insideZone: 0.3, gap: 0.2, qbRun: 0.05 },
    personnel: { "11": 0.75, "12": 0.17, "13": 0.03, "21": 0.05 },
    rbTargets: 0.9, teTargets: 1.0, motion: 0.75, tempo: 0,
    wants: {
      QB: { decisions: 1, accuracy: 1, arm: 0.5 }, RB: { vision: 1, burst: 0.7 },
      WR: { routes: 1, yac: 0.8, strength: 0.4 }, TE: { blocking: 0.8, receiving: 0.8 },
      OT: { agility: 1, passBlock: 0.8, runBlock: 0.6 }, OG: { agility: 0.8, runBlock: 0.8 }, C: { agility: 0.8, passBlock: 0.8 },
    },
  },
  westCoast: {
    passRate: 0.6, playAction: 0.18, screen: 0.12, short: 0.55, deep: 0.1,
    runMix: { outsideZone: 0.2, insideZone: 0.35, gap: 0.38, qbRun: 0.07 },
    personnel: { "11": 0.62, "12": 0.25, "21": 0.08, "13": 0.05 },
    rbTargets: 1.35, teTargets: 1.2, motion: 0.6, tempo: 0,
    wants: {
      QB: { accuracy: 1, decisions: 1 }, RB: { receiving: 1, vision: 0.7 },
      WR: { routes: 1, hands: 0.8, yac: 0.6 }, TE: { receiving: 1, hands: 0.7 },
      OT: { passBlock: 1 }, OG: { passBlock: 0.8, runBlock: 0.6 }, C: { passBlock: 0.8 },
    },
  },
  erhardtPerkins: {
    passRate: 0.57, playAction: 0.2, screen: 0.07, short: 0.48, deep: 0.12,
    runMix: { outsideZone: 0.15, insideZone: 0.35, gap: 0.45, qbRun: 0.05 },
    personnel: { "11": 0.5, "12": 0.35, "13": 0.08, "21": 0.07 },
    rbTargets: 1.0, teTargets: 1.4, motion: 0.45, tempo: 0,
    wants: {
      QB: { decisions: 1, accuracy: 0.8, arm: 0.5 }, RB: { power: 1, vision: 0.7 },
      WR: { routes: 1, hands: 0.7 }, TE: { receiving: 1, blocking: 0.8 },
      OT: { passBlock: 1, strength: 0.5 }, OG: { strength: 1, runBlock: 1 }, C: { strength: 0.8, runBlock: 0.8 },
    },
  },
  spread: {
    passRate: 0.57, playAction: 0.2, screen: 0.09, short: 0.46, deep: 0.14,
    runMix: { outsideZone: 0.15, insideZone: 0.35, gap: 0.25, qbRun: 0.25 },
    personnel: { "11": 0.7, "10": 0.1, "12": 0.17, "21": 0.03 },
    rbTargets: 0.9, teTargets: 0.9, motion: 0.45, tempo: -6,
    wants: {
      QB: { mobility: 1, arm: 0.8, speed: 0.6 }, RB: { burst: 1, vision: 0.7 },
      WR: { speed: 0.8, deep: 0.8, routes: 0.6 }, TE: { receiving: 1 },
      OT: { passBlock: 1, agility: 0.6 }, OG: { passBlock: 0.8, runBlock: 0.6 }, C: { passBlock: 0.8 },
    },
  },
  vertical: {
    passRate: 0.61, playAction: 0.2, screen: 0.06, short: 0.4, deep: 0.17,
    runMix: { outsideZone: 0.2, insideZone: 0.35, gap: 0.35, qbRun: 0.1 },
    personnel: { "11": 0.78, "12": 0.14, "10": 0.05, "21": 0.03 },
    rbTargets: 0.8, teTargets: 0.85, motion: 0.4, tempo: -3,
    wants: {
      QB: { arm: 1, accuracy: 0.7 }, RB: { burst: 0.8, receiving: 0.5 },
      WR: { deep: 1, speed: 1, hands: 0.5 }, TE: { receiving: 1 },
      OT: { passBlock: 1.2 }, OG: { passBlock: 1 }, C: { passBlock: 1 },
    },
  },
  gapMotion: {
    passRate: 0.55, playAction: 0.28, screen: 0.1, short: 0.44, deep: 0.13,
    runMix: { outsideZone: 0.2, insideZone: 0.25, gap: 0.5, qbRun: 0.05 },
    personnel: { "11": 0.5, "12": 0.32, "13": 0.1, "21": 0.08 },
    rbTargets: 1.05, teTargets: 1.15, motion: 0.9, tempo: 0,
    wants: {
      QB: { arm: 0.8, accuracy: 0.8, decisions: 0.6 }, RB: { power: 1, vision: 0.8, burst: 0.5 },
      WR: { yac: 0.8, routes: 0.8, strength: 0.5 }, TE: { blocking: 1, receiving: 0.8 },
      OT: { runBlock: 1, strength: 0.8, passBlock: 0.6 }, OG: { strength: 1, runBlock: 1 }, C: { strength: 0.8, runBlock: 1 },
      FB: { blocking: 1 },
    },
  },
};

export const DEFENSE: Record<DefenseScheme, DefenseStyle> = {
  fangio: {
    front: "34", blitz: 0.17, man: 0.24, twoHigh: 0.62, lightBox: 0.7, disguise: 0.7, gamePlan: 0.4,
    wants: {
      S: { range: 1, coverage: 1 }, CB: { zone: 1, speed: 0.5 }, LB: { coverage: 1, runStop: 0.6 },
      IDL: { runStop: 1, strength: 0.8 }, EDGE: { passRush: 1, runStop: 0.5 },
    },
  },
  cover3: {
    front: "43", blitz: 0.22, man: 0.3, twoHigh: 0.3, lightBox: 0.35, disguise: 0.35, gamePlan: 0.3,
    wants: {
      EDGE: { passRush: 1, speed: 1 }, CB: { press: 1, zone: 0.8, strength: 0.5 }, S: { range: 1, box: 0.6 },
      LB: { speed: 1, coverage: 0.8 }, IDL: { passRush: 0.8, agility: 0.6 },
    },
  },
  pressure: {
    front: "43", blitz: 0.37, man: 0.48, twoHigh: 0.38, lightBox: 0.4, disguise: 0.55, gamePlan: 0.4,
    wants: {
      CB: { man: 1, speed: 0.8 }, LB: { blitz: 1, speed: 0.6 }, S: { box: 0.8, coverage: 0.8 },
      EDGE: { passRush: 1 }, IDL: { passRush: 1 },
    },
  },
  multiple: {
    front: "34", blitz: 0.25, man: 0.45, twoHigh: 0.45, lightBox: 0.5, disguise: 0.6, gamePlan: 0.8,
    wants: {
      CB: { man: 1, press: 0.6 }, LB: { coverage: 0.8, runStop: 0.8, blitz: 0.5 }, S: { coverage: 1, box: 0.6 },
      EDGE: { runStop: 0.8, passRush: 0.8 }, IDL: { runStop: 1 },
    },
  },
  macdonald: {
    front: "34", blitz: 0.28, man: 0.35, twoHigh: 0.5, lightBox: 0.5, disguise: 0.85, gamePlan: 0.6,
    wants: {
      S: { coverage: 1, range: 0.8, box: 0.5 }, LB: { blitz: 1, coverage: 0.8 }, IDL: { passRush: 1 },
      CB: { zone: 0.8, man: 0.8 }, EDGE: { passRush: 1, runStop: 0.5 },
    },
  },
};

/** What each scheme is called in front-office language. */
export const OFFENSE_LABEL: Record<OffenseScheme, string> = {
  wideZone: "Wide zone", mcvay: "McVay-style wide zone", westCoast: "West Coast", erhardtPerkins: "Erhardt-Perkins",
  spread: "Spread and RPO", vertical: "Vertical passing", gapMotion: "Gap and motion",
};
export const DEFENSE_LABEL: Record<DefenseScheme, string> = {
  fangio: "Fangio two-high 3-4", cover3: "Seattle Cover 3 4-3", pressure: "Pressure and man",
  multiple: "Belichick multiple", macdonald: "Macdonald multiple",
};

// Our college scouts as people, and what we ask them to weigh.
//
// The scouting director runs a small staff of area and position scouts. Each
// one covers a group of positions he knows best, which sharpens our reads on
// those prospects, and each has a lean every scout has: some fall for
// workout warriors, some trust college production too much, some think the
// big conferences are the only real football. The scouts and their leans are
// made up for the game; their names come from the shared name lists.
//
// The owner sets the department's emphasis: how much weight tape, testing and
// production get. Tape first is the most reliable and the slowest; leaning on
// testing or production speeds the work up and exaggerates those leans.
import { COLLEGE_TEAM, CONFERENCES } from "./collegeData";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { draftClass } from "./prospects";
import { rngFor } from "./rng";
import type { GameState, Position } from "./types";

export type ScoutGroup = "QB" | "OL" | "DL" | "skill" | "back7";
export type Lean = "athletes" | "production" | "prestige" | "none";
export type Emphasis = "balanced" | "tape" | "testing" | "production";

export interface Scout {
  id: string;
  name: string;
  group: ScoutGroup;
  lean: Lean;
  /** How good his eye is, 40 to 85 (engine only). */
  eye: number;
  since: number;
}

export interface ScoutStaffState {
  staff: Scout[];
  emphasis: Emphasis;
  /** Scouts hired so far, for new ids and names. */
  hired: number;
}

export const GROUPS: Record<ScoutGroup, string> = {
  QB: "Quarterbacks", OL: "Offensive line", DL: "Defensive line", skill: "Backs, receivers and tight ends", back7: "Linebackers and secondary",
};

export const LEANS: Record<Lean, string> = {
  athletes: "Loves a workout warrior",
  production: "Trusts college numbers",
  prestige: "Big-conference guy",
  none: "Calls them as he sees them",
};

export const EMPHASES: Record<Emphasis, { label: string; what: string }> = {
  balanced: { label: "Balanced", what: "Tape, testing, production and interviews in the usual mix." },
  tape: { label: "Tape first", what: "The most reliable reads, and the slowest: about 10% less ground covered each week." },
  testing: { label: "Testing", what: "Leans on the combine and pro days. Faster, but it overrates great athletes." },
  production: { label: "Production", what: "Leans on college stats. Faster, but it overrates big numbers in good systems." },
};

/** What it costs to let a scout go and bring in a new one. */
export const REPLACE_COST = 150_000;

const GROUP_OF: Partial<Record<Position, ScoutGroup>> = {
  QB: "QB", OT: "OL", OG: "OL", C: "OL", EDGE: "DL", IDL: "DL", RB: "skill", FB: "skill", WR: "skill", TE: "skill", LB: "back7", CB: "back7", S: "back7",
};

export function groupOf(pos: Position): ScoutGroup | undefined {
  return GROUP_OF[pos];
}

function newScout(state: GameState, n: number, group: ScoutGroup, season: number): Scout {
  const rng = rngFor(state.seed, `scout-hire:${n}`);
  const leans: Lean[] = ["athletes", "production", "prestige", "none", "none"];
  return {
    id: `scout-${n}`,
    name: `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`,
    group,
    lean: leans[Math.floor(rng() * leans.length)],
    eye: Math.round(40 + 45 * (rng() + rng()) / 2),
    since: season,
  };
}

export function scouts(state: GameState): ScoutStaffState {
  if (state.scouts) return state.scouts;
  const season = Number(state.date.slice(0, 4));
  const groups: ScoutGroup[] = ["QB", "OL", "DL", "skill", "back7"];
  state.scouts = { staff: groups.map((g, i) => newScout(state, i + 1, g, season)), emphasis: "balanced", hired: groups.length };
  return state.scouts;
}

export function ensureScouts(state: GameState): void {
  scouts(state);
}

export function setEmphasis(state: GameState, e: Emphasis): void {
  scouts(state).emphasis = e;
}

/** Lets a scout go and hires another for the same group. Returns the new scout. */
export function replaceScout(state: GameState, id: string): Scout | null {
  const s = scouts(state);
  const i = s.staff.findIndex((x) => x.id === id);
  if (i < 0) return null;
  s.hired++;
  const next = newScout(state, s.hired, s.staff[i].group, Number(state.date.slice(0, 4)));
  s.staff[i] = next;
  if (state.college) state.college.scouting.spent += REPLACE_COST;
  return next;
}

/** The scout covering a prospect's position for us. */
export function scoutFor(state: GameState, pos: Position): Scout | undefined {
  const g = groupOf(pos);
  return g ? scouts(state).staff.find((x) => x.group === g) : undefined;
}

/** How much a specialist sharpens our reads on his group: a multiplier on the error. */
export function specialistFactor(state: GameState, pos: Position): number {
  const s = scoutFor(state, pos);
  return s ? 0.92 - (s.eye - 60) / 500 : 1;
}

/** How fast our scouting covers ground this week, from the emphasis. */
export function paceFactor(state: GameState): number {
  return { balanced: 1, tape: 0.9, testing: 1.08, production: 1.08 }[scouts(state).emphasis];
}

// ---- Leans (engine only) ----

const athletic = new Map<number, Record<string, number>>();

/** Each prospect's forty against others at his position, in standard deviations (faster is positive). */
function athleticZ(seed: number): Record<string, number> {
  let z = athletic.get(seed);
  if (z) return z;
  const dc = draftClass(seed);
  const byPos: Record<string, number[]> = {};
  for (const p of dc.prospects) (byPos[p.position] ??= []).push(dc.hidden[p.id].forty);
  const stats = Object.fromEntries(Object.entries(byPos).map(([pos, xs]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 0.1;
    return [pos, { m, sd }];
  }));
  z = {};
  for (const p of dc.prospects) {
    const s = stats[p.position];
    z[p.id] = Math.max(-2.5, Math.min(2.5, (s.m - dc.hidden[p.id].forty) / s.sd));
  }
  if (athletic.size > 4) athletic.clear();
  athletic.set(seed, z);
  return z;
}

/**
 * How far our scouts' leans push a prospect's value from where an unbiased
 * eye would put it, in the value's own points. Comes from the covering
 * scout's lean and the department's emphasis.
 */
export function leanBias(state: GameState, id: string): number {
  const dc = draftClass(state.seed);
  const p = dc.byId[id];
  const h = dc.hidden[id];
  if (!p || !h) return 0;
  const s = scouts(state);
  const scout = scoutFor(state, p.position);
  const w = { athletes: 0, production: 0, prestige: 0 };
  const e = s.emphasis;
  if (e === "testing") w.athletes += 0.6;
  else if (e === "production") w.production += 0.6;
  else if (e === "balanced") { w.athletes += 0.15; w.production += 0.15; }
  if (scout && scout.lean !== "none") w[scout.lean] += e === "tape" ? 0.5 : 1;
  const az = athleticZ(state.seed)[id] ?? 0;
  const pz = Math.max(-2, Math.min(2, (h.college - h.overall) / 6));
  const power = CONFERENCES[COLLEGE_TEAM[p.school]?.conference]?.power ? 1 : -1;
  return w.athletes * 1.1 * az + w.production * 1.0 * pz + w.prestige * 1.0 * power;
}

/** The scout's own words about his lean on a prospect, when it's strong enough to color the report. */
export function leanNote(state: GameState, id: string): string | undefined {
  const dc = draftClass(state.seed);
  const p = dc.byId[id];
  const scout = p ? scoutFor(state, p.position) : undefined;
  if (!scout || scout.lean === "none") return undefined;
  const b = leanBias(state, id);
  if (Math.abs(b) < 1) return undefined;
  const who = scout.name.split(" ").slice(-1)[0];
  if (scout.lean === "athletes") return b > 0 ? `${who} is high on his workout numbers.` : `${who} thinks he tested like a backup.`;
  if (scout.lean === "production") return b > 0 ? `${who} keeps pointing to his college production.` : `${who} can't get past his thin stat line.`;
  return b > 0 ? `${who} likes that he did it against big-conference competition.` : `${who} wonders about the level of competition.`;
}

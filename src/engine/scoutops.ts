// The scouting department as an operation: how its budget is split, the
// national scout who cross-checks the top of the board, the pro scouts who
// write up next week's opponent, the separate boards a war room keeps,
// college stats read against the schedule and the system, the race for
// undrafted free agents after the last pick, and the analysts' own pick on
// the clock.
//
// Budget split: travel buys more looks (faster files), video sharpens every
// read, medical gets the doctors' file earlier, and data feeds the
// expected-value board. Shares sum to one; the default is what the
// department did before the owner touched it, so nothing changes until then.
// The national scout and pro scouts are made up, named from the shared lists.
import { COLLEGE_TEAM } from "./collegeData";
import { prospectLog } from "./college";
import { addDays, weekday } from "./dates";
import { send } from "./inbox";
import { PLAYER_BY_ID, RULES, SCHEDULE, TEAM_BY_ID } from "./league";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { draftClass } from "./prospects";
import { rngFor } from "./rng";
import { scoutReport, perceivedValue, knowledge, fitRead } from "./scouting";
import { seasonAdv } from "./strategy";
import { seasonTotals } from "./stats";
import { teamSchemes } from "./staff";
import { OFFENSE } from "./schemes";
import type { GameState, Position } from "./types";

export interface ScoutSplit { travel: number; video: number; medical: number; data: number }
export const DEFAULT_SPLIT: ScoutSplit = { travel: 0.4, video: 0.3, medical: 0.15, data: 0.15 };

export interface ProScout { name: string; eye: number; since: number }

export interface ScoutOpsState {
  split: ScoutSplit;
  national: ProScout;
  pros: ProScout[];
  /** Advance reports on our next opponents, newest first. */
  advance: { gameId: string; opp: string; date: string; notes: string[] }[];
  /** Bonus offers to undrafted players, made before the last pick (player id to signing bonus). */
  udfa: Record<string, number>;
  /** How the race for undrafted players went: who chose us and who went elsewhere. */
  udfaLog?: { year: number; won: string[]; lost: [string, string][] };
}

function person(state: GameState, key: string): ProScout {
  const rng = rngFor(state.seed, key);
  return { name: `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`, eye: Math.round(45 + rng() * 40), since: RULES.season - Math.floor(rng() * 8) };
}

export function scoutOps(state: GameState): ScoutOpsState {
  return (state.scoutOps ??= {
    split: { ...DEFAULT_SPLIT },
    national: person(state, "national-scout"),
    pros: [person(state, "pro-scout:1"), person(state, "pro-scout:2")],
    advance: [], udfa: {},
  });
}

/** Sets the split; shares are normalized to sum to one. */
export function setSplit(state: GameState, split: ScoutSplit): void {
  const total = split.travel + split.video + split.medical + split.data || 1;
  scoutOps(state).split = { travel: split.travel / total, video: split.video / total, medical: split.medical / total, data: split.data / total };
}

/** How the split moves the work: scouting gain, read error, the medical threshold and the value board's noise. */
export function splitFactors(state: GameState): { gain: number; error: number; medicalAt: number; data: number } {
  const s = state.scoutOps?.split ?? DEFAULT_SPLIT;
  return {
    gain: 0.8 + s.travel * 0.5,
    error: (1.06 - s.video * 0.2) * (state.analysts?.feeds.film ? 0.96 : 1),
    medicalAt: Math.max(60, Math.min(92, 85 - (s.medical - 0.15) * 110)),
    data: (1.15 - s.data) * (state.analysts?.feeds.college ? 0.85 : 1),
  };
}

/** The national scout's cross-check: tighter reads on the top hundred names. */
export function crossCheck(state: GameState, id: string): number {
  const hype = state.college?.hype;
  if (!hype || !state.scoutOps) return 1;
  const rank = Object.values(hype).filter((v) => v > (hype[id] ?? 0)).length;
  return rank < 100 ? 1 - (state.scoutOps.national.eye - 45) / 400 : 1;
}

// ---- Pro scouting of opponents ----

/** The pro scouts' edge in preparing a game plan, in plan points (0 to about 2.5). */
export function advanceBonus(state: GameState): number {
  const pros = state.scoutOps?.pros;
  if (!pros?.length) return 0;
  const eye = pros.reduce((t, p) => t + p.eye, 0) / pros.length;
  return Math.max(0, (eye - 45) / 16) * (0.7 + (state.scoutOps!.split.video ?? 0.3));
}

/** The advance report on the next opponent: who is producing, how they play, who is hurt. */
export function advanceReport(state: GameState, opp: string): string[] {
  const notes: string[] = [];
  const totals = seasonTotals(state, "REG");
  const theirs = Object.entries(totals).filter(([id]) => state.players[id]?.team === opp);
  const top = (key: string, label: string) => {
    const best = theirs.map(([id, r]) => [id, Number((r.line as Record<string, number>)[key] ?? 0)] as const).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) notes.push(`${label}: ${PLAYER_BY_ID[best[0]].name}, ${best[1]}.`);
  };
  top("passYds", "Passing yards");
  top("rushYds", "Rushing yards");
  top("recYds", "Receiving yards");
  top("sacks", "Sacks");
  top("pressures", "Pressures");
  const adv = seasonAdv(state)[opp];
  const sch = teamSchemes(opp);
  if (adv && adv.off.pn + adv.off.rn > 40) {
    const passRate = adv.off.pn / (adv.off.pn + adv.off.rn);
    notes.push(`They throw on ${Math.round(passRate * 100)}% of plays (their scheme usually throws ${Math.round(OFFENSE[sch.offense].passRate * 100)}%).`);
  } else notes.push(`Early in the year: their scheme throws about ${Math.round(OFFENSE[sch.offense].passRate * 100)}% of the time.`);
  const hurt = Object.entries(state.players).filter(([, p]) => p.team === opp && p.injury && p.status !== "ir").slice(0, 4);
  if (hurt.length) notes.push(`Hurt: ${hurt.map(([id]) => `${PLAYER_BY_ID[id].position} ${PLAYER_BY_ID[id].name}`).join(", ")}.`);
  const innov = state.analytics?.innovations?.find((x) => x.team === opp && RULES.season - x.season <= 1);
  if (innov) notes.push(`Watch for ${innov.idea}: it's new, and it has given defenses trouble.`);
  return notes;
}

// ---- Boards ----

export interface BoardRow { id: string; value: number; pos: Position; risk: number; riskWord: string; fit: number; ev: number }

/**
 * The war room's boards from one set of reads: overall value, the risk in
 * each read (how well we know him, his medical file, makeup questions), how
 * he fits our schemes, and expected value (value less a price for the risk,
 * sharper with more data). Only what our scouts know goes in.
 */
export function draftBoards(state: GameState, ids: string[]): BoardRow[] {
  const dc = draftClass(state.seed);
  const data = splitFactors(state).data;
  return ids.filter((id) => knowledge(state, id) >= 10).map((id) => {
    const r = scoutReport(state, id);
    const k = r.knowledge;
    const flags = (r.medical && !/^Clean/.test(r.medical) ? 2 : 0) + r.makeup.filter((m) => /questions|red flags|slow|habits/.test(m)).length;
    const risk = Math.round(((100 - k) / 25 + flags) * 10) / 10;
    const value = perceivedValue(state, id);
    const fit = Math.round(fitRead(state, id, state.userTeam) * 10) / 10;
    return { id, value, pos: dc.byId[id].position, risk, riskWord: risk >= 4 ? "High" : risk >= 2 ? "Medium" : "Low", fit, ev: value - risk * 0.6 * data + fit * 0.2 };
  });
}

// ---- College stats against the schedule ----

/**
 * A prospect's production per game, raw and adjusted: games against strong
 * opponents count for more, weak ones for less (by each opponent's preseason
 * standing, which everyone knows), and passing numbers from offenses that
 * throw a lot are scaled down to what a balanced offense would give him.
 */
export function adjustedProduction(state: GameState, id: string): { games: number; raw: number; adjusted: number; schedule: string; system: string } | null {
  const log = prospectLog(state, id).filter((g) => Object.keys(g.line).length);
  if (!log.length) return null;
  const p = draftClass(state.seed).byId[id];
  const score = (l: Record<string, number>) => {
    const v = (k: string) => l[k] ?? 0;
    return v("passYds") / 25 + v("passTd") * 4 - v("int") * 2 + v("rushYds") / 10 + v("rushTd") * 6 + v("rec") * 0.5 + v("recYds") / 10 + v("recTd") * 6
      + v("tkl") * 0.6 + v("tfl") * 2 + v("sacks") * 5 + v("defInt") * 6 + v("pd") * 1.5 + v("fgm") * 3;
  };
  let raw = 0;
  let adj = 0;
  let opp = 0;
  for (const g of log) {
    const s = score(g.line);
    const strength = COLLEGE_TEAM[g.opp]?.strength ?? 50;
    const w = Math.max(0.6, Math.min(1.5, 1 + (strength - 60) / 50));
    raw += s;
    adj += s * w;
    opp += strength;
  }
  const passHeavy = ["QB", "WR", "TE"].includes(p.position) ? Math.min(1.25, Math.max(0.85, (log.reduce((t, g) => t + (g.line.att ?? g.line.tgt ?? 0), 0) / log.length) / (p.position === "QB" ? 32 : 7))) : 1;
  const avgOpp = opp / log.length;
  return {
    games: log.length,
    raw: Math.round((raw / log.length) * 10) / 10,
    adjusted: Math.round((adj / log.length / passHeavy) * 10) / 10,
    schedule: avgOpp >= 68 ? "a hard schedule" : avgOpp >= 55 ? "an average schedule" : "a soft schedule",
    system: passHeavy >= 1.1 ? "a pass-heavy system that pads his numbers" : passHeavy <= 0.92 ? "a run-first system that hides some of his production" : "a balanced system",
  };
}

// ---- Undrafted free agents ----

export const UDFA_BUDGET = 1_500_000;

/** Bonus offers to undrafted players, made from the board before the draft ends. */
export function offerUdfa(state: GameState, id: string, bonus: number): string | null {
  const o = scoutOps(state);
  if (state.draft?.made.some((m) => m.player === id)) return "He's been drafted.";
  const total = Object.entries(o.udfa).filter(([x]) => x !== id).reduce((t, [, b]) => t + b, 0);
  if (bonus <= 0) { delete o.udfa[id]; return null; }
  if (total + bonus > UDFA_BUDGET) return `That's over our ${Math.round(UDFA_BUDGET / 1000)}K budget for undrafted bonuses.`;
  o.udfa[id] = Math.round(bonus / 5000) * 5000;
  return null;
}

/**
 * Right after the last pick: each player we offered weighs our bonus and
 * the chance to make our roster against the best rival offer. The rivals'
 * interest follows the consensus on him. Returns the players who chose us.
 */
export function resolveUdfaRace(state: GameState, pool: Set<string>, depth: (pos: Position) => number): { won: [string, number][]; lost: [string, string][] } {
  const o = state.scoutOps;
  const won: [string, number][] = [];
  const lost: [string, string][] = [];
  if (!o) return { won, lost };
  const hype = state.college?.hype ?? {};
  const values = Object.values(hype).sort((a, b) => b - a);
  const teams = Object.keys(TEAM_BY_ID).filter((t) => t !== state.userTeam);
  for (const [id, bonus] of Object.entries(o.udfa).sort((a, b) => b[1] - a[1])) {
    if (!pool.has(id)) continue;
    const rng = rngFor(state.seed, `udfa-race:${id}`);
    const rank = values.filter((v) => v > (hype[id] ?? 0)).length;
    const interest = Math.max(0, 1 - Math.max(0, rank - 200) / 250);
    const rival = 5_000 + interest * (60_000 + rng() * 140_000);
    // Opportunity: fewer bodies at his position here is worth real money to an undrafted player.
    const opportunity = (4 - Math.min(4, depth(draftClass(state.seed).byId[id].position))) * 20_000;
    if (bonus + opportunity >= rival) won.push([id, bonus]);
    else lost.push([id, teams[Math.floor(rng() * teams.length)]]);
  }
  o.udfaLog = { year: RULES.season + 1, won: won.map(([id]) => id), lost };
  o.udfa = {};
  return { won, lost };
}

// ---- Daily ----

/** The pro scouts write up the next opponent two days after each game. */
export function scoutOpsDaily(state: GameState): void {
  const K = RULES.keyDates;
  if (state.date < K.regularSeasonStart || state.date > K.superBowl || weekday(state.date) !== "Tuesday") return;
  const us = state.userTeam;
  const next = SCHEDULE.find((g) => g.date > state.date && (g.home === us || g.away === us) && !state.results[g.id] && g.type !== "PRE");
  if (!next || next.date > addDays(state.date, 9)) return;
  const o = scoutOps(state);
  if (o.advance.some((a) => a.gameId === next.id)) return;
  const opp = (next.home === us ? next.away : next.home)!;
  const notes = advanceReport(state, opp);
  o.advance.unshift({ gameId: next.id, opp, date: state.date, notes });
  if (o.advance.length > 20) o.advance.length = 20;
  send(state, "staff", `${o.pros[0]?.name ?? "Pro scouting"}, pro scout`, `Advance report: ${TEAM_BY_ID[opp].name}`, notes.join("\n"));
}

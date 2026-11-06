// Strategy: the club's analytics department, weekly game plans, halftime
// adjustments and the league's strategy trends.
//
// The analytics department is a budget line. Bigger staffs bring better data
// and sharper research, and the owner points their research at what matters
// most. What the staff finds is only worth something if the coaches use it.
// Credibility grows when advice is taken and works, and the head coach's
// openness decides how often fourth-down advice is followed. Coaches can
// disagree for good reasons, and the record shows both sides.
//
// Every week each coaching staff studies its next opponent: their tendencies
// from this season's plays (or their schemes early on) and where they have
// been weakest. The plan chooses what to attack and what to take away.
// Better coaches, a stronger analytics staff and a full week of preparation
// make better plans. At halftime coordinators adjust to what is working.
//
// Across seasons the league copies what works: if passing beats running by
// more than usual, everyone throws a little more, and defenses answer with
// more two-deep shells.
import { emphasisPlanBonus } from "./gameweek";
import { expectedPoints, fourthDownValues, perPlay, type Adv, addAdv, emptyAdv } from "./analytics";
import { daysBetween } from "./dates";
import { send } from "./inbox";
import { GAME_BY_ID, PLAYER_BY_ID, RULES, SCHEDULE, TEAM_BY_ID } from "./league";
import { rngFor } from "./rng";
import { DEFENSE, OFFENSE } from "./schemes";
import { staffEffects, teamSchemes } from "./staff";
import type { GameState, ScheduledGame } from "./types";

const M = 1_000_000;

export const ANALYTICS_LEVELS = [
  { label: "None", cost: 0, what: "No analysts: the coaches work from film and feel." },
  { label: "Small", cost: 0.9 * M, what: "Two analysts and a data engineer: standard numbers, short reports." },
  { label: "Established", cost: 2.4 * M, what: "A director, analysts, engineers and a tracking-data feed." },
  { label: "Leading", cost: 5 * M, what: "A research group with its own models, tracking and film systems." },
] as const;

/** Where the research goes: each focus sharpens one kind of advice. */
export const PRIORITIES = {
  game: { label: "Game strategy", what: "Fourth downs, game plans and opponent tendencies." },
  players: { label: "Player value", what: "Who is producing, who is fading, and what the numbers say about the roster." },
  cap: { label: "Contracts and cap", what: "Cost per unit of production and where the cap is spent badly." },
  business: { label: "Business", what: "Ticket prices and demand, and what the club's spending returns." },
} as const;
export type Priority = keyof typeof PRIORITIES;

export interface GamePlan {
  gameId: string;
  opp: string;
  /** What the offense goes after and what the defense takes away. */
  attack: "pass" | "run";
  stop: "pass" | "run";
  /** Hidden: how good the plan is, -1 to 1. */
  quality: number;
  notes: string[];
  /** Halftime adjustments that were made. */
  adjust: string[];
  /** Fourth-down calls the analysts weighed in on: [advice, coach's call, followed, expected points given up]. */
  fourth: [string, string, boolean, number][];
}

export interface AnalyticsState {
  level: number;
  priority: Priority;
  /** Hidden, 0-100: how much the football staff trusts the analysts. */
  credibility: number;
  plans: Record<string, GamePlan>;
  log: { date: string; text: string }[];
  /** League-wide shifts in strategy: extra pass rate and two-high rate, by season. */
  trends: { season: number; pass: number; twoHigh: number; passEpa: number; rushEpa: number }[];
  /** Fourth-down advice over the season: advised, followed, points left on the field when ignored. */
  advice: { advised: number; followed: number; lost: number };
}

export function analytics(state: GameState): AnalyticsState {
  return (state.analytics ??= { level: 1, priority: "game", credibility: 50, plans: {}, log: [], trends: [], advice: { advised: 0, followed: 0, lost: 0 } });
}

export function ensureAnalytics(state: GameState): void {
  analytics(state);
}

export function analyticsCost(state: GameState): number {
  return state.analytics ? ANALYTICS_LEVELS[state.analytics.level].cost : ANALYTICS_LEVELS[1].cost;
}

function note(state: GameState, text: string): void {
  const a = analytics(state);
  a.log.unshift({ date: state.date, text });
  if (a.log.length > 60) a.log.length = 60;
}

export function setAnalyticsLevel(state: GameState, level: number): void {
  const a = analytics(state);
  if (level === a.level) return;
  // Cutting the staff costs trust; people leave with what they knew.
  if (level < a.level) a.credibility = Math.max(10, a.credibility - 8 * (a.level - level));
  a.level = level;
  note(state, `Analytics staff set to ${ANALYTICS_LEVELS[level].label.toLowerCase()} (${(ANALYTICS_LEVELS[level].cost / M).toFixed(1)}M a year).`);
}

export function setPriority(state: GameState, p: Priority): void {
  const a = analytics(state);
  if (a.priority === p) return;
  a.priority = p;
  note(state, `Research priority set to ${PRIORITIES[p].label.toLowerCase()}.`);
}

/** How often the head coach takes the analysts' fourth-down advice. */
export function buyIn(state: GameState): number {
  const a = analytics(state);
  if (!a.level) return 0;
  const gm = staffEffects(state.userTeam).gameManagement;
  return Math.max(0.1, Math.min(0.92, 0.2 + a.credibility / 180 + (gm - 70) / 120 + (a.priority === "game" ? 0.08 : 0)));
}

export function credibilityWord(v: number): string {
  return v >= 75 ? "Trusted" : v >= 58 ? "Respected" : v >= 42 ? "Listened to" : v >= 25 ? "Doubted" : "Ignored";
}

export function buyInWord(v: number): string {
  return v >= 0.7 ? "Takes most advice" : v >= 0.5 ? "Takes it about half the time" : v >= 0.3 ? "Skeptical" : v > 0 ? "Goes with gut feel" : "No analysts to ask";
}

// ---- Season numbers from box scores ----

/** Each team's offense and defense numbers this season (regular season and playoffs). */
export function seasonAdv(state: GameState): Record<string, { off: Adv; def: Adv; games: number; opps: string[] }> {
  const out: Record<string, { off: Adv; def: Adv; games: number; opps: string[] }> = {};
  for (const [id, box] of Object.entries(state.box)) {
    const g = GAME_BY_ID[id];
    if (!box.adv || !g || g.type === "PRE") continue;
    const r = state.results[id];
    for (const [side, other] of [["away", "home"], ["home", "away"]] as const) {
      const t = (out[r[side]] ??= { off: emptyAdv(), def: emptyAdv(), games: 0, opps: [] });
      addAdv(t.off, box.adv[side]);
      addAdv(t.def, box.adv[other]);
      t.games++;
      t.opps.push(r[other]);
    }
  }
  return out;
}

/** Offense EPA per play adjusted for the defenses faced, and defense for the offenses faced. */
export function adjustedEpa(state: GameState): Record<string, { off: number; def: number }> {
  const s = seasonAdv(state);
  const raw = Object.fromEntries(Object.entries(s).map(([t, v]) => [t, { off: perPlay(v.off.epa, v.off.n), def: perPlay(v.def.epa, v.def.n) }]));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const league = avg(Object.values(raw).map((v) => v.off));
  const out: Record<string, { off: number; def: number }> = {};
  for (const [t, v] of Object.entries(s)) {
    const oppDef = avg(v.opps.map((o) => raw[o]?.def ?? league)) - league;
    const oppOff = avg(v.opps.map((o) => raw[o]?.off ?? league)) - league;
    out[t] = { off: raw[t].off - oppDef, def: raw[t].def - oppOff };
  }
  return out;
}

// ---- Game plans ----

/** The current league trend, applied to every team's play calling and coverage. */
export function leagueTrend(state: GameState): { pass: number; twoHigh: number } {
  const t = state.analytics?.trends.at(-1);
  return { pass: t?.pass ?? 0, twoHigh: t?.twoHigh ?? 0 };
}

function lastGameBefore(team: string, date: string): string | undefined {
  let last: string | undefined;
  for (const g of SCHEDULE) {
    if (g.date >= date) break;
    if (g.away === team || g.home === team) last = g.date;
  }
  return last;
}

/**
 * The week's plan for `team` against `opp`. Every club makes one; the owner's
 * is kept with its notes. Quality is hidden and shows only in results.
 */
export function gamePlan(state: GameState, team: string, opp: string, g: ScheduledGame): GamePlan {
  const saved = team === state.userTeam ? state.analytics?.plans[g.id] : undefined;
  if (saved) return saved;
  const rng = rngFor(state.seed, `plan:${g.id}:${team}`);
  const fx = staffEffects(team);
  const ours = team === state.userTeam;
  const level = ours ? analytics(state).level : 1.5;
  const focus = ours && analytics(state).priority === "game" ? 1 : 0;
  const prev = lastGameBefore(team, g.date);
  const rest = prev ? daysBetween(prev, g.date) : 7;
  // A short week cuts preparation; extra days help a little.
  const prepDays = rest <= 4 ? -4 : rest >= 10 ? 1.5 : 0;
  const raw = (fx.offCalling + fx.defCalling) / 2 + (level - 1.5) * 2.5 + focus * 1.5 + prepDays + emphasisPlanBonus(state, team) + (rng() + rng() + rng() - 1.5) * 6;
  const quality = Math.max(-1, Math.min(1, (raw - 70) / 15));

  // What the film and the numbers say about them.
  const s = seasonAdv(state)[opp];
  const sch = teamSchemes(opp);
  let runWeak: boolean;
  let passStrong: boolean;
  const notes: string[] = [];
  const name = TEAM_BY_ID[opp]?.name ?? opp;
  if (s && s.def.pn + s.def.rn >= 60) {
    runWeak = perPlay(s.def.re, s.def.rn) > perPlay(s.def.pe, s.def.pn) + 0.05;
    passStrong = perPlay(s.off.pe, s.off.pn) > perPlay(s.off.re, s.off.rn) + 0.05;
    notes.push(`The ${name} defense allows ${perPlay(s.def.pe, s.def.pn).toFixed(2)} EPA a dropback and ${perPlay(s.def.re, s.def.rn).toFixed(2)} a run.`);
    notes.push(`Their offense gains ${perPlay(s.off.pe, s.off.pn).toFixed(2)} EPA a dropback and ${perPlay(s.off.re, s.off.rn).toFixed(2)} a run, with ${s.off.x} plays of 20+ yards in ${s.games} games.`);
  } else {
    const d = DEFENSE[sch.defense];
    runWeak = d.lightBox + d.twoHigh * 0.5 > 0.6;
    passStrong = OFFENSE[sch.offense].passRate >= 0.57;
    notes.push(`Early in the year, the read comes from their schemes: ${d.twoHigh >= 0.45 ? "plenty of two-deep coverage" : "mostly single-high coverage"}, and an offense that ${OFFENSE[sch.offense].passRate >= 0.57 ? "likes to throw" : "leans on the run"}.`);
  }
  // Good staffs read the opponent right more often.
  const read = 0.55 + 0.3 * quality;
  const attack = (rng() < read ? runWeak : !runWeak) ? "run" : "pass";
  const stop = (rng() < read ? passStrong : !passStrong) ? "pass" : "run";
  notes.push(attack === "run" ? "Plan: run at them, and use play action off it." : "Plan: throw early and attack their coverage.");
  notes.push(stop === "pass" ? "On defense: take away the passing game, and live with some runs." : "On defense: stop the run first and make them throw.");
  if (rest <= 4) notes.push("A short week: less time to install.");
  const plan: GamePlan = { gameId: g.id, opp, attack, stop, quality, notes, adjust: [], fourth: [] };
  if (ours && g.type !== "PRE") analytics(state).plans[g.id] = plan;
  return plan;
}

/** The analysts' fourth-down call, and whether the head coach takes it. Only for the owner's club. */
export function fourthDownAdvice(state: GameState, gameId: string, dist: number, ydl: number, fgChance: number, coach: "go" | "punt" | "fg", roll: number): "go" | "punt" | "fg" {
  const a = analytics(state);
  if (!a.level) return coach;
  const v = fourthDownValues(dist, ydl, fgChance);
  // Smaller staffs miss close calls: only clear edges are flagged.
  const margin = [9, 0.6, 0.35, 0.15][a.level];
  const best = (Object.keys(v) as ("go" | "punt" | "fg")[]).reduce((b, k) => (v[k] > v[b] ? k : b), coach);
  if (best === coach || v[best] - v[coach] < margin) return coach;
  const plan = a.plans[gameId];
  const follow = roll < buyIn(state);
  a.advice.advised++;
  const word = { go: "go for it", punt: "punt", fg: "kick the field goal" };
  if (follow) {
    a.advice.followed++;
    a.credibility = Math.min(95, a.credibility + 0.6);
  } else a.advice.lost += v[best] - v[coach];
  plan?.fourth.push([word[best], word[coach], follow, Math.round((v[best] - v[coach]) * 100) / 100]);
  return follow ? best : coach;
}

// ---- Trends ----

/** At season's end the league moves toward what worked, and defenses answer. */
export function updateTrends(state: GameState): void {
  const a = analytics(state);
  const all = emptyAdv();
  for (const v of Object.values(seasonAdv(state))) addAdv(all, v.off);
  if (!all.n) return;
  const passEpa = perPlay(all.pe, all.pn);
  const rushEpa = perPlay(all.re, all.rn);
  const prev = a.trends.at(-1) ?? { pass: 0, twoHigh: 0 };
  // Real passing has beaten rushing by about 0.15 EPA a play for years; a bigger gap pulls teams toward the pass.
  const shift = Math.max(-0.012, Math.min(0.012, (passEpa - rushEpa - 0.15) * 0.08));
  const pass = Math.max(-0.05, Math.min(0.05, prev.pass + shift));
  const twoHigh = Math.max(-0.06, Math.min(0.06, prev.twoHigh + shift * 0.8));
  a.trends.push({ season: RULES.season, pass, twoHigh, passEpa: Math.round(passEpa * 1000) / 1000, rushEpa: Math.round(rushEpa * 1000) / 1000 });
  a.advice = { advised: 0, followed: 0, lost: 0 };
  a.plans = {};
}

// ---- The department's monthly report ----

/** On the first of each month in season, the analytics staff reports on its research priority. */
export function analyticsDaily(state: GameState): void {
  const a = state.analytics;
  if (!a || !state.date.endsWith("-01")) return;
  // Trust drifts toward what the staff's size can support.
  const target = 30 + a.level * 15;
  a.credibility += (target - a.credibility) * 0.08;
  if (!a.level) return;
  const s = seasonAdv(state);
  const us = s[state.userTeam];
  if (!us || us.games < 2) return;
  const adj = adjustedEpa(state);
  const rank = (k: "off" | "def") => Object.entries(adj).sort((x, y) => (k === "off" ? y[1].off - x[1].off : x[1].def - y[1].def)).findIndex(([t]) => t === state.userTeam) + 1;
  const lines: string[] = [`Offense ranks ${rank("off")} and defense ${rank("def")} in EPA a play, adjusted for opponents.`];
  // Small samples: bigger staffs say so with numbers.
  const noise = [0, 0.06, 0.035, 0.02][a.level];
  if (a.priority === "game") {
    lines.push(`Fourth downs: ${a.advice.advised} calls flagged, ${a.advice.followed} followed. Ignored advice cost about ${a.advice.lost.toFixed(1)} expected points.`);
    lines.push(perPlay(us.off.pe, us.off.pn) > perPlay(us.off.re, us.off.rn) + 0.15 ? "Our dropbacks are worth far more than our runs; the staff would throw more on early downs." : "Our run game is holding its own; no change to the run-pass mix suggested.");
  } else if (a.priority === "players" || a.priority === "cap") {
    const lines2 = playerLines(state, state.userTeam);
    const best = lines2.slice(0, 2).map((p) => `${PLAYER_BY_ID[p.id].name} (${(p.epa / p.n).toFixed(2)} a play, give or take ${noise.toFixed(2)})`);
    const worst = lines2.filter((p) => p.n >= 40).slice(-1).map((p) => `${PLAYER_BY_ID[p.id].name} (${(p.epa / p.n).toFixed(2)})`);
    if (best.length) lines.push(`Most productive: ${best.join(", ")}.`);
    if (worst.length) lines.push(`Least: ${worst.join("")}.${a.priority === "cap" ? " Check what he costs against what he gives." : ""}`);
  } else {
    lines.push("Ticket demand: our model says single-game buyers are price-sensitive above the league median; season tickets much less so. Premium seats move with the team's record.");
  }
  send(state, "staff", "Analytics department", "Monthly analytics report", lines.join(" "));
  note(state, lines[0]);
}

/** Players' EPA this season for one team, best first. */
export function playerLines(state: GameState, team: string): { id: string; role: string; n: number; epa: number; s: number }[] {
  const tot: Record<string, { id: string; role: string; n: number; epa: number; s: number }> = {};
  for (const [id, box] of Object.entries(state.box)) {
    const g = GAME_BY_ID[id];
    if (!box.pe || !g || g.type === "PRE") continue;
    const r = state.results[id];
    if (r.away !== team && r.home !== team) continue;
    for (const [key, [n, epa, s]] of Object.entries(box.pe)) {
      const [role, pid] = key.split(":");
      if (!box.players[r.away === team ? "away" : "home"][pid]) continue;
      const t = (tot[key] ??= { id: pid, role, n: 0, epa: 0, s: 0 });
      t.n += n;
      t.epa += epa;
      t.s += s;
    }
  }
  return Object.values(tot).filter((t) => t.n >= 15).sort((a, b) => b.epa - a.epa);
}

/** League leaders in EPA by role: q passers, r rushers, t targets. */
export function leaders(state: GameState, role: "q" | "r" | "t", min: number): { id: string; n: number; epa: number; s: number }[] {
  const tot: Record<string, { id: string; n: number; epa: number; s: number }> = {};
  for (const [id, box] of Object.entries(state.box)) {
    const g = GAME_BY_ID[id];
    if (!box.pe || !g || g.type === "PRE") continue;
    for (const [key, [n, epa, s]] of Object.entries(box.pe)) {
      if (!key.startsWith(`${role}:`)) continue;
      const pid = key.slice(2);
      const t = (tot[pid] ??= { id: pid, n: 0, epa: 0, s: 0 });
      t.n += n;
      t.epa += epa;
      t.s += s;
    }
  }
  return Object.values(tot).filter((t) => t.n >= min).sort((a, b) => b.epa / b.n - a.epa / a.n);
}

/** EP at a spot, re-exported for screens. */
export { expectedPoints };

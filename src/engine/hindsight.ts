// Hindsight: what the press said on draft day and signing day against what
// actually happened. Two and four seasons after each draft, every class is
// re-graded by what its players produced against what their draft slots
// usually return; free-agent signings are re-graded by production against the
// money. Our scouts' calls are kept so their record can be judged over years,
// risk included, not by the one pick everyone remembers. And at the end of
// each season the head coach and coordinators get a grade that accounts for
// the roster they had and the luck in close games.
//
// Production per season is what the honors voters use (production against a
// Pro Bowl season at the position); linemen count starts by snap share.
import { addDays } from "./dates";
import { news, send } from "./inbox";
import { ELITE, production } from "./honors";
import { PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { history } from "./seasons";
import { ability, teamStaff } from "./staff";
import { standings } from "./standings";
import { seasonTotals } from "./stats";
import { depthChart } from "./roster";
import type { GameState, Position } from "./types";

const LINE = new Set<Position>(["OT", "OG", "C", "LS"]);

export interface PickGrade { player: string; team: string; overall: number; value: number; expected: number; grade: string; dayGrade?: string }
export interface ClassGrade { team: string; picks: number; value: number; expected: number; grade: string }
export interface DraftRegrade { year: number; after: 2 | 4; date: string; picks: PickGrade[]; teams: ClassGrade[] }
export interface ScoutCall { player: string; overall: number; projRound: number; risk: string }
export interface SigningGrade { player: string; team: string; year: number; apy: number; value: number; perMillion: number; grade: string }
export interface CoachGrade { season: number; hc: string; oc: string; dc: string; expectedWins: number; pythagWins: number; wins: number; note: string }

export interface HindsightState {
  drafts: DraftRegrade[];
  /** Our scouts' read on each of our picks on draft day: the round they projected and the risk they saw. */
  calls: Record<number, ScoutCall[]>;
  /** The GM's draft-day letter grades by draft year, so a re-grade can show then and now. */
  dayGrades?: Record<number, Record<string, string>>;
  signings: { year: number; after: 2 | 4; grades: SigningGrade[] }[];
  /** Roster talent at the start of each season by team (engine only), for the coaching grade. */
  talent: Record<number, Record<string, { off: number; def: number }>>;
  coaching: CoachGrade[];
}

export function hindsight(state: GameState): HindsightState {
  return (state.hindsight ??= { drafts: [], calls: {}, signings: [], talent: {}, coaching: [] });
}

/** A player's production in one season, against a Pro Bowl season at his position (0 to about 1.6). */
export function seasonValue(state: GameState, id: string, season: number): number {
  const p = PLAYER_BY_ID[id];
  if (!p) return 0;
  // The season just played is still in the box scores until the league rolls over.
  const live = season === RULES.season ? seasonTotals(state, "REG")[id]?.line as Record<string, number> | undefined : undefined;
  if (LINE.has(p.position)) {
    if (season === RULES.season) return live ? Math.min(1, (Number(live.offSnaps ?? 0) + Number(live.defSnaps ?? 0)) / (17 * 62) * 0.8) : 0;
    const s = p.snaps?.[String(season)];
    return s ? Math.min(1, Math.max(s.offShare, s.defShare) * 0.8 + s.stShare * 0.1) : 0;
  }
  if (season === RULES.season) return live ? Math.min(1.6, Math.max(0, production(p.position, live)) / ELITE[p.position]) : 0;
  const rows = (p.stats ?? []).filter((s) => s.season === season);
  let total = 0;
  for (const r of rows) total += Math.max(0, production(p.position, r as unknown as Record<string, number>));
  return Math.min(1.6, total / ELITE[p.position]);
}

/** What a draft slot usually returns per season, on the same scale (about 0.8 at No. 1, 0.5 at No. 32, 0.1 late). */
export function slotExpectation(overall: number): number {
  return 0.75 * Math.exp(-overall / 60) + 0.08;
}

function letter(ratio: number): string {
  return ratio >= 1.6 ? "A+" : ratio >= 1.3 ? "A" : ratio >= 1.1 ? "A-" : ratio >= 0.95 ? "B+" : ratio >= 0.8 ? "B" : ratio >= 0.65 ? "B-" : ratio >= 0.5 ? "C+" : ratio >= 0.38 ? "C" : ratio >= 0.25 ? "D" : "F";
}

/** Re-grades a draft class after `after` seasons, from what its players did in them. */
export function regradeDraft(state: GameState, year: number, after: 2 | 4): DraftRegrade | null {
  const d = history(state).drafts.find((x) => x.year === year);
  if (!d) return null;
  const seasons = Array.from({ length: after }, (_, i) => year + i);
  const kept = hindsight(state).dayGrades?.[year] ?? {};
  const dayGrades = new Map<string, string | undefined>([...Object.entries(kept), ...(state.draft?.made ?? []).map((m) => [m.player, m.grade] as [string, string | undefined])]);
  const picks: PickGrade[] = d.picks.map(([player, team, , overall]) => {
    const value = seasons.reduce((t, s) => t + seasonValue(state, player, s), 0);
    const expected = slotExpectation(overall) * after;
    return { player, team, overall, value: Math.round(value * 100) / 100, expected: Math.round(expected * 100) / 100, grade: letter(value / expected), dayGrade: dayGrades.get(player) };
  });
  const byTeam = new Map<string, PickGrade[]>();
  for (const p of picks) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
  const teams: ClassGrade[] = [...byTeam.entries()].map(([team, ps]) => {
    const value = ps.reduce((t, p) => t + p.value, 0);
    const expected = ps.reduce((t, p) => t + p.expected, 0);
    return { team, picks: ps.length, value: Math.round(value * 100) / 100, expected: Math.round(expected * 100) / 100, grade: letter(value / Math.max(0.01, expected)) };
  }).sort((a, b) => b.value / b.expected - a.value / a.expected);
  return { year, after, date: state.date, picks, teams };
}

/** Free-agent signings from `year`, re-graded by production per million a year after `after` seasons. */
export function regradeSignings(state: GameState, year: number, after: 2 | 4): SigningGrade[] {
  const seasons = Array.from({ length: after }, (_, i) => year + i);
  return state.signings
    .filter((s) => s.kind === "free-agent" && Number(s.date.slice(0, 4)) === year && s.apy >= 3_000_000)
    .map((s) => {
      const value = seasons.reduce((t, y) => t + seasonValue(state, s.player, y), 0);
      // A Pro Bowl-level season is worth about a tenth of the cap; measure what the money bought against that.
      const fair = (s.apy / 1_000_000) / 30;
      const perMillion = value / Math.max(0.1, s.apy / 1_000_000);
      return { player: s.player, team: s.team, year, apy: s.apy, value: Math.round(value * 100) / 100, perMillion: Math.round(perMillion * 1000) / 1000, grade: letter(value / Math.max(0.05, fair * after)) };
    })
    .sort((a, b) => b.perMillion - a.perMillion);
}

/** Our scouts' draft-day calls, kept for the record (called when the draft ends). */
export function noteScoutCalls(state: GameState, calls: ScoutCall[]): void {
  const h = hindsight(state);
  h.calls[RULES.season + 1] = calls;
  (h.dayGrades ??= {})[RULES.season + 1] = Object.fromEntries((state.draft?.made ?? []).filter((m) => m.grade).map((m) => [m.player, m.grade!]));
}

/**
 * The scouting department's record: for each class two or more seasons old,
 * how our picks did against the round the scouts projected them in, and how
 * the picks they called risky turned out against the safe ones.
 */
export function scoutingRecord(state: GameState): { year: number; picks: number; hits: number; busts: number; riskyBust: number; safeBust: number }[] {
  const h = hindsight(state);
  const out: { year: number; picks: number; hits: number; busts: number; riskyBust: number; safeBust: number }[] = [];
  for (const [y, calls] of Object.entries(h.calls)) {
    const year = Number(y);
    const done = RULES.season - year + 1;
    if (done < 2) continue;
    const seasons = Array.from({ length: Math.min(4, done) }, (_, i) => year + i);
    let hits = 0, busts = 0, riskyBust = 0, safeBust = 0, risky = 0, safe = 0;
    for (const c of calls) {
      const value = seasons.reduce((t, s) => t + seasonValue(state, c.player, s), 0) / seasons.length;
      const expected = slotExpectation((c.projRound - 1) * 32 + 16);
      const bust = value < expected * 0.4;
      if (value >= expected) hits++;
      if (bust) busts++;
      if (c.risk === "High" || c.risk === "Medium") { risky++; if (bust) riskyBust++; } else { safe++; if (bust) safeBust++; }
    }
    out.push({ year, picks: calls.length, hits, busts, riskyBust: risky ? Math.round((riskyBust / risky) * 100) : 0, safeBust: safe ? Math.round((safeBust / safe) * 100) : 0 });
  }
  return out.sort((a, b) => b.year - a.year);
}

/** Draft return for a team: what each pick produced per season against what its slot usually gives, all classes in this save. */
export function draftReturn(state: GameState, team = state.userTeam): { year: number; player: string; overall: number; seasons: number; perSeason: number; expected: number }[] {
  const out: { year: number; player: string; overall: number; seasons: number; perSeason: number; expected: number }[] = [];
  for (const d of history(state).drafts) {
    const seasons = Array.from({ length: Math.max(0, RULES.season - d.year + 1) }, (_, i) => d.year + i).filter((s) => s <= RULES.season && (s < RULES.season || state.date > RULES.keyDates.superBowl));
    if (!seasons.length) continue;
    for (const [player, t, , overall] of d.picks) {
      if (t !== team) continue;
      const v = seasons.reduce((s, y) => s + seasonValue(state, player, y), 0) / seasons.length;
      out.push({ year: d.year, player, overall, seasons: seasons.length, perSeason: Math.round(v * 100) / 100, expected: Math.round(slotExpectation(overall) * 100) / 100 });
    }
  }
  return out;
}

// ---- The coaching grade ----

function talentOf(state: GameState, team: string): { off: number; def: number } {
  const c = depthChart(state, team);
  const unit = (pos: [Position, number][]) => {
    const ids = pos.flatMap(([p, n]) => c[p].slice(0, n));
    return ids.length ? ids.reduce((t, id) => t + ability(state, id), 0) / ids.length : 60;
  };
  return {
    off: unit([["QB", 1], ["RB", 1], ["WR", 3], ["TE", 1], ["OT", 2], ["OG", 2], ["C", 1]]),
    def: unit([["EDGE", 2], ["IDL", 2], ["LB", 2], ["CB", 3], ["S", 2]]),
  };
}

/**
 * The season grade for our coaches: wins against what the roster's talent
 * predicted, with luck in close games taken out (points scored and allowed
 * say more than the record), and each coordinator's unit ranked against
 * where its talent ranked.
 */
export function gradeCoaches(state: GameState): CoachGrade | null {
  const h = hindsight(state);
  const talent = h.talent[RULES.season];
  if (!talent) return null;
  const us = state.userTeam;
  const table = standings(state);
  const r = table[us];
  const games = r.w + r.l + r.t;
  if (!games) return null;
  const total = (t: string) => talent[t] ? talent[t].off + talent[t].def : 0;
  const teams = TEAMS.map((t) => t.id).filter((t) => talent[t]);
  const mean = teams.reduce((s, t) => s + total(t), 0) / teams.length;
  const sd = Math.sqrt(teams.reduce((s, t) => s + (total(t) - mean) ** 2, 0) / teams.length) || 1;
  const expectedWins = games * Math.max(0.15, Math.min(0.85, 0.5 + ((total(us) - mean) / sd) * 0.12));
  const pythagWins = games * (r.pf ** 2.37 / (r.pf ** 2.37 + r.pa ** 2.37 || 1));
  const rank = (f: (t: string) => number, desc = true) => [...teams].sort((a, b) => (desc ? f(b) - f(a) : f(a) - f(b))).indexOf(us) + 1;
  const offTalent = rank((t) => talent[t].off);
  const defTalent = rank((t) => talent[t].def);
  const offPts = rank((t) => table[t].pf);
  const defPts = rank((t) => table[t].pa, false);
  const hcRatio = (pythagWins + 1) / (expectedWins + 1);
  const unit = (talentRank: number, resultRank: number) => letter(Math.max(0.1, 1 + (talentRank - resultRank) / 16));
  const luck = r.w - pythagWins;
  const note = `Expected about ${expectedWins.toFixed(1)} wins from the roster; the points say ${pythagWins.toFixed(1)}; we won ${r.w}. ` +
    `The offense ranked ${offPts} in scoring with the ${offTalent}${ordinal(offTalent)} most talented group; the defense ranked ${defPts} in points allowed with the ${defTalent}${ordinal(defTalent)}.` +
    (Math.abs(luck) >= 1.5 ? ` ${luck > 0 ? "Close games broke our way" : "Close games went against us"}: about ${Math.abs(luck).toFixed(1)} wins of luck.` : "");
  return { season: RULES.season, hc: letter(hcRatio), oc: unit(offTalent, offPts), dc: unit(defTalent, defPts), expectedWins: Math.round(expectedWins * 10) / 10, pythagWins: Math.round(pythagWins * 10) / 10, wins: r.w, note };
}

function ordinal(n: number): string {
  return n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
}

// ---- Daily ----

export function hindsightDaily(state: GameState): void {
  const K = RULES.keyDates;
  const h = hindsight(state);
  // The roster each team takes into the season, for the coaching grade.
  if (state.date === K.regularSeasonStart && !h.talent[RULES.season]) {
    h.talent[RULES.season] = Object.fromEntries(TEAMS.map((t) => [t.id, talentOf(state, t.id)]));
  }
  if (state.date === addDays(K.superBowl, 2)) {
    const g = gradeCoaches(state);
    if (g && !h.coaching.some((x) => x.season === g.season)) {
      h.coaching.unshift(g);
      const staff = teamStaff(state.userTeam);
      send(state, "staff", "Owner's office", `${RULES.season} coaching grades`,
        `Head coach ${staff.HC?.name ?? ""}: ${g.hc}. Offensive coordinator ${staff.OC?.name ?? ""}: ${g.oc}. Defensive coordinator ${staff.DC?.name ?? ""}: ${g.dc}.\n\n${g.note}`);
    }
    // Drafts two and four seasons back are re-graded now that the season is in.
    for (const after of [2, 4] as const) {
      const year = RULES.season - after + 1;
      if (h.drafts.some((x) => x.year === year && x.after === after)) continue;
      const r = regradeDraft(state, year, after);
      if (!r) continue;
      h.drafts.unshift(r);
      const best = r.teams[0];
      const ours = r.teams.find((t) => t.team === state.userTeam);
      news(state, `${after} years later: the ${year} draft re-graded. Best class: the ${teamLabel(best.team)} (${best.grade}).`);
      if (ours) send(state, "media", "The Gridiron Ledger", `The ${year} draft, ${after} years later`,
        `Our ${year} class grades out ${ours.grade} now (${ours.picks} picks). On draft day the picks were graded ${r.picks.filter((p) => p.team === state.userTeam).map((p) => `${PLAYER_BY_ID[p.player]?.name ?? p.player} ${p.dayGrade ?? "?"} then, ${p.grade} now`).join("; ")}.`);
      const sg = regradeSignings(state, year, after);
      h.signings.unshift({ year, after, grades: sg });
    }
    if (h.drafts.length > 24) h.drafts.length = 24;
    if (h.signings.length > 24) h.signings.length = 24;
  }
}

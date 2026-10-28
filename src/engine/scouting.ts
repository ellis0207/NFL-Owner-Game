// College scouting: each week the owner points the scouts at a slice of the
// draft class (a region, a conference, a school, positions, a college system,
// or specific players) and at a depth (film, campus visits, or a deep dive).
// The broader the assignment, the less we learn about each player; travel
// costs depend on how far each campus is from our building.
//
// What a report reveals grows with how well we know a player, and it is only
// as accurate as our college scouting director's eye. Nothing here shows a
// rating: grades come out as a round range and words.
import { COLLEGE_TEAM, distanceTo, schoolName } from "./collegeData";
import { addDays, weekday } from "./dates";
import { send, money } from "./inbox";
import { TEAM_BY_ID } from "./league";
import { CLASS_SIZE, draftClass, type Prospect } from "./prospects";
import { TRAIT_WORDS } from "./reports";
import { gaussian, rngFor } from "./rng";
import { DEFENSE, DEFENSE_LABEL, OFFENSE, OFFENSE_LABEL } from "./schemes";
import { staffEffects, teamSchemes, teamStaff } from "./staff";
import type { GameState, ScoutAssignment, ScoutDepth, ScoutFilter, ScoutingState } from "./types";

export const SCOUTING_BUDGET = 2_400_000;
export const MAX_ASSIGNMENTS = 6;
/** Scouting runs from camp to the draft. */
export const SCOUTING_ENDS = "2027-04-28";

export const DEPTHS: Record<ScoutDepth, { label: string; detail: string; base: number; perPlayer: number; travel: number; points: number; ceiling: number }> = {
  film: { label: "Film study", detail: "Tape from the office. Cheap, no travel, but film only tells you so much.", base: 1500, perPlayer: 200, travel: 0, points: 45, ceiling: 40 },
  campus: { label: "Campus visits", detail: "An area scout watches practice and the game and talks to the staff.", base: 3000, perPlayer: 400, travel: 1, points: 110, ceiling: 75 },
  deep: { label: "Deep dive", detail: "The director and an area scout: interviews, trainers, background checks.", base: 7500, perPlayer: 2500, travel: 2, points: 165, ceiling: 100 },
};

export function newScouting(): ScoutingState {
  return { budget: SCOUTING_BUDGET, spent: 0, plan: [], know: {}, weeks: [], cpu: {} };
}

function sc(state: GameState): ScoutingState {
  return state.college!.scouting;
}

// ---- Who an assignment covers ----

export function matchProspects(state: GameState, f: ScoutFilter): Prospect[] {
  const dc = draftClass(state.seed);
  if (f.players?.length) return f.players.map((id) => dc.byId[id]).filter(Boolean);
  return dc.prospects.filter((p) => {
    const t = COLLEGE_TEAM[p.school];
    if (f.region && t.region !== f.region) return false;
    if (f.conference && t.conference !== f.conference) return false;
    if (f.school && p.school !== f.school) return false;
    if (f.positions?.length && !f.positions.includes(p.position)) return false;
    if (f.scheme && t.offense !== f.scheme && t.defense !== f.scheme) return false;
    return true;
  });
}

export function filterLabel(f: ScoutFilter, state?: GameState): string {
  if (f.players?.length) {
    if (state && f.players.length <= 3) {
      const dc = draftClass(state.seed);
      return f.players.map((id) => dc.byId[id]?.name).filter(Boolean).join(", ");
    }
    return `${f.players.length} specific players`;
  }
  const parts: string[] = [];
  if (f.positions?.length) parts.push(f.positions.join("/") + "s");
  else parts.push("All prospects");
  if (f.school) parts.push(`at ${schoolName(f.school)}`);
  if (f.conference) parts.push(`in the ${f.conference === "IND" ? "independents" : conferenceLabel(f.conference)}`);
  if (f.region) parts.push(`in the ${f.region}`);
  if (f.scheme) parts.push(`from ${schemeName(f.scheme)} programs`);
  return parts.join(" ");
}

function conferenceLabel(c: string): string {
  return { SEC: "SEC", B1G: "Big Ten", B12: "Big 12", ACC: "ACC", P12: "Pac-12", AAC: "American", MW: "Mountain West", SBC: "Sun Belt", CUSA: "Conference USA", MAC: "MAC", IND: "independents" }[c] ?? c;
}

function schemeName(s: string): string {
  return ({ airRaid: "Air Raid", spreadRpo: "spread RPO", proStyle: "pro-style", spreadOption: "spread option", flexbone: "flexbone", "43": "4-3", "34": "3-4", "425": "4-2-5", "335": "3-3-5", multiple: "multiple-front" } as Record<string, string>)[s] ?? s;
}

// ---- Cost ----

/** Travel and lodging for one scout to one campus and back. */
export function tripCost(team: string, school: string): number {
  const mi = distanceTo(team, school);
  return Math.round((mi < 120 ? 250 : 550 + 0.55 * mi) + 400);
}

export interface AssignmentQuote {
  players: number;
  schools: number;
  travel: number;
  cost: number;
  /** About how much of a full file each player gets this week (0-100). */
  perPlayer: number;
  ceiling: number;
}

function efficiency(team: string): number {
  return 0.7 + 0.6 * (staffEffects(team).collegeScouting / 100);
}

function gainFor(depth: ScoutDepth, n: number, team: string): number {
  return n ? (DEPTHS[depth].points * efficiency(team)) / Math.pow(n, 0.8) : 0;
}

export function quote(state: GameState, a: Pick<ScoutAssignment, "filter" | "depth">, team = state.userTeam): AssignmentQuote {
  const ps = matchProspects(state, a.filter);
  const schools = [...new Set(ps.map((p) => p.school))];
  const d = DEPTHS[a.depth];
  const travel = d.travel ? schools.reduce((s, sch) => s + tripCost(team, sch), 0) * d.travel : 0;
  const cost = ps.length ? d.base + d.perPlayer * ps.length + travel : 0;
  return { players: ps.length, schools: schools.length, travel, cost, perPlayer: Math.min(d.ceiling, gainFor(a.depth, ps.length, team)), ceiling: d.ceiling };
}

export function weeklyCost(state: GameState): number {
  return sc(state).plan.reduce((s, a) => s + quote(state, a).cost, 0);
}

export function budgetLeft(state: GameState): number {
  const s = sc(state);
  return s.budget - s.spent;
}

/** Sundays left until the draft, to spread the budget over. */
export function weeksLeft(state: GameState): number {
  let n = 0;
  for (let d = state.date; d <= SCOUTING_ENDS; d = addDays(d, 1)) if (weekday(d) === "Sunday") n++;
  return n;
}

// ---- Editing the plan ----

let nextId = 0;

export function addAssignment(state: GameState, filter: ScoutFilter, depth: ScoutDepth): string | null {
  const plan = sc(state).plan;
  if (plan.length >= MAX_ASSIGNMENTS) return `We only have enough scouts for ${MAX_ASSIGNMENTS} assignments a week.`;
  if (!matchProspects(state, filter).length) return "No prospects match that assignment.";
  plan.push({ id: `a${Date.now().toString(36)}${(nextId++).toString(36)}`, filter, depth });
  return null;
}

export function removeAssignment(state: GameState, id: string): void {
  const s = sc(state);
  s.plan = s.plan.filter((a) => a.id !== id);
}

export function setDepth(state: GameState, id: string, depth: ScoutDepth): void {
  const a = sc(state).plan.find((x) => x.id === id);
  if (a) a.depth = depth;
}

/** Adds a player to our list of specific players to scout (one list per depth). */
export function scoutPlayer(state: GameState, id: string, depth: ScoutDepth = "deep"): string | null {
  const plan = sc(state).plan;
  const list = plan.find((a) => a.filter.players && a.depth === depth);
  if (list) {
    if (!list.filter.players!.includes(id)) list.filter.players!.push(id);
    return null;
  }
  return addAssignment(state, { players: [id] }, depth);
}

export function unscoutPlayer(state: GameState, id: string): void {
  const s = sc(state);
  for (const a of s.plan) if (a.filter.players) a.filter.players = a.filter.players.filter((x) => x !== id);
  s.plan = s.plan.filter((a) => !a.filter.players || a.filter.players.length);
}

export function onScoutList(state: GameState, id: string): ScoutDepth | null {
  return sc(state).plan.find((a) => a.filter.players?.includes(id))?.depth ?? null;
}

// ---- The weekly cycle ----

/** Sunday: the scouts' week is done. Charges the budget, files the reports, and other teams scout too. */
export function scoutingDaily(state: GameState): void {
  if (!state.college || weekday(state.date) !== "Sunday" || state.date > SCOUTING_ENDS) return;
  const s = sc(state);
  const us = state.userTeam;
  const dc = draftClass(state.seed);
  const before: Record<string, number> = {};
  const lines: string[] = [];
  let cost = 0;
  for (const a of s.plan) {
    const q = quote(state, a);
    if (!q.players) continue;
    if (s.spent + q.cost > s.budget) {
      lines.push(`${DEPTHS[a.depth].label}: ${filterLabel(a.filter, state)}. Skipped, not enough budget left (${money(q.cost)}).`);
      continue;
    }
    s.spent += q.cost;
    cost += q.cost;
    const gain = gainFor(a.depth, q.players, us);
    for (const p of matchProspects(state, a.filter)) {
      const k = s.know[p.id] ?? 0;
      if (!(p.id in before)) before[p.id] = k;
      const ceiling = DEPTHS[a.depth].ceiling;
      if (k >= ceiling) continue;
      s.know[p.id] = Math.min(ceiling, Math.round((k + gain * (1 - k / (ceiling + 15))) * 10) / 10);
    }
    lines.push(`${DEPTHS[a.depth].label}: ${filterLabel(a.filter, state)} (${q.players} player${q.players === 1 ? "" : "s"}${q.schools > 1 ? ` at ${q.schools} schools` : ""}), ${money(q.cost)}.`);
  }
  const learned = Object.keys(before)
    .map((id) => [id, (s.know[id] ?? 0) - before[id]] as const)
    .filter(([, g]) => g > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);
  if (lines.length) {
    s.weeks.unshift({ date: state.date, cost, lines, learned });
    if (s.weeks.length > 60) s.weeks.length = 60;
    const director = teamStaff(us).COL?.name ?? "Director of college scouting";
    const body = lines.join("\n") +
      (learned.length ? `\n\nWhere we learned the most:\n${learned.map((id) => {
        const p = dc.byId[id];
        const r = scoutReport(state, id);
        return `${p.position} ${p.name}, ${schoolName(p.school)}${r.grade ? `: ${r.grade}` : ""}`;
      }).join("\n")}` : "") +
      `\n\nSpent ${money(cost)} this week; ${money(budgetLeft(state))} of the ${money(s.budget)} budget is left.`;
    send(state, "staff", `${director}, director of college scouting`, "Weekly scouting report", body);
  }
  cpuScouting(state);
}

function cpuScouting(state: GameState): void {
  const s = sc(state);
  const dc = draftClass(state.seed);
  const hype = state.college!.hype;
  const order = Object.keys(hype).sort((a, b) => hype[b] - hype[a]);
  const rank: Record<string, number> = {};
  order.forEach((id, i) => { rank[id] = i; });
  for (const team of Object.keys(TEAM_BY_ID)) {
    if (team === state.userTeam) continue;
    const arr = (s.cpu[team] ??= new Array(CLASS_SIZE).fill(0));
    const eff = efficiency(team);
    dc.prospects.forEach((p, i) => {
      const w = 1 / (1 + rank[p.id] / 60) + (distanceTo(team, p.school) < 500 ? 0.25 : 0);
      const k = arr[i];
      arr[i] = Math.min(88, Math.round(k + 7 * eff * w * (1 - k / 95)));
    });
  }
}

/** How well a team knows a prospect, 0-100. */
export function knowledge(state: GameState, id: string, team = state.userTeam): number {
  const s = state.college?.scouting;
  if (!s) return 0;
  if (team === state.userTeam) return s.know[id] ?? 0;
  const i = draftClass(state.seed).index[id];
  return s.cpu[team]?.[i] ?? 0;
}

export function knowledgeLabel(k: number): string {
  if (k <= 0) return "Not scouted";
  if (k < 15) return "Barely seen";
  if (k < 35) return "First looks";
  if (k < 60) return "Solid picture";
  if (k < 85) return "Well scouted";
  return "Complete file";
}

// ---- Reports ----

export interface ProspectReport {
  knowledge: number;
  level: string;
  author: string;
  grade?: string;
  /** Round the scouts see him in, best guess (1-7, 8 = undrafted), for sorting. */
  round?: number;
  role?: string;
  strengths: string[];
  concerns: string[];
  athletic?: string;
  size?: string;
  fit?: string;
  makeup: string[];
  upside?: string;
  medical?: string;
  /** What the next level of scouting would add. */
  next?: string;
}

function noise(state: GameState, team: string, id: string, what: string): number {
  return gaussian(rngFor(state.seed, `scout:${team}:${id}:${what}`));
}

/** The scouting director's eye: error in rating points at a given knowledge. */
function errorSd(team: string, k: number): number {
  const eye = staffEffects(team).collegeScouting;
  return (3.2 + (100 - eye) / 14) * Math.max(0.12, 1 - k / 115) + 0.4;
}

/** The value a team's scouts put on a prospect (engine only: other teams use this on draft day). */
export function perceivedValue(state: GameState, id: string, team = state.userTeam): number {
  const h = draftClass(state.seed).hidden[id];
  const k = knowledge(state, id, team);
  return h.value + noise(state, team, id, "value") * errorSd(team, k) * 1.4;
}

function roundOf(cuts: number[], v: number): number {
  const i = cuts.findIndex((c) => v >= c);
  return i < 0 ? 8 : i + 1;
}

function roundRange(state: GameState, pv: number, sd: number): string {
  const dc = draftClass(state.seed);
  const cuts = dc.roundCuts;
  const values = dc.prospects.map((p) => dc.hidden[p.id].value).sort((a, b) => b - a);
  const hi = roundOf(cuts, pv + sd);
  const lo = roundOf(cuts, pv - sd);
  if (lo === 1 && pv - sd >= values[9]) return "Top-10 pick";
  if (lo === 1 && pv - sd >= values[19]) return "First round, top half";
  if (hi === lo) return hi >= 8 ? "Undrafted free agent" : `Round ${hi}`;
  if (lo >= 8) return `Round ${hi} to undrafted`;
  return `Rounds ${hi}-${lo}`;
}

function fitRead(state: GameState, id: string, team: string): number {
  const dc = draftClass(state.seed);
  const p = dc.byId[id];
  const h = dc.hidden[id];
  const schemes = teamSchemes(team);
  const off = ["QB", "RB", "FB", "WR", "TE", "OT", "OG", "C"].includes(p.position);
  const wants = (off ? OFFENSE[schemes.offense].wants : DEFENSE[schemes.defense].wants)[p.position];
  if (!wants) return 0;
  let total = 0;
  let w = 0;
  for (const [t, x] of Object.entries(wants)) {
    total += x * (h.traits[t] ?? h.overall);
    w += x;
  }
  return w ? total / w - h.overall : 0;
}

export function scoutReport(state: GameState, id: string, team = state.userTeam): ProspectReport {
  const dc = draftClass(state.seed);
  const p = dc.byId[id];
  const h = dc.hidden[id];
  const k = knowledge(state, id, team);
  const sd = errorSd(team, k);
  const n = (what: string) => noise(state, team, id, what);
  const author = teamStaff(team).COL?.name ?? "College scouting";
  const report: ProspectReport = { knowledge: k, level: knowledgeLabel(k), author, strengths: [], concerns: [], makeup: [] };
  if (k < 10) {
    report.next = "Not enough work on him yet for a grade. Any scouting assignment that covers him will start a file.";
    return report;
  }
  const pv = h.value + n("value") * sd * 1.4;
  report.grade = roundRange(state, pv, sd * 1.1);
  report.round = roundOf(dc.roundCuts, pv);

  // Trait reads, each relative to the player's overall with the scout's error.
  const reads = Object.entries(h.traits).map(([t, v]) => [t, v - h.overall + n(`trait:${t}`) * sd * 1.3] as const).sort((a, b) => b[1] - a[1]);
  const count = k >= 60 ? 3 : k >= 30 ? 2 : 1;
  report.strengths = reads.filter(([, v]) => v >= 3).slice(0, count).map(([t]) => TRAIT_WORDS[t]?.[0]).filter(Boolean) as string[];
  report.concerns = reads.filter(([, v]) => v <= -4).slice(-count).reverse().map(([t]) => TRAIT_WORDS[t]?.[1]).filter(Boolean) as string[];

  if (k >= 30) {
    const forty = h.forty + n("forty") * 0.09 * Math.max(0.15, 1 - k / 100);
    report.athletic = ["K", "P", "LS"].includes(p.position) ? undefined : `Our scouts have him running in the ${(Math.round(forty * 20) / 20).toFixed(2)} range in the 40.`;
    const ht = h.heightIn;
    const diff = p.heightIn - ht;
    report.size = `Measures about ${Math.floor(ht / 12)}'${ht % 12}", ${Math.round(h.weightLb / 5) * 5} lb${diff > 0 ? `; the school lists him ${diff === 1 ? "an inch" : `${diff} inches`} taller` : ""}.`;
  }
  if (k >= 50) {
    const ov = h.overall + n("overall") * sd;
    report.role = ov >= 80 ? "Day-one starter" : ov >= 74 ? "Should start early in his career" : ov >= 67 ? "Rotation player who can grow into a starter" : ov >= 60 ? "Developmental backup" : "Camp competition; a long shot to stick";
    const fit = fitRead(state, id, team) + n("fit") * sd * 0.6;
    const schemes = teamSchemes(team);
    const off = ["QB", "RB", "FB", "WR", "TE", "OT", "OG", "C"].includes(p.position);
    const name = (off ? OFFENSE_LABEL[schemes.offense] : DEFENSE_LABEL[schemes.defense]).toLowerCase();
    if (!["K", "P", "LS"].includes(p.position)) {
      report.fit = fit >= 2.5 ? `A natural fit for our ${name} scheme.` : fit <= -2.5 ? `Would have to adjust to our ${name} scheme.` : `Fits our ${name} scheme fine.`;
    }
    const iq = h.footballIq + n("iq") * sd * 2;
    if (iq >= 82) report.makeup.push("Football smart; coaches say he picks things up fast.");
    else if (iq < 55) report.makeup.push("Has been slow to pick up the playbook.");
  }
  if (k >= 70) {
    const ch = h.character + n("character") * sd * 2.5;
    const we = h.workEthic + n("work") * sd * 2.5;
    report.makeup.push(ch >= 86 ? "Team captain type; coaches and teammates rave about him." : ch >= 68 ? "No concerns off the field." : ch >= 52 ? "A few maturity questions we need to run down." : "Off-field red flags: more than one incident at school.");
    if (we >= 86) report.makeup.push("First one in, last one out.");
    else if (we < 56) report.makeup.push("Questions about his work habits and conditioning.");
    const up = h.potential - h.overall + n("upside") * sd * 0.8;
    report.upside = up >= 8 ? "Raw, with a lot of room to grow." : up >= 5 ? "Should keep getting better." : up >= 2.5 ? "Close to a finished product." : "What you see is what you get.";
  }
  if (k >= 85) {
    report.medical = h.medical ?? (h.durability + n("durability") * sd * 2 < 62 ? "Nagging injuries: has missed time every year." : "Clean medical history so far.");
  }
  report.next = k < 30 ? "Campus visits would get us his size, speed and more on his game."
    : k < 50 ? "More work would tell us how he fits what we do and what role he projects to."
      : k < 70 ? "A deep dive would get us his makeup: character, work habits, upside."
        : k < 85 ? "Another deep dive would get us his medical history."
          : undefined;
  return report;
}

/** Short grade for lists. */
export function gradeLabel(state: GameState, id: string): string {
  const k = knowledge(state, id);
  if (k < 10) return "—";
  return scoutReport(state, id).grade ?? "—";
}


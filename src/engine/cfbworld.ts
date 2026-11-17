// The college world that carries from one season to the next. Each FBS
// program has a brand (prestige), a roster's worth of talent and this
// season's strength, all engine only. The roster's talent turns over a
// quarter at a time as recruiting classes arrive; this season's team comes
// from that talent, last year's team, the brand and the head coach's game
// days; the brand moves slowly with winning. Programs climb when a good coach
// lands good classes, and slide when the classes or the coach don't hold up.
// Every season the whole field is put back on the 2026 scale (same average
// and spread), so the sport never inflates; only the order changes.
//
// What the owner sees is what anyone could: records, final ranks, titles,
// recruiting class ranks and the coaching changes.
import { AP_PRESEASON, COLLEGE_STATS, collegePlayer, collegeRecords, conferenceChampions, latestPoll, nextClass, prospectTotals } from "./college";
import { COLLEGE_TEAMS } from "./collegeData";
import { bindWorld } from "./prospects";
import { catchUpRecruiting, recruitingDaily } from "./recruiting";
import { cfbCoachesDaily, developer, ensureCollegeCoaches, gameDay, headCoach } from "./cfbcoaches";
import { portalDaily, portalRollover } from "./portal";
import { cfbFact, schoolSlots } from "./cfbmedia";
import { RULES } from "./league";
import { gaussian, rngFor } from "./rng";
import type { CfbProgram, CfbWorld, GameState, Position } from "./types";

/** The 2026 field's average and spread (teams.json). */
const MEAN = COLLEGE_TEAMS.reduce((s, t) => s + t.strength, 0) / COLLEGE_TEAMS.length;
const SD = Math.sqrt(COLLEGE_TEAMS.reduce((s, t) => s + (t.strength - MEAN) ** 2, 0) / COLLEGE_TEAMS.length);

function newProgram(strength: number): CfbProgram {
  return { prestige: strength, strength, talent: strength, seasons: [], coaches: {}, classRank: {}, classTalent: {} };
}

/** Gives a save its college world: programs as they stand in 2026, a coach for every program, and this year's recruiting so far. */
export function ensureCfb(state: GameState): void {
  if (!state.cfb) {
    state.cfb = {
      programs: Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, newProgram(t.strength)])),
      classes: {}, signed: {}, openings: {}, log: [], rev: 0,
    };
    ensureCollegeCoaches(state);
    catchUpRecruiting(state);
  }
  for (const t of COLLEGE_TEAMS) state.cfb.programs[t.id] ??= newProgram(t.strength);
  ensureCollegeCoaches(state);
  bindCfb(state);
}

/** Points the draft classes at this save's recruiting. */
export function bindCfb(state: GameState): void {
  const w = state.cfb;
  if (!w) {
    bindWorld(state.seed, null);
    return;
  }
  const any = COLLEGE_TEAMS.some((t) => w.programs[t.id].seasons.length);
  bindWorld(state.seed, {
    ref: w, rev: w.rev,
    // Transfers win over where a player first signed.
    get signed() { return Object.assign({}, ...Object.values(w.signed), ...Object.values(w.transfers ?? {})); },
    dev: any ? (school, from, to) => development(w, school, from, to) : undefined,
  });
}

/** Engine only: overall points a school's coaching added from season `from` through `to` (each season about a third of a point per spread of teaching). */
export function development(w: CfbWorld, school: string, from: number, to: number): number {
  const p = w.programs[school];
  if (!p) return 0;
  let d = 0;
  for (const r of p.seasons) if (r[0] >= from && r[0] <= to && r[6] !== undefined) d += (r[6] / 10) * 0.07;
  return d;
}

/** Engine only: a program's strength this season. */
export function programStrength(state: GameState, team: string): number {
  return state.cfb?.programs[team]?.strength ?? COLLEGE_TEAMS.find((t) => t.id === team)?.strength ?? 50;
}

export function cfbDaily(state: GameState): void {
  if (!state.cfb) return;
  bindCfb(state);
  cfbCoachesDaily(state);
  recruitingDaily(state);
  portalDaily(state);
  if (state.date === AP_PRESEASON) programStories(state);
  bindCfb(state);
}

/** The preseason poll's newcomers and dropouts: a few programs on the way up and a few on the way down. */
function programStories(state: GameState): void {
  const w = state.cfb!;
  const ap = state.college?.ap[0];
  if (!ap) return;
  const rise: [string, number][] = [];
  const fall: [string, number][] = [];
  for (const t of COLLEGE_TEAMS) {
    const last = w.programs[t.id].seasons.at(-1);
    if (!last) continue;
    const now = ap.ranks.indexOf(t.id) + 1;
    // Ranked now after an unranked year, or out of the poll after a top-15 finish.
    if (now && now <= 20 && !last[3]) rise.push([t.id, 21 - now]);
    else if (!now && last[3] && last[3] <= 15) fall.push([t.id, 16 - last[3]]);
  }
  const pick = (xs: [string, number][], tag: "rise" | "fall") => {
    for (const [id, x] of xs.sort((a, b) => b[1] - a[1]).slice(0, 3)) {
      const last = w.programs[id].seasons.at(-1)!;
      cfbFact(state, "program", 35 + x * 1.5, { S: schoolSlots(state, id), last: `${last[1]}-${last[2]}`, rank: ap.ranks.indexOf(id) + 1 }, { [tag]: true });
    }
  };
  pick(rise, "rise");
  pick(fall, "fall");
}

// ---- The rollover ----

/** Before the league moves on: the season that just ended goes into each program's history. */
export function closeCfbSeason(state: GameState): void {
  const w = state.cfb;
  const c = state.college;
  if (!w || !c) return;
  const recs = collegeRecords(state);
  const ap = latestPoll(state, "ap");
  const champs = new Set(Object.values(conferenceChampions(state)));
  const round: Record<string, number> = {};
  for (const t of c.cfpField ?? []) round[t] = 1;
  for (const g of c.post) {
    const lvl = g.kind === "cfpQF" ? 2 : g.kind === "cfpSF" ? 3 : g.kind === "cfpF" ? 4 : 0;
    if (lvl) for (const t of [g.away, g.home]) round[t] = Math.max(round[t] ?? 0, lvl);
  }
  if (c.champion) round[c.champion] = 5;
  // How each staff taught this year, against the field.
  const teach = Object.fromEntries(COLLEGE_TEAMS.map((t) => [t.id, developer(headCoach(state, t.id))]));
  const avg = Object.values(teach).reduce((a, b) => a + b, 0) / COLLEGE_TEAMS.length;
  for (const t of COLLEGE_TEAMS) {
    const p = w.programs[t.id];
    if (p.seasons.some((r) => r[0] === c.season)) continue;
    const r = recs[t.id];
    const rank = ap ? ap.ranks.indexOf(t.id) + 1 : 0;
    p.seasons.push([c.season, r.w, r.l, rank, champs.has(t.id) ? 1 : 0, round[t.id] ?? 0, Math.round((teach[t.id] - avg) * 10)]);
    if (p.seasons.length > 40) p.seasons.shift();
    const hc = headCoach(state, t.id);
    if (hc) p.coaches[c.season] = hc.id;
    for (const y of Object.keys(p.coaches)) if (Number(y) < c.season - 40) delete p.coaches[Number(y)];
  }
  archiveCareers(state);
  w.rev++;
}

/**
 * The season's stat lines go into each player's college career: next year's class and the
 * underclassmen who went back, plus this year's prospects who were drafted (their pro pages show it).
 */
function archiveCareers(state: GameState): void {
  const w = state.cfb!;
  const c = state.college!;
  const careers = (w.careers ??= {});
  const next = nextClass(state);
  const back = new Set(state.draft?.returned ?? []);
  for (const id of Object.keys(c.logs)) {
    const p = collegePlayer(state, id);
    if (!p) continue;
    if (!next.byId[id] && !back.has(id) && !state.players[id]) continue;
    const t = prospectTotals(state, id);
    if (!t.g) continue;
    const rows = (careers[id] ??= []);
    if (rows.some((r) => r[0] === c.season)) continue;
    rows.push([c.season, p.school, p.position, t.g, ...COLLEGE_STATS[p.position].map((k) => t[k] ?? 0)]);
  }
  // Careers of players long gone from college.
  for (const [id, rows] of Object.entries(careers)) if (Number(rows[rows.length - 1][0]) < c.season - 6) delete careers[id];
}

/** A player's finished college seasons, oldest first. */
export function collegeCareer(state: GameState, id: string): { season: number; school: string; position: Position; line: Record<string, number> & { g: number } }[] {
  return (state.cfb?.careers?.[id] ?? []).map((r) => {
    const position = r[2] as Position;
    const line: Record<string, number> & { g: number } = { g: Number(r[3]) };
    COLLEGE_STATS[position]?.forEach((k, i) => { line[k] = Number(r[4 + i]); });
    return { season: Number(r[0]), school: String(r[1]), position, line };
  });
}

function rescale(xs: Record<string, number>): Record<string, number> {
  const v = Object.values(xs);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
  return Object.fromEntries(Object.entries(xs).map(([k, x]) => [k, Math.round((MEAN + ((x - m) / sd) * SD) * 10) / 10]));
}

/** What a finished season says about a program, on the strength scale. */
function resultScore(row: number[] | undefined): number | null {
  if (!row) return null;
  const g = row[1] + row[2];
  if (!g) return null;
  return MEAN + (row[1] / g - 0.5) * 42 + (row[3] ? (26 - row[3]) * 0.45 : 0) + row[4] * 2 + row[5] * 1.5;
}

/** At the rollover, after the league has moved to the new season: this season's teams. */
export function cfbRollover(state: GameState): void {
  const w = state.cfb;
  if (!w) return;
  const season = RULES.season;
  const raw: Record<string, number> = {};
  const prestige: Record<string, number> = {};
  for (const t of COLLEGE_TEAMS) {
    const p = w.programs[t.id];
    const cls = p.classTalent[season];
    if (cls !== undefined) p.talent = Math.round((0.75 * p.talent + 0.25 * cls) * 10) / 10;
    const rng = rngFor(state.seed, `cfb-roll:${season}:${t.id}`);
    raw[t.id] = 0.55 * p.talent + 0.2 * p.strength + 0.25 * p.prestige + (gameDay(headCoach(state, t.id)) - 66) * 0.5 + gaussian(rng) * 4;
    const r = resultScore(p.seasons[p.seasons.length - 1]);
    prestige[t.id] = r === null ? p.prestige : 0.85 * p.prestige + 0.15 * r;
  }
  const s = rescale(raw);
  const pr = rescale(prestige);
  for (const t of COLLEGE_TEAMS) {
    w.programs[t.id].strength = s[t.id];
    w.programs[t.id].prestige = pr[t.id];
  }
  // Classes old enough to be drafted are done with college.
  for (const y of Object.keys(w.signed)) if (Number(y) < season - 6) delete w.signed[Number(y)];
  portalRollover(state);
  w.rev++;
  bindCfb(state);
}

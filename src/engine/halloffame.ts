// The Pro Football Hall of Fame: every real class since 1963 (data/hof, built
// by pipeline/hall_of_fame.py), the real candidates still waiting, and the
// yearly vote that elects each new class in this save.
//
// The vote is cast by a panel of living Hall of Fame players, drawn fresh
// each year. It follows the real process: a long list cut to 25
// semifinalists, then 15 modern-era finalists, two reduction votes (15 to 10,
// 10 to 5), and a yes-or-no vote on the last five where 80 percent elects.
// One senior (retired more than 25 seasons) and one coach or contributor get
// their own yes-or-no vote. A class takes at most five modern-era players.
//
// Voters are people. Each judges a career his own way (rings and All-Pro
// teams for the old-school, the volume of the numbers for others), leans
// toward his own position and his old clubs, and weighs a candidate's
// conduct and his fights with the press differently. Some won't vote anyone
// in his first year unless he is beyond argument. So a great receiver with a
// sour reputation can wait years in the reduction rounds while a cleaner one
// goes in at once, the way Terrell Owens waited and Randy Moss didn't.
// Momentum is real too: a finalist gains ground every year he comes back.
// All of it is engine-only; the owner reads the results, the vote shares and
// what the papers say held a man back.
import hofJson from "../../data/hof/hof.json";
import { careerLines, careerTotals } from "./careerstats";
import { personality } from "./clubhouse";
import { addDays } from "./dates";
import { honors } from "./honors";
import { news, send } from "./inbox";
import { BASE_SEASON, PLAYER_BY_ID, RULES } from "./league";
import { gaussian, rngFor } from "./rng";
import { history } from "./seasons";
import type { GameState, HofBallot, HofEntry, Position } from "./types";

/** One season row from the data: season, club and counting stats. */
export type HofRow = { s: number; t: string } & Record<string, number | string>;

interface Raw {
  n: string;
  pos?: Position;
  kind: "player" | "coach" | "contributor";
  from?: number;
  to?: number;
  teams?: string;
  /** Draft year, round, overall pick and club. */
  draft?: [number, number, number, string];
  pb?: number;
  ap?: number;
  hon?: Record<string, number>;
  st?: Record<string, number>;
  rows?: HofRow[];
  gsis?: string;
  hof?: number;
  /** Reservations on the public record: conduct, press, and what they are about. */
  res?: [number, number, string];
  note?: string;
  record?: string;
  elig?: number;
  d?: 1;
}

const DATA = hofJson as unknown as {
  classes: Record<string, string[]>;
  people: Record<string, Raw>;
  /** Pro Bowls, All-Pros, first and last season for players active since 2010. */
  pre: Record<string, [number, number, number, number]>;
};

/** The season the save began: real classes up to it are history. */
const START = BASE_SEASON;
/** Super Bowl winners by season, 1999-2025, for rings won before the save. */
const SB: Record<number, string[]> = {
  1999: ["STL", "LA"], 2000: ["BAL"], 2001: ["NE"], 2002: ["TB"], 2003: ["NE"], 2004: ["NE"], 2005: ["PIT"], 2006: ["IND"],
  2007: ["NYG"], 2008: ["PIT"], 2009: ["NO"], 2010: ["GB"], 2011: ["NYG"], 2012: ["BAL"], 2013: ["SEA"], 2014: ["NE"],
  2015: ["DEN"], 2016: ["NE"], 2017: ["PHI"], 2018: ["NE"], 2019: ["KC"], 2020: ["TB"], 2021: ["LA"], 2022: ["KC"],
  2023: ["KC"], 2024: ["PHI"], 2025: ["SEA"],
};
const PANEL = 48;
const MODERN_MAX = 5;
const BAR = 19;
const ELECT = 0.8;
const OL = new Set<string>(["OT", "OG", "C"]);

/** A career as the Hall sees it: the plaque and the case. */
export interface HofCase {
  id: string;
  name: string;
  kind: "player" | "coach" | "contributor";
  pos?: Position;
  from: number;
  to: number;
  teams: string[];
  pb: number;
  ap: number;
  rings: number;
  awards: Record<string, number>;
  stats: Record<string, number>;
  rows: HofRow[];
  draft?: [number, number, number, string];
  record?: string;
  note?: string;
  /** Class year if he is in. */
  hofYear?: number;
  /** The first class he could join. */
  eligible: number;
  /** Reservations, engine only: conduct and press, and the public reason if there is one. */
  conduct: number;
  media: number;
  reason?: string;
  /** A player from this save's league (his page opens from the plaque). */
  live: boolean;
  dead: boolean;
}

// ---- Who is who ----

function rawCase(state: GameState | undefined, key: string): HofCase | null {
  const r = DATA.people[key];
  if (!r) return null;
  const hon = { ...(r.hon ?? {}) };
  const rings = hon.rings ?? 0;
  delete hon.rings;
  const id = `hof:${key}`;
  const builder = r.kind !== "player";
  const to = r.to ?? START - 1;
  return {
    id, name: r.n, kind: r.kind, pos: r.pos, from: r.from ?? to, to,
    teams: (r.teams ?? "").split("/").filter(Boolean), pb: r.pb ?? 0, ap: r.ap ?? 0, rings, awards: hon,
    stats: r.st ?? {}, rows: r.rows ?? [], draft: r.draft, record: r.record, note: r.note,
    hofYear: r.hof && r.hof <= START ? r.hof : state ? savedClassOf(state, id) : undefined,
    eligible: r.elig ?? (builder ? to + 1 : to + 6),
    conduct: r.res?.[0] ?? 0, media: r.res?.[1] ?? 0, reason: r.res?.[2], live: false, dead: !!r.d,
  };
}

function savedClassOf(state: GameState, id: string): number | undefined {
  for (const [y, ids] of Object.entries(honors(state).hof.classes)) if (ids.includes(id)) return Number(y);
  return undefined;
}

const AWARD_KEY: Record<string, string> = { MVP: "mvp", OPOY: "opoy", DPOY: "dpoy", OROY: "roy", DROY: "roy" };

function liveCase(state: GameState, id: string): HofCase | null {
  const p = PLAYER_BY_ID[id];
  if (!p) return null;
  const lines = careerLines(state, id).filter((s) => Number(s.g ?? 0) > 0);
  const h = honors(state);
  const awards: Record<string, number> = {};
  for (const list of Object.values(h.awards)) for (const a of list) if (a.winner === id && AWARD_KEY[a.award]) awards[AWARD_KEY[a.award]] = (awards[AWARD_KEY[a.award]] ?? 0) + 1;
  let pb = Object.values(h.proBowl).filter((ids) => ids.includes(id)).length;
  let ap = Object.values(h.allPro).filter((a) => a.first.includes(id)).length;
  // Honors he had already won when the save began.
  const pre = DATA.pre[id];
  if (pre) {
    const share = Math.min(1, Math.max(0, (START - pre[2]) / (pre[3] - pre[2] + 1)));
    pb += Math.round(pre[0] * share);
    ap += Math.round(pre[1] * share);
  }
  const champs: Record<number, string> = {};
  for (const s of history(state).seasons) if (s.champion) champs[s.season] = s.champion;
  const rings = lines.filter((s) => (s.season < START ? SB[s.season]?.includes(s.team) : champs[s.season] === s.team)).length;
  const teams: string[] = [];
  for (const s of lines) if (s.team && !teams.includes(s.team)) teams.push(s.team);
  const last = history(state).retired[id] ?? lines[lines.length - 1]?.season ?? RULES.season;
  const from = lines[0]?.season ?? p.rookieYear ?? last;
  const stats = careerTotals(state, id);
  delete stats.seasons;
  const [conduct, media] = reputation(state, id);
  return {
    id, name: p.name, kind: "player", pos: p.position, from, to: last, teams, pb, ap, rings, awards, stats,
    rows: lines.map((s) => ({ ...(s as unknown as Record<string, number>), s: s.season, t: s.team }) as HofRow),
    draft: p.draft?.round ? [p.rookieYear ?? from, p.draft.round, p.draft.overall ?? 0, p.draft.team ?? ""] as [number, number, number, string] : undefined,
    hofYear: savedClassOf(state, id), eligible: last + 6, conduct, media, live: true, dead: false,
  };
}

/** The plaque and the case for anyone the Hall knows: a player id or "hof:<key>". */
export function hofCase(state: GameState, id: string): HofCase | null {
  return id.startsWith("hof:") ? rawCase(state, id.slice(4)) : liveCase(state, id);
}

/**
 * How a save player's name reads to voters, engine only: marks from
 * discipline cases in this save, and his temperament (a strong presence with
 * little leadership is the star the press fights with).
 */
function reputation(state: GameState, id: string): [number, number] {
  const p = personality(id);
  const marks = honors(state).hof.rep?.[id] ?? [0, 0];
  const conduct = Math.max(0, (0.45 - p.work) * 3) + marks[0];
  const media = Math.max(0, (p.presence - p.leadership - 0.15) * 4) + marks[1];
  return [Math.round(conduct * 10) / 10, Math.round(media * 10) / 10];
}

/** Every class: the real ones up to the season the save began, then the ones voted here. */
export function hofClasses(state: GameState): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const [y, keys] of Object.entries(DATA.classes)) if (Number(y) <= START) out[Number(y)] = keys.map((k) => `hof:${k}`);
  for (const [y, ids] of Object.entries(honors(state).hof.classes)) if (ids.length || !out[Number(y)]) out[Number(y)] = [...ids];
  return out;
}

/** Everyone enshrined. */
export function hofMembers(state: GameState): string[] {
  return Object.values(hofClasses(state)).flat();
}

// ---- The case ----

const VOLUME: Partial<Record<Position, (s: Record<string, number>) => number>> = {
  QB: (s) => 6 * (s.passYds ?? 0) / 50000 + 4 * (s.passTd ?? 0) / 350 + (s.rushTd ?? 0) / 40,
  RB: (s) => 6 * (s.rushYds ?? 0) / 10000 + 3 * ((s.rushTd ?? 0) + (s.recTd ?? 0)) / 90 + (s.recYds ?? 0) / 5000,
  FB: (s) => 3 * (s.rushYds ?? 0) / 10000 + (s.recYds ?? 0) / 5000,
  WR: (s) => 6 * (s.recYds ?? 0) / 11000 + 3 * (s.recTd ?? 0) / 80 + (s.rec ?? 0) / 850,
  TE: (s) => 6 * (s.recYds ?? 0) / 8000 + 3 * (s.recTd ?? 0) / 60 + (s.rec ?? 0) / 650,
  EDGE: (s) => 6 * (s.sacks ?? 0) / 100 + (s.ff ?? 0) / 30,
  IDL: (s) => 6 * (s.sacks ?? 0) / 90 + (s.ff ?? 0) / 30,
  LB: (s) => 4 * (s.sacks ?? 0) / 80 + 2 * (s.defInt ?? 0) / 20 + (s.tklSolo ?? 0) / 900,
  CB: (s) => 6 * (s.defInt ?? 0) / 45 + (s.pd ?? 0) / 150,
  S: (s) => 6 * (s.defInt ?? 0) / 45 + (s.pd ?? 0) / 150,
  K: (s) => 4 * (s.fgm ?? 0) / 450,
};

/** The volume of a career's numbers, judged against a Hall of Fame career at the position. */
function volume(c: HofCase): number {
  return Math.min(14, Math.max(0, VOLUME[c.pos as Position]?.(c.stats) ?? 0));
}

/** How strong a case is on the record alone (a long Hall of Fame career is about 18 and up). */
export function hofMerit(c: HofCase): number {
  if (c.kind !== "player") {
    const [w, l] = (c.record ?? "").split("-").map(Number);
    const pct = w + l ? w / (w + l) : 0.5;
    return c.kind === "coach" ? (w || 0) / 25 + c.rings * 3 + (pct - 0.5) * 20 : 10 + c.rings * 1.5;
  }
  const a = c.awards;
  const line = OL.has(c.pos ?? "");
  const honorsPart = c.ap * (line ? 2.5 : 2) + c.pb * (line ? 1 : 0.7) + (a.mvp ?? 0) * 4 + ((a.opoy ?? 0) + (a.dpoy ?? 0)) * 2 + (a.sbmvp ?? 0) + (a.roy ?? 0) * 0.5 + Math.min(5, c.rings) * 0.6;
  const seasons = Math.min(18, c.to - c.from + 1);
  const raw = honorsPart + volume(c) + seasons * (line ? 0.3 : 0.15);
  return raw * (c.pos === "K" ? 0.6 : c.pos === "P" ? 0.55 : c.pos === "LS" ? 0.2 : 1);
}

/** Position groups for voters' loyalties and for logjams on the ballot. */
function group(pos?: Position): string {
  if (!pos) return "builder";
  if (OL.has(pos)) return "OL";
  if (pos === "EDGE" || pos === "IDL") return "DL";
  if (pos === "CB" || pos === "S") return "DB";
  if (pos === "WR" || pos === "TE") return "REC";
  if (pos === "K" || pos === "P" || pos === "LS") return "ST";
  return pos;
}

// ---- The panel ----

interface Voter { id: string; group: string; teams: Set<string>; strict: number; conduct: number; media: number; oldSchool: number; purist: boolean; homer: number }

function voterOf(state: GameState, id: string): Voter {
  const c = hofCase(state, id);
  const rng = rngFor(state.seed, `hofvoter:${id}`);
  const era = c ? Math.min(1, Math.max(0, (2005 - c.to) / 35)) : 0.3;
  return {
    id, group: group(c?.pos), teams: new Set(c?.teams ?? []),
    strict: gaussian(rng) * 2,
    conduct: 0.5 + rng() * 2.5,
    media: 0.3 + rng() * 1.7,
    oldSchool: Math.min(1, era * 0.7 + rng() * 0.5),
    purist: rng() < 0.3,
    homer: rng() * 2,
  };
}

/** Living Hall of Fame players, from whom each year's panel is drawn. */
function panelPool(state: GameState): string[] {
  return hofMembers(state).filter((id) => {
    const c = hofCase(state, id);
    return c && c.kind === "player" && !c.dead && c.to >= 1970;
  });
}

function drawPanel(state: GameState, year: number): string[] {
  const rng = rngFor(state.seed, `hofpanel:${year}`);
  return panelPool(state).map((id) => ({ id, r: rng() })).sort((a, b) => a.r - b.r).slice(0, PANEL).map((x) => x.id);
}

// ---- The vote ----

interface Ctx { year: number; heat: Map<string, number>; tries: Map<string, number> }

/** One voter's view of a case, before his own bar and the day's noise. */
function view(v: Voter, c: HofCase, merit: number, ctx: Ctx): number {
  let x = merit;
  const g = group(c.pos);
  if (g === v.group) x *= g === "OL" || g === "ST" ? 1.15 : 1.08;
  if (c.kind === "player") x += v.oldSchool * (Math.min(5, c.rings) * 0.8 + c.ap * 0.5 - volume(c) * 0.25);
  if (c.teams.some((t) => v.teams.has(t))) x += v.homer;
  x -= c.conduct * v.conduct;
  x -= c.media * v.media * (ctx.heat.get(c.id) ?? 1);
  const yearOn = ctx.year - c.eligible + 1;
  if (yearOn <= 1 && v.purist && merit < 34) x -= 3;
  x += Math.min(4, ctx.tries.get(c.id) ?? 0) * 0.8;
  return x - v.strict;
}

/** A reduction vote: each voter backs his top `keep`, splitting votes inside a crowded position. */
function reduce(voters: Voter[], cases: HofCase[], merit: Map<string, number>, ctx: Ctx, keep: number, rng: () => number): HofCase[] {
  const votes = new Map<string, number>();
  for (const v of voters) {
    const ranked = cases.map((c) => ({ c, x: view(v, c, merit.get(c.id)!, ctx) + gaussian(rng) * 1.5 })).sort((a, b) => b.x - a.x);
    const seen = new Map<string, number>();
    const adjusted = ranked.map(({ c, x }) => {
      const g = group(c.pos);
      const ahead = seen.get(g) ?? 0;
      seen.set(g, ahead + 1);
      return { c, x: x - ahead * 1.2 };
    }).sort((a, b) => b.x - a.x);
    for (const { c } of adjusted.slice(0, keep)) votes.set(c.id, (votes.get(c.id) ?? 0) + 1);
  }
  return [...cases].sort((a, b) => (votes.get(b.id) ?? 0) - (votes.get(a.id) ?? 0) || merit.get(b.id)! - merit.get(a.id)!).slice(0, keep);
}

/** Yes votes out of the panel for one finalist. */
function finalShare(voters: Voter[], c: HofCase, merit: number, ctx: Ctx, rng: () => number, bar = BAR): number {
  let yes = 0;
  for (const v of voters) if (view(v, c, merit, ctx) + gaussian(rng) * 3 > bar) yes++;
  return voters.length ? yes / voters.length : 0;
}

/** What the papers say held a finalist back. */
function whyNot(c: HofCase, merit: number, ballot: HofCase[], ctx: Ctx, stage: number): string {
  const yearOn = ctx.year - c.eligible + 1;
  const crowd = ballot.filter((o) => o.id !== c.id && group(o.pos) === group(c.pos)).length;
  if (c.conduct >= 1.2) return c.reason ? `Voters held back: he ${c.reason}.` : "Voters held his conduct off the field against him.";
  if (c.media >= 1.2) return "Years of feuding with the press and his own locker room cost him votes.";
  if (c.pos === "K" || c.pos === "P") return "Kickers and punters seldom get the votes.";
  if (crowd >= 2 && stage >= 10) return `A crowded ballot at his position split the votes (${crowd + 1} finalists).`;
  if (yearOn <= 1 && merit < 34) return "First year on the ballot: several voters make a candidate wait.";
  if (c.to - c.from + 1 < 9 && c.kind === "player") return "A brilliant peak, but voters wanted a longer career.";
  if (c.conduct + c.media >= 0.8) return "Old questions about his reputation lingered with some voters.";
  return stage === 5 ? "Came up short of the 80 percent he needed." : "Others on the ballot had the stronger case this year.";
}

/** Players and builders who could be on the year's ballot, by track. */
function pools(state: GameState, year: number, inducted: Set<string>): { modern: HofCase[]; seniors: HofCase[]; builders: HofCase[] } {
  const modern: HofCase[] = [];
  const seniors: HofCase[] = [];
  const builders: HofCase[] = [];
  const put = (c: HofCase) => {
    if (inducted.has(c.id) || c.eligible > year) return;
    if (c.kind !== "player") builders.push(c);
    else if (c.to >= year - 25) modern.push(c);
    else seniors.push(c);
  };
  for (const [key, r] of Object.entries(DATA.people)) {
    if (r.hof && r.hof <= START) continue;
    if (r.gsis && PLAYER_BY_ID[r.gsis]) continue; // still in this save's league: his own career decides
    if (r.kind === "player" && (r.to ?? START) >= START) continue;
    const c = rawCase(state, key);
    if (c) put(c);
  }
  const h = honors(state);
  for (const [id, last] of Object.entries(history(state).retired)) {
    if (last > year - 6 || inducted.has(id) || !PLAYER_BY_ID[id]) continue;
    // A quick look first: most careers never get near a ballot.
    const pre = DATA.pre[id];
    const pbs = Object.values(h.proBowl).filter((ids) => ids.includes(id)).length + (pre?.[0] ?? 0);
    if (pbs < 2 && careerLines(state, id).length < 9) continue;
    const c = liveCase(state, id);
    if (c) put(c);
  }
  return { modern, seniors, builders };
}

/** Runs one year's vote. Pure but for the rng: `inducted` and `tries` are the caller's. */
function runVote(state: GameState, year: number, inducted: Set<string>, tries: Map<string, number>, key: string): HofBallot & { elected: string[] } {
  const rng = rngFor(state.seed, `${key}:${year}`);
  const voters = drawPanel(state, year).map((id) => voterOf(state, id));
  const { modern, seniors, builders } = pools(state, year, inducted);
  const merit = new Map<string, number>();
  for (const c of [...modern, ...seniors, ...builders]) merit.set(c.id, hofMerit(c));
  const ctx: Ctx = { year, tries, heat: new Map() };
  // How loudly the papers argue a candidate's baggage this year.
  for (const c of modern) if (c.media > 0) ctx.heat.set(c.id, 0.6 + rng() * 0.8);

  // The long list cut to 25 by the Hall's screening, then 15 by the panel's average view.
  const screen = (c: HofCase) => merit.get(c.id)! + Math.min(4, tries.get(c.id) ?? 0) + gaussian(rng) * 2 - (c.conduct + c.media) * 0.5;
  const semis = [...modern].sort((a, b) => screen(b) - screen(a)).slice(0, 25);
  const avg = (c: HofCase) => voters.reduce((t, v) => t + view(v, c, merit.get(c.id)!, ctx), 0) / Math.max(1, voters.length) + gaussian(rng);
  const finalists = [...semis].sort((a, b) => avg(b) - avg(a)).slice(0, 15);
  const ten = reduce(voters, finalists, merit, ctx, 10, rng);
  const five = reduce(voters, ten, merit, ctx, 5, rng);
  // The final five are the year's best: voters judge them against each other as
  // much as against the ages, so a thin year still sends most of them in.
  const bar = Math.min(BAR, five.reduce((t, c) => t + merit.get(c.id)!, 0) / Math.max(1, five.length) - 2);
  const shares = new Map(five.map((c) => [c.id, finalShare(voters, c, merit.get(c.id)!, ctx, rng, bar)]));
  const elected = five.filter((c) => shares.get(c.id)! >= ELECT).sort((a, b) => shares.get(b.id)! - shares.get(a.id)!).slice(0, MODERN_MAX).map((c) => c.id);

  const entry = (c: HofCase, stage: HofEntry["stage"], share?: number): HofEntry => {
    const won = share !== undefined && share >= ELECT && (stage !== 5 || elected.includes(c.id));
    return {
      id: c.id, stage, year: year - Math.max(c.eligible, 1963) + 1, ...(share !== undefined ? { share: Math.round(share * 100) } : {}),
      ...(won ? { elected: true } : stage <= 15 ? { why: whyNot(c, merit.get(c.id)!, finalists, ctx, stage) } : {}),
    };
  };
  const stageOf = (c: HofCase): HofEntry["stage"] => (five.includes(c) ? 5 : ten.includes(c) ? 10 : finalists.includes(c) ? 15 : 25);
  const modernEntries = semis.map((c) => entry(c, stageOf(c), shares.get(c.id)));

  // One senior and one coach or contributor, each on his own yes-or-no vote.
  const pick = (list: HofCase[], wait: number) => [...list].sort((a, b) => merit.get(b.id)! + (year - b.eligible) * wait + gaussian(rng) * 2 - (merit.get(a.id)! + (year - a.eligible) * wait)).slice(0, 1);
  const extra = (list: HofCase[], bar: number) => list.map((c) => {
    const share = finalShare(voters, c, merit.get(c.id)!, ctx, rng, bar);
    if (share >= ELECT) elected.push(c.id);
    return { ...entry(c, 1, share), ...(share >= ELECT ? { elected: true, why: undefined } : { why: whyNot(c, merit.get(c.id)!, list, ctx, 5) }) } as HofEntry;
  });
  const seniorEntries = extra(pick(seniors.filter((c) => merit.get(c.id)! >= 9), 0.3), BAR - 6);
  const builderEntries = extra(pick(builders, 0.2), 13);
  for (const c of finalists) tries.set(c.id, (tries.get(c.id) ?? 0) + 1);
  for (const id of elected) inducted.add(id);
  const clean = (e: HofEntry) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as unknown as HofEntry;
  return { panel: voters.map((v) => v.id), modern: modernEntries.map(clean), seniors: seniorEntries.map(clean), builders: builderEntries.map(clean), elected };
}

/** Years each candidate has already been a modern-era finalist in this save. */
function triesSoFar(state: GameState): Map<string, number> {
  const tries = new Map<string, number>();
  for (const b of Object.values(honors(state).hof.ballots ?? {})) for (const e of b.modern) if (e.stage <= 15) tries.set(e.id, (tries.get(e.id) ?? 0) + 1);
  return tries;
}

function electClass(state: GameState, year: number): void {
  const h = honors(state).hof;
  if (h.classes[year]) return;
  const ballot = runVote(state, year, new Set(hofMembers(state)), triesSoFar(state), "hof");
  const { elected, ...rest } = ballot;
  (h.ballots ??= {})[year] = rest;
  h.classes[year] = elected;
  h.finalists[year] = rest.modern.filter((e) => e.stage <= 15).map((e) => e.id);
  const names = elected.map((id) => hofCase(state, id)?.name ?? id);
  if (names.length) news(state, `The Pro Football Hall of Fame class of ${year}: ${names.join(", ")}.`);
  // The snub the papers write about: the strongest case left out.
  const snub = rest.modern.filter((e) => e.stage <= 10 && !e.elected).map((e) => hofCase(state, e.id)!).sort((a, b) => hofMerit(b) - hofMerit(a))[0];
  if (snub) news(state, `${snub.name} misses the Hall of Fame again. ${rest.modern.find((e) => e.id === snub.id)?.why ?? ""}`.trim());
  const ours = elected.map((id) => hofCase(state, id)!).filter((c) => c.teams.includes(state.userTeam));
  if (ours.length) send(state, "league", "Pro Football Hall of Fame", `${ours.map((c) => c.name).join(" and ")} elected to the Hall of Fame`,
    `${ours.map((c) => c.name).join(" and ")}, who played for us, ${ours.length === 1 ? "is" : "are"} in the class of ${year}. The enshrinement is in Canton in August, before the Hall of Fame Game, and the club is planning a ring ceremony at halftime of a home game.`);
}

// ---- Projections ----

const projections = new Map<string, { year: number; names: string[] }[]>();

/**
 * How the Hall watchers see the next classes: the same vote run ahead on
 * today's candidates (careers that end later can't be in it yet). The first
 * year is the class of the vote still to come this season.
 */
export function projectClasses(state: GameState, count = 4): { year: number; ids: string[] }[] {
  const first = honors(state).hof.classes[RULES.season + 1] ? RULES.season + 2 : RULES.season + 1;
  const tag = `${state.seed}:${state.date}:${first}`;
  const cached = projections.get(tag);
  if (cached) return cached.map((p) => ({ year: p.year, ids: p.names }));
  const inducted = new Set(hofMembers(state));
  const tries = triesSoFar(state);
  const out: { year: number; names: string[] }[] = [];
  for (let y = first; y < first + count; y++) out.push({ year: y, names: runVote(state, y, inducted, tries, "hofproj").elected });
  projections.clear();
  projections.set(tag, out);
  return out.map((p) => ({ year: p.year, ids: p.names }));
}

/** The strongest cases still waiting, longest wait first among the best. */
export function stillWaiting(state: GameState, count = 12): { c: HofCase; years: number }[] {
  const year = RULES.season + 1;
  const { modern, seniors } = pools(state, year, new Set(hofMembers(state)));
  return [...modern, ...seniors].map((c) => ({ c, m: hofMerit(c), years: year - c.eligible })).filter((x) => x.years >= 1)
    .sort((a, b) => b.m - a.m).slice(0, count).map(({ c, years }) => ({ c, years }));
}

// ---- What the plaque says ----

/** The accomplishments line by line, for the plaque. */
export function accomplishments(c: HofCase): string[] {
  const out: string[] = [];
  const n = (k: string, one: string, many: string) => { const v = c.awards[k] ?? 0; if (v) out.push(v === 1 ? one : `${v}× ${many}`); };
  if (c.kind !== "player") {
    if (c.record) out.push(`${c.record} record as head coach`);
    if (c.rings) out.push(c.rings === 1 ? "League champion" : `${c.rings}× league champion`);
    if (c.note) out.push(c.note);
    return out;
  }
  if (c.rings) out.push(c.rings === 1 ? "League champion" : `${c.rings}× league champion`);
  n("mvp", "Most Valuable Player", "Most Valuable Player");
  n("sbmvp", "Super Bowl MVP", "Super Bowl MVP");
  n("opoy", "Offensive Player of the Year", "Offensive Player of the Year");
  n("dpoy", "Defensive Player of the Year", "Defensive Player of the Year");
  if (c.ap) out.push(c.ap === 1 ? "First-team All-Pro" : `${c.ap}× first-team All-Pro`);
  if (c.pb) out.push(c.pb === 1 ? "Pro Bowl" : `${c.pb}× Pro Bowl`);
  n("roy", "Rookie of the Year", "Rookie of the Year");
  if (c.draft) out.push(`Drafted ${c.draft[0]}, round ${c.draft[1]}${c.draft[2] ? ` (No. ${c.draft[2]})` : ""}${c.draft[3] ? ` by ${c.draft[3]}` : ""}`);
  return out;
}

const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

/** The career in one line, by position. */
export function headline(c: HofCase): string {
  const s = c.stats;
  const bits: string[] = [];
  const add = (v: number | undefined, what: string) => { if (v) bits.push(`${fmt(v)} ${what}`); };
  switch (c.pos) {
    case "QB": add(s.passYds, "passing yards"); add(s.passTd, "TD passes"); break;
    case "RB": case "FB": add(s.rushYds, "rushing yards"); add((s.rushTd ?? 0) + (s.recTd ?? 0), "touchdowns"); break;
    case "WR": case "TE": add(s.rec, "catches"); add(s.recYds, "yards"); add(s.recTd, "TD"); break;
    case "EDGE": case "IDL": case "LB": add(s.sacks, "sacks"); add(s.defInt, "interceptions"); break;
    case "CB": case "S": add(s.defInt, "interceptions"); break;
    case "K": add(s.fgm, "field goals"); break;
    case "P": if (s.puntAvg) bits.push(`${s.puntAvg} yards a punt`); break;
  }
  if (!bits.length && c.kind === "player") bits.push(c.ap ? `${c.ap}× first-team All-Pro` : `${c.to - c.from + 1} seasons`);
  if (c.kind !== "player") return c.record ? `${c.record}, ${c.rings} titles` : c.rings ? `${c.rings} titles` : c.note ?? "";
  return bits.join(" · ");
}

/** His wait: first ballot, or the years it took. */
export function waitLabel(c: HofCase): string {
  if (!c.hofYear) return "";
  if (c.kind !== "player") return "";
  const y = c.hofYear - c.eligible + 1;
  if (c.hofYear < 1970) return "Charter era";
  return y <= 1 ? "First ballot" : y > 20 ? "Seniors committee" : `In his ${y}${y === 2 ? "nd" : y === 3 ? "rd" : "th"} year`;
}

// ---- The day ----

/**
 * Reads discipline cases into reputations as they happen (suspensions weigh
 * on conduct, things said in public on the press), and elects the class
 * three days before the Super Bowl, with the awards.
 */
export function hallOfFameDaily(state: GameState): void {
  const h = honors(state).hof;
  const cases = state.program?.incidents ?? [];
  const seen = h.seen ?? "";
  for (const inc of cases) {
    if (inc.date <= seen) continue;
    const rep = ((h.rep ??= {})[inc.player] ??= [0, 0]);
    if (inc.kind === "comments") rep[1] = Math.round((rep[1] + 0.4) * 10) / 10;
    else if (inc.games) rep[0] = Math.round((rep[0] + Math.min(2, 0.3 + inc.games / 6)) * 10) / 10;
  }
  if (cases.length) h.seen = cases.reduce((m, c) => (c.date > m ? c.date : m), seen);
  if (state.date === addDays(RULES.keyDates.superBowl, -3)) electClass(state, RULES.season + 1);
}

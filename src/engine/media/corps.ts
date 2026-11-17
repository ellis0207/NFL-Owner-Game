// The press corps: the people who cover the league. Eight national outlets
// (in outlets.ts) and local media in every market: a paper with two beat
// writers and a columnist, a sports radio station with two hosts and a TV
// sports anchor. Everyone here is made up and generated from the save's seed.
// Reporters are people: a beat, a style, sources inside particular clubs, an
// accuracy the owner never sees, a public record of reports that panned out
// or didn't, and careers that move each summer (retirements, promotions from
// local papers to national outlets, moves between markets) with two made-up
// press awards each February.
import { addDays } from "../dates";
import { news } from "../inbox";
import { RULES, TEAMS, TEAM_BY_ID } from "../league";
import { FIRST_NAMES, LAST_NAMES } from "../names";
import { MEDIA, MEDIA_BY_ID, mediaState, type MediaOutlet } from "../outlets";
import { rngFor, type Rng } from "../rng";
import type { GameState, PressCorps, Reporter, ReporterRole } from "../types";

/** National desks beyond the founding staff in outlets.ts: how many of each role each outlet carries. */
const NATIONAL_DESKS: Record<string, Partial<Record<ReporterRole, number>>> = {
  ledger: { insider: 2, columnist: 1, analyst: 1, draft: 1, reporter: 1 },
  sideline: { insider: 3, columnist: 1, analyst: 1, draft: 1, reporter: 1 },
  capspace: { insider: 2, columnist: 1, draft: 1, reporter: 1 },
  blitz: { insider: 1, columnist: 1, host: 2 },
  sentinel: { insider: 1, columnist: 1, draft: 1, reporter: 1 },
  afw: { insider: 3, reporter: 2, analyst: 1 },
  xp: { analyst: 3, columnist: 1 },
  journal: { insider: 2, reporter: 2, columnist: 1 },
};

/** Each market's local media, by outlet kind. */
const LOCAL_DESKS: { kind: "local" | "radio" | "tv"; role: ReporterRole; n: number }[] = [
  { kind: "local", role: "beat", n: 2 }, { kind: "local", role: "columnist", n: 1 },
  { kind: "radio", role: "host", n: 2 }, { kind: "tv", role: "anchor", n: 1 },
];

const PAPER = ["Courier", "Sun-Register", "Morning Star", "Daily Press", "Herald", "Evening Tribune", "Post-Dispatch", "Chronicle-Journal"];
const RADIO = ["The Huddle", "The Gridiron", "The Two-Minute Drill", "Sports Talk", "The End Zone", "Fourth Down Radio"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The made-up local outlet for a market: "local:DET" (the paper), "radio:DET", "tv:DET". */
export function localOutlet(id: string): MediaOutlet | undefined {
  const [kind, team] = id.split(":");
  const t = TEAM_BY_ID[team];
  if (!t || !["local", "radio", "tv"].includes(kind)) return undefined;
  const h = hash(team);
  const name = kind === "local" ? `The ${t.city} ${PAPER[h % PAPER.length]}`
    : kind === "radio" ? `${RADIO[h % RADIO.length]} ${88 + (h % 20)}.${1 + (h % 9)} ${t.city}`
    : `Channel ${2 + (h % 11)} ${t.city} Sports`;
  const what = kind === "local" ? `The ${t.name}' hometown paper: beat writers at every practice, a columnist who has seen it all.`
    : kind === "radio" ? `${t.city} sports radio: callers, hosts and the ${t.name} every afternoon.` : `The local TV sports desk: highlights, sound bites, the late news.`;
  return { id, name, what, insider: "", columnist: "", analyst: "", draft: "", reporter: "", heat: kind === "radio" ? 0.85 : kind === "tv" ? 0.35 : 0.3 };
}

/** Any outlet by id: a national one, our old "Local beat", or a market's local media. */
export function outletOf(id: string): MediaOutlet {
  return MEDIA_BY_ID[id] ?? localOutlet(id) ?? MEDIA_BY_ID.beat;
}

export const isLocal = (id: string) => /^(local|radio|tv):/.test(id) || id === "beat";
const marketOf = (id: string) => id.split(":")[1];

function newPerson(c: PressCorps, rng: Rng, outlet: string, role: ReporterRole, season: number, name?: string, team?: string): Reporter {
  const local = isLocal(outlet);
  const hot = outletOf(outlet).heat;
  const r: Reporter = {
    id: `rp${c.next++}`,
    name: name ?? `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`,
    outlet, role, team,
    born: season - (local ? 26 + Math.floor(rng() * 30) : 32 + Math.floor(rng() * 28)),
    since: season - Math.floor(rng() * 12),
    heat: Math.max(0, Math.min(1, hot + (rng() - 0.5) * 0.3)),
    style: rng() < 0.3 ? "stats" : rng() < 0.45 ? "oldschool" : "balanced",
    // The best-sourced people are national insiders and long-time beat writers; radio hosts mostly repeat what they hear.
    accuracy: Math.round((role === "insider" ? 0.72 + rng() * 0.24 : role === "beat" ? 0.62 + rng() * 0.28 : role === "host" ? 0.35 + rng() * 0.25 : 0.5 + rng() * 0.3) * 100) / 100,
    sources: {}, rel: 0, hits: 0, misses: 0, awards: [], history: [],
  };
  if (team) r.sources[team] = 55 + Math.floor(rng() * 40);
  if (!local && (role === "insider" || role === "reporter")) {
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const t = TEAMS[Math.floor(rng() * TEAMS.length)].id;
      r.sources[t] = Math.max(r.sources[t] ?? 0, 30 + Math.floor(rng() * 50));
    }
  }
  return r;
}

/** The corps, built the first time anything asks for it (old saves get one on load). */
export function corps(state: GameState): PressCorps {
  const m = mediaState(state);
  if (m.corps) return m.corps;
  const rng = rngFor(state.seed, "press-corps");
  const season = RULES.season;
  const c: PressCorps = { people: [], next: 1, rumors: [] };
  const used = new Set<string>();
  const add = (r: Reporter) => {
    while (used.has(r.name)) r.name = `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
    used.add(r.name);
    c.people.push(r);
  };
  for (const o of MEDIA) {
    if (o.id === "beat") continue;
    const desk = { ...NATIONAL_DESKS[o.id] };
    // The founding staff keep their names and jobs.
    const founders: [ReporterRole, string][] = (["insider", "columnist", "analyst", "draft", "reporter"] as const).map((role) => [role, o[role]] as [ReporterRole, string]).filter(([, n]) => n);
    const seen = new Set<string>();
    for (const [role, name] of founders) {
      if (seen.has(name)) continue;
      seen.add(name);
      add(newPerson(c, rng, o.id, role, season, name));
      if (desk[role]) desk[role]!--;
    }
    for (const [role, n] of Object.entries(desk) as [ReporterRole, number][]) for (let i = 0; i < n; i++) add(newPerson(c, rng, o.id, role, season));
  }
  for (const t of TEAMS) for (const d of LOCAL_DESKS) for (let i = 0; i < d.n; i++) add(newPerson(c, rng, `${d.kind}:${t.id}`, d.role, season, undefined, t.id));
  m.corps = c;
  return c;
}

export const working = (state: GameState) => corps(state).people.filter((p) => p.retired === undefined);

/** Who writes a piece for an outlet: someone in the role, weighted toward good sources on the team it's about. */
export function pickReporter(state: GameState, outlet: string, role: ReporterRole, rng: Rng, team?: string): Reporter | undefined {
  const staff = working(state).filter((p) => p.outlet === outlet);
  const want: ReporterRole[] = (role === "reporter" || role === "insider") && isLocal(outlet) ? ["beat"] : role === "columnist" ? ["columnist", "host"] : [role];
  const pool = staff.filter((p) => want.includes(p.role));
  const list = pool.length ? pool : staff;
  if (!list.length) return undefined;
  const w = list.map((p) => 1 + (team ? (p.sources[team] ?? 0) / 25 : 0));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) if ((x -= w[i]) <= 0) return list[i];
  return list[list.length - 1];
}

/** The usual byline for an outlet's role, for systems that file their own one-off stories. */
export function byline(state: GameState, outlet: string, role: ReporterRole): string {
  const staff = working(state).filter((p) => p.outlet === outlet);
  return (staff.find((p) => p.role === role) ?? staff[0])?.name ?? outletOf(outlet)[role as "insider"] ?? "Staff";
}

/** A market's local media staff in a role: the beat writers who cover a club every day, its columnist, hosts, anchor. */
export function localStaff(state: GameState, team: string, role: ReporterRole): Reporter[] {
  return working(state).filter((p) => p.team === team && p.role === role && isLocal(p.outlet));
}

/** A reporter's record in words: what the owner can learn about whom to believe. */
export function recordLine(r: Reporter): string {
  const n = r.hits + r.misses;
  if (n < 3) return n ? `${r.hits} of ${n} reports confirmed so far` : "No reports to judge yet";
  const pct = r.hits / n;
  return `${r.hits} of ${n} reports confirmed: ${pct >= 0.85 ? "as reliable as it gets" : pct >= 0.7 ? "usually right" : pct >= 0.55 ? "hit or miss" : "often wrong"}`;
}

// ---- Careers ----

/** Each summer: retirements, the best local reporters move up to national jobs, a few change markets, and new people are hired. */
function careerMoves(state: GameState): void {
  const c = corps(state);
  const season = RULES.season;
  const rng = rngFor(state.seed, `press-careers:${season}`);
  const openings: { outlet: string; role: ReporterRole; team?: string }[] = [];
  const leave = (p: Reporter, why: string) => {
    p.history.push({ season, outlet: p.outlet, role: p.role });
    openings.push({ outlet: p.outlet, role: p.role, team: p.team });
    if (why) news(state, "media", why);
  };
  for (const p of working(state)) {
    const age = season - p.born;
    if (rng() < (age >= 66 ? 0.45 : age >= 60 ? 0.15 : 0.015)) {
      p.retired = season;
      leave(p, isLocal(p.outlet) ? "" : `${p.name} of ${outletOf(p.outlet).name} retires after ${season - p.since} years at the outlet`);
    }
  }
  // National openings go to the best local reporters with a record behind them.
  for (const o of openings.filter((x) => !isLocal(x.outlet))) {
    const ladder = working(state).filter((p) => isLocal(p.outlet) && (p.role === "beat" || p.role === "columnist") && season - p.since >= 3)
      .sort((a, b) => (b.hits - b.misses * 1.5 + b.accuracy * 10 + b.awards.length * 5) - (a.hits - a.misses * 1.5 + a.accuracy * 10 + a.awards.length * 5));
    const up = ladder[Math.floor(rng() * Math.min(4, ladder.length))];
    if (!up || rng() < 0.25) {
      c.people.push(newPerson(c, rng, o.outlet, o.role, season));
      continue;
    }
    const from = up.outlet;
    leave(up, "");
    news(state, "media", `${outletOf(o.outlet).name} hires ${up.name} away from ${outletOf(from).name} as a national ${o.role}`);
    up.outlet = o.outlet;
    up.role = o.role;
    up.since = season;
    up.team = undefined;
  }
  // A few local people change markets every year; the rest of the openings are new hires.
  for (const p of working(state).filter((x) => isLocal(x.outlet) && rng() < 0.03)) {
    const to = TEAMS[Math.floor(rng() * TEAMS.length)].id;
    if (to === p.team) continue;
    leave(p, "");
    const kind = p.outlet.split(":")[0];
    p.outlet = `${kind}:${to}`;
    p.team = to;
    p.sources = { [to]: 30 + Math.floor(rng() * 25) };
    p.since = season;
    const back = openings.findIndex((x) => x.outlet === p.outlet && x.role === p.role);
    if (back >= 0) openings.splice(back, 1);
  }
  for (const o of openings.filter((x) => isLocal(x.outlet))) {
    if (working(state).filter((p) => p.outlet === o.outlet && p.role === o.role).length >= (LOCAL_DESKS.find((d) => d.kind === o.outlet.split(":")[0] && d.role === o.role)?.n ?? 1)) continue;
    c.people.push(newPerson(c, rng, o.outlet, o.role, season, undefined, marketOf(o.outlet)));
  }
  // Sources grow the longer someone covers a club, and fade slowly elsewhere.
  for (const p of working(state)) {
    for (const t of Object.keys(p.sources)) p.sources[t] = Math.max(0, Math.min(100, p.sources[t] + (t === p.team ? 3 : -2)));
  }
  // The retired stay for history a few years, then drop off.
  c.people = c.people.filter((p) => p.retired === undefined || season - p.retired <= 3);
}

/** February: the made-up Press Box Award for reporting and the Halloran Award for a column (both invented). */
function pressAwards(state: GameState): void {
  const season = RULES.season;
  const live = working(state);
  const record = (p: Reporter) => (p.hits + p.misses >= 4 ? p.hits / (p.hits + p.misses) + p.hits / 100 : 0);
  const reporter = [...live].sort((a, b) => record(b) - record(a))[0];
  const rng = rngFor(state.seed, `press-awards:${season}`);
  const writers = live.filter((p) => p.role === "columnist");
  const column = writers[Math.floor(rng() * writers.length)];
  if (reporter && record(reporter) > 0) {
    reporter.awards.push({ season, name: "Press Box Award" });
    news(state, "media", `${reporter.name} of ${outletOf(reporter.outlet).name} wins the Press Box Award for reporting`);
  }
  if (column) {
    column.awards.push({ season, name: "Halloran Award" });
    news(state, "media", `${column.name} of ${outletOf(column.outlet).name} wins the Halloran Award for column writing`);
  }
}

export function corpsDaily(state: GameState): void {
  corps(state);
  if (state.date === `${RULES.season}-06-15`) careerMoves(state);
  if (state.date === addDays(RULES.keyDates.superBowl, -4)) pressAwards(state);
}

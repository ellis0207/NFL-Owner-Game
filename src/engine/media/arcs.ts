// Storylines: the stories that run for weeks or months. An arc has a subject
// (a club, a player, a coach), opens when something real starts it (a coach's
// seat getting hot, a holdout, a quarterback switch, a winning streak, a
// stadium fight, a relocation bid, a sale), moves through phases as the
// season answers it, and ends one of several ways: the coach is fired or
// survives, the holdout gets paid or reports, the streak is snapped or becomes
// history. Each step writes its own stories through the story engine, and the
// Media page tracks what's open. Our club's preseason questions (review.ts)
// and the owner's public promises (press.ts) run as arcs too.
import { capSummary, contractYearsLeft, teamPlayerIds } from "../cap";
import { fireChance, openSearches } from "../carousel";
import { staff } from "../coaches";
import { culture } from "../culture";
import { addDays, ageOn, daysBetween, weekday } from "../dates";
import { production } from "../honors";
import { PLAYER_BY_ID, RULES, TEAMS, TEAM_BY_ID } from "../league";
import { marketView } from "../market";
import { mediaState } from "../outlets";
import { depthChart } from "../roster";
import { teamStaff } from "../staff";
import { standings, type Record_ } from "../standings";
import { seasonTotals } from "../stats";
import { trades } from "../trades";
import type { Arc, ArcState, GameState, Position } from "../types";
import { fileFacts } from "./compose";
import { playerSlots, teamSlots, type Fact } from "./facts";

interface Ctx {
  state: GameState;
  date: string;
  us: string;
  wd: string;
  table: Record<string, Record_>;
  facts: Fact[];
  inSeason: boolean;
  /** The week of the regular season, 0 before it starts. */
  week: number;
}

export interface Opening { key: string; team: string; player?: string; coach?: string; other?: string; data?: Record<string, string | number | boolean>; value?: number }
type Step = { phase?: string; end?: string; other?: string; coach?: string } | undefined;

interface ArcDef {
  kind: string;
  /** How much the league cares, before our club and star power add to it. */
  value: number;
  /** The most of this kind open at once. */
  max: number;
  /** Days before a quiet arc fades out on its own. */
  days: number;
  open?: (c: Ctx) => Opening[];
  step?: (c: Ctx, a: Arc) => Step;
}

const K = () => RULES.keyDates;
const streak = (r?: Record_) => {
  const s = r?.streak ?? "";
  const n = Number(s.slice(1)) || 0;
  return { w: s.startsWith("W") ? n : 0, l: s.startsWith("L") ? n : 0 };
};
const hcId = (team: string) => teamStaff(team).HC?.id;
const qb1 = (state: GameState, team: string) => depthChart(state, team).QB?.[0];
const ids = (_c: Ctx) => TEAMS.map((t) => t.id);
const seasonOver = (c: Ctx) => c.date > K().regularSeasonEnd;
const exp = (state: GameState, id: string) => state.players[id]?.exp ?? PLAYER_BY_ID[id]?.yearsExp ?? 0;
const signedSince = (state: GameState, id: string, since: string) => state.signings.find((s) => s.player === id && s.date >= since);
const factsOf = (c: Ctx, topic: string, team: string) => c.facts.filter((f) => f.family === "wire" && f.slots.topic === topic && f.teams[0] === team);

/** The young players having the best seasons: rookies, or second- and third-year breakouts. */
function risers(c: Ctx, rookies: boolean): Opening[] {
  const reg = seasonTotals(c.state, "REG");
  return Object.entries(reg).filter(([id, s]) => PLAYER_BY_ID[id] && (s.line.g ?? 0) >= 4 && (rookies ? exp(c.state, id) === 0 : exp(c.state, id) >= 1 && exp(c.state, id) <= 3))
    .map(([id, s]) => [id, s.team, production(PLAYER_BY_ID[id].position as Position, s.line as unknown as Record<string, number>) / (s.line.g || 1)] as const)
    .sort((a, b) => b[2] - a[2]).slice(0, rookies ? 3 : 2).map(([id, team]) => ({ key: id, team, player: id }));
}

export const ARCS: ArcDef[] = [
  {
    kind: "hotSeat", value: 55, max: 5, days: 120,
    open: (c) => (c.inSeason && c.wd === "Tuesday" && c.week >= 7 ? ids(c).flatMap((t) => {
      const coach = hcId(t) ? staff(c.state).people[hcId(t)!] : undefined;
      return coach && fireChance(c.state, t, coach) >= 0.4 ? [{ key: t, team: t, coach: coach.id }] : [];
    }) : []),
    step: (c, a) => {
      if (hcId(a.team) !== a.coach) return { end: "fired" };
      const s = streak(c.table[a.team]);
      if (s.w >= 3 && a.phase !== "reprieve") return { phase: "reprieve" };
      if (s.l >= 3 && a.phase !== "scorching") return { phase: "scorching" };
      return c.date > addDays(K().regularSeasonEnd, 16) ? { end: "survived" } : undefined;
    },
  },
  {
    kind: "qbSwitch", value: 60, max: 4, days: 120,
    open: (c) => {
      if (!c.inSeason || c.wd !== "Tuesday") return [];
      const memo = (arcState(c.state).qb1 ??= {});
      const out: Opening[] = [];
      for (const t of ids(c)) {
        const now = qb1(c.state, t);
        if (now && memo[t] && memo[t] !== now && c.week >= 2) out.push({ key: t, team: t, player: now, data: { was: memo[t] } });
        if (now) memo[t] = now;
      }
      return out;
    },
    step: (c, a) => {
      if (c.wd !== "Tuesday") return undefined;
      if (qb1(c.state, a.team) !== a.player) return { end: "benched" };
      const s = streak(c.table[a.team]);
      if (s.w >= 2 && a.phase === "open") return { phase: "settling" };
      if (s.l >= 2 && a.phase !== "pressure") return { phase: "pressure" };
      return seasonOver(c) ? { end: "keptJob" } : undefined;
    },
  },
  {
    kind: "holdout", value: 55, max: 6, days: 200,
    open: (c) => ids(c).flatMap((t) => teamPlayerIds(c.state, t).filter((id) => c.state.players[id].holdout && PLAYER_BY_ID[id]).map((id) => ({ key: id, team: t, player: id }))),
    step: (c, a) => {
      const p = c.state.players[a.player!];
      if (p?.team !== a.team) return { end: "traded" };
      if (signedSince(c.state, a.player!, a.opened)) return { end: "paid" };
      if (!p.holdout) return { end: "reported" };
      return daysBetween(a.opened, c.date) >= 10 && a.phase === "open" ? { phase: "fines" } : undefined;
    },
  },
  {
    kind: "contractYear", value: 50, max: 6, days: 300,
    open: (c) => (c.inSeason && c.wd === "Tuesday" && c.week >= 4 ? ids(c).flatMap((t) => teamPlayerIds(c.state, t)
      .filter((id) => PLAYER_BY_ID[id] && contractYearsLeft(id, RULES.season, c.state) <= 1 && marketView(c.state, id) >= 90)
      .map((id) => ({ key: id, team: t, player: id }))).slice(0, 6) : []),
    step: (c, a) => {
      const s = signedSince(c.state, a.player!, a.opened);
      if (s) return { end: s.team !== a.team ? "leaves" : s.kind === "tag" ? "tagged" : "extended" };
      if (c.state.players[a.player!]?.team !== a.team && c.state.players[a.player!]?.team) return { end: "traded" };
      return c.date >= K().negotiatingWindowOpens && c.date < K().draftStart && a.phase === "open" ? { phase: "deadline" } : undefined;
    },
  },
  {
    kind: "tradeRequest", value: 65, max: 5, days: 200,
    open: (c) => Object.entries(trades(c.state).requests).filter(([id, d]) => d === c.date && c.state.players[id]?.team && PLAYER_BY_ID[id])
      .map(([id]) => ({ key: id, team: c.state.players[id].team!, player: id })),
    step: (c, a) => {
      if (c.state.players[a.player!]?.team !== a.team) return { end: "traded", other: c.state.players[a.player!]?.team ?? undefined };
      if (signedSince(c.state, a.player!, a.opened)) return { end: "paid" };
      if (!trades(c.state).requests[a.player!]) return { end: "settled" };
      return c.date === K().tradeDeadline && a.phase === "open" ? { phase: "deadline" } : undefined;
    },
  },
  {
    kind: "scandal", value: 55, max: 4, days: 40,
    open: (c) => c.facts.filter((f) => f.family === "wire" && f.slots.topic === "discipline" && f.tags.suspended && f.players[0] && f.teams[0])
      .map((f) => ({ key: f.players[0], team: f.teams[0], player: f.players[0] })),
    step: (c, a) => (daysBetween(a.opened, c.date) >= 7 && a.phase === "open" ? { phase: "fallout" } : daysBetween(a.opened, c.date) >= 30 ? { end: "served" } : undefined),
  },
  {
    kind: "stadium", value: 50, max: 6, days: 900,
    open: (c) => c.facts.filter((f) => f.family === "wire" && f.slots.topic === "stadiums" && f.teams[0] && !f.tags.opens && !f.tags.fail).map((f) => ({ key: f.teams[0], team: f.teams[0] })),
    step: (c, a) => {
      for (const f of factsOf(c, "stadiums", a.team)) {
        if (f.tags.opens) return { end: "opened" };
        if (f.tags.fail) return { end: "stalled" };
        if (f.tags.vote || /approve/i.test(String(f.slots.text))) return a.phase === "approved" ? undefined : { phase: "approved" };
      }
      return undefined;
    },
  },
  {
    kind: "relocation", value: 70, max: 3, days: 150,
    open: (c) => c.facts.filter((f) => f.family === "wire" && f.slots.topic === "relocation" && f.tags.apply && f.teams[0]).map((f) => ({ key: f.teams[0], team: f.teams[0] })),
    step: (c, a) => {
      for (const f of factsOf(c, "relocation", a.team)) {
        if (f.tags.withdraw) return { end: "withdrawn" };
        if (/reject/i.test(String(f.slots.text))) return { end: "rejected" };
        if (/approve/i.test(String(f.slots.text))) return { end: "approved" };
      }
      return undefined;
    },
  },
  {
    kind: "sale", value: 55, max: 3, days: 365,
    open: (c) => c.facts.filter((f) => f.family === "wire" && f.slots.topic === "ownership" && /exploring a sale|for sale|sell the/i.test(String(f.slots.text)) && f.teams[0]).map((f) => ({ key: f.teams[0], team: f.teams[0] })),
    step: (c, a) => (factsOf(c, "ownership", a.team).some((f) => /sold|approve|completes|buys/i.test(String(f.slots.text))) ? { end: "sold" } : undefined),
  },
  {
    kind: "labor", value: 70, max: 1, days: 500,
    open: (c) => (c.facts.some((f) => f.family === "wire" && f.slots.topic === "labor" && f.tags.lockout) ? [{ key: "league", team: c.us }] : []),
    step: (c) => (c.facts.some((f) => f.family === "wire" && f.slots.topic === "labor" && f.tags.deal) ? { end: "deal" } : undefined),
  },
  {
    kind: "winStreak", value: 50, max: 4, days: 120,
    open: (c) => (c.inSeason ? ids(c).filter((t) => streak(c.table[t]).w === 5).map((t) => ({ key: t, team: t })) : []),
    step: (c, a) => {
      const w = streak(c.table[a.team]).w;
      if (w === 0) return { end: "snapped" };
      if (w >= 10 && a.phase !== "historic") return { phase: "historic" };
      if (w >= 7 && a.phase === "open") return { phase: "rolling" };
      return seasonOver(c) ? { end: "seasonEnd" } : undefined;
    },
  },
  {
    kind: "losingStreak", value: 45, max: 4, days: 120,
    open: (c) => (c.inSeason ? ids(c).filter((t) => streak(c.table[t]).l === 5).map((t) => ({ key: t, team: t })) : []),
    step: (c, a) => {
      const l = streak(c.table[a.team]).l;
      if (l === 0) return { end: "snapped" };
      if (l >= 8 && a.phase === "open") return { phase: "freefall" };
      return seasonOver(c) ? { end: "seasonEnd" } : undefined;
    },
  },
  {
    kind: "unbeaten", value: 65, max: 3, days: 150,
    open: (c) => (c.inSeason ? ids(c).filter((t) => c.table[t].w === 6 && c.table[t].l === 0 && c.table[t].t === 0).map((t) => ({ key: t, team: t })) : []),
    step: (c, a) => (c.table[a.team].l > 0 ? { end: "firstLoss" } : seasonOver(c) ? { end: "perfect" } : c.table[a.team].w >= 11 && a.phase === "open" ? { phase: "chase" } : undefined),
  },
  {
    kind: "winless", value: 45, max: 3, days: 150,
    open: (c) => (c.inSeason ? ids(c).filter((t) => c.table[t].l === 6 && c.table[t].w === 0).map((t) => ({ key: t, team: t })) : []),
    step: (c, a) => (c.table[a.team].w > 0 ? { end: "firstWin" } : seasonOver(c) ? { end: "winlessSeason" } : undefined),
  },
  {
    kind: "rookie", value: 45, max: 3, days: 150,
    open: (c) => (c.inSeason && c.wd === "Tuesday" && c.week >= 5 ? risers(c, true) : []),
    step: (c, a) => (c.wd === "Tuesday" && c.week >= 12 && a.phase === "open" ? { phase: "award" } : seasonOver(c) ? { end: "seasonEnd" } : undefined),
  },
  {
    kind: "breakout", value: 45, max: 2, days: 150,
    open: (c) => (c.inSeason && c.wd === "Tuesday" && c.week >= 6 ? risers(c, false) : []),
    step: (c, a) => (seasonOver(c) ? { end: "seasonEnd" } : c.state.players[a.player!]?.injury?.seasonEnding ? { end: "hurt" } : undefined),
  },
  {
    kind: "comeback", value: 50, max: 5, days: 240,
    open: (c) => ids(c).flatMap((t) => teamPlayerIds(c.state, t).filter((id) => {
      const inj = c.state.players[id].injury;
      return inj && inj.date === c.date && !inj.seasonEnding && daysBetween(inj.date, inj.returnDate) >= 42 && marketView(c.state, id) >= 86;
    }).map((id) => ({ key: id, team: t, player: id, data: { due: c.state.players[id].injury!.returnDate } }))),
    step: (c, a) => {
      const inj = c.state.players[a.player!]?.injury;
      if (!inj) return { end: "returned" };
      if (inj.seasonEnding || inj.returnDate > String(a.data?.due ?? "")) return a.phase === "setback" ? (inj.seasonEnding ? { end: "lost" } : undefined) : { phase: "setback" };
      return undefined;
    },
  },
  {
    kind: "injuries", value: 40, max: 3, days: 120,
    open: (c) => (c.inSeason && c.wd === "Tuesday" ? ids(c).filter((t) => teamPlayerIds(c.state, t).filter((id) => c.state.players[id].injury && marketView(c.state, id) >= 80).length >= 5).map((t) => ({ key: t, team: t })) : []),
    step: (c, a) => {
      if (c.wd !== "Tuesday") return undefined;
      const n = teamPlayerIds(c.state, a.team).filter((id) => c.state.players[id].injury && marketView(c.state, id) >= 80).length;
      return n <= 2 ? { end: "healthy" } : seasonOver(c) ? { end: "seasonEnd" } : undefined;
    },
  },
  {
    kind: "search", value: 55, max: 10, days: 120,
    open: (c) => openSearches(c.state).filter((s) => s.role === "HC").map((s) => ({ key: s.team, team: s.team, data: { prev: s.previous ?? "" } })),
    step: (c, a) => {
      const s = openSearches(c.state, a.team).find((x) => x.role === "HC");
      if (!s) return hcId(a.team) && hcId(a.team) !== a.data?.prev ? ({ end: "hired", coach: hcId(a.team) }) : { end: "hired" };
      if (s.agreed && a.phase !== "finalist") return { phase: "finalist", coach: s.agreed.id };
      return Object.keys(s.interviews).length >= 3 && a.phase === "open" ? { phase: "interviews" } : undefined;
    },
  },
  {
    kind: "faChase", value: 55, max: 4, days: 120,
    open: (c) => (c.date === addDays(K().newLeagueYear, 1) ? Object.keys(c.state.players).filter((id) => c.state.players[id].status === "fa" && PLAYER_BY_ID[id] && marketView(c.state, id) >= 88)
      .sort((a, b) => marketView(c.state, b) - marketView(c.state, a)).slice(0, 4).map((id) => ({ key: id, team: c.state.players[id].team ?? PLAYER_BY_ID[id].team ?? "", player: id })) : []),
    step: (c, a) => {
      const s = signedSince(c.state, a.player!, a.opened);
      return s ? ({ end: s.team === a.team ? "returns" : "signs", other: s.team }) : undefined;
    },
  },
  {
    kind: "capCrunch", value: 40, max: 4, days: 60,
    open: (c) => (c.wd === "Tuesday" && c.date > K().superBowl && c.date < K().newLeagueYear
      ? ids(c).filter((t) => capSummary(c.state, t, RULES.season + 1).space < 0).map((t) => ({ key: t, team: t })) : []),
    step: (c, a) => (c.wd === "Tuesday" && capSummary(c.state, a.team, c.date >= K().newLeagueYear ? RULES.season : RULES.season + 1).space >= 0 ? { end: "cleared" } : c.date >= addDays(K().newLeagueYear, 3) ? { end: "deadline" } : undefined),
  },
  {
    kind: "topPick", value: 40, max: 3, days: 60,
    open: (c) => (c.inSeason && c.wd === "Tuesday" && c.week >= 13 ? ids(c).filter((t) => c.table[t].w <= 2).map((t) => ({ key: t, team: t })) : []),
    step: (c, a) => {
      if (!seasonOver(c)) return undefined;
      const worst = ids(c).sort((x, y) => c.table[x].w + c.table[x].t / 2 - (c.table[y].w + c.table[y].t / 2))[0];
      return { end: worst === a.team ? "first" : "passed" };
    },
  },
  {
    kind: "division", value: 50, max: 4, days: 60,
    open: (c) => {
      if (!c.inSeason || c.wd !== "Tuesday" || c.week < 12) return [];
      const out: Opening[] = [];
      const divs = new Map<string, string[]>();
      for (const t of TEAMS) divs.set(`${t.conference} ${t.division}`, [...(divs.get(`${t.conference} ${t.division}`) ?? []), t.id]);
      for (const teams of divs.values()) {
        const [a, b] = [...teams].sort((x, y) => c.table[y].w - c.table[x].w);
        if (c.table[a].w - c.table[b].w <= 1 && c.table[a].w >= 6) out.push({ key: [a, b].sort().join("-"), team: a, other: b });
      }
      return out;
    },
    step: (c, a) => (seasonOver(c) ? { end: c.table[a.team].w >= c.table[a.other!].w ? "won" : "lost" } : undefined),
  },
  {
    kind: "lastRide", value: 45, max: 3, days: 260,
    open: (c) => (c.inSeason && c.wd === "Tuesday" && c.week === 3 ? ids(c).flatMap((t) => teamPlayerIds(c.state, t)
      .filter((id) => PLAYER_BY_ID[id] && (ageOn(PLAYER_BY_ID[id].birthDate, c.date) ?? 0) >= 36 && marketView(c.state, id) >= 82).map((id) => ({ key: id, team: t, player: id }))).slice(0, 3) : []),
    step: (c, a) => (c.state.players[a.player!]?.status === "retired" ? { end: "retires" } : c.date >= K().regularSeasonEnd && a.phase === "open" ? { phase: "decision" } : undefined),
  },
  {
    kind: "feud", value: 45, max: 1, days: 240,
    open: (c) => (c.date.endsWith("-01") && (c.state.culture?.cooperation ?? 60) < 38 ? [{ key: c.us, team: c.us, data: { hc: hcId(c.us) ?? "" } }] : []),
    step: (c, a) => (hcId(a.team) !== a.data?.hc ? { end: "split" } : c.date.endsWith("-01") && culture(c.state).cooperation >= 50 ? { end: "mended" } : undefined),
  },
  // Opened and closed by other systems: our club's preseason questions, and the owner's public promises.
  { kind: "question", value: 45, max: 6, days: 400 },
  { kind: "promise", value: 50, max: 8, days: 400 },
];

const BY_KIND = Object.fromEntries(ARCS.map((d) => [d.kind, d]));

export function arcState(state: GameState): ArcState {
  return (mediaState(state).arcs ??= { list: [], next: 1 });
}

/** One step of an arc in print: its opening, a new phase or its ending. */
function beatFact(state: GameState, a: Arc, beat: string, ending: boolean, table: Record<string, Record_>): Fact {
  const def = BY_KIND[a.kind];
  const ours = a.team === state.userTeam || a.other === state.userTeam;
  const star = !!a.player && PLAYER_BY_ID[a.player] && marketView(state, a.player) >= 86;
  const coach = a.coach ? staff(state).people[a.coach] : undefined;
  // Before anyone has played, a record says nothing.
  const club = (t: string) => {
    const sl = teamSlots(state, t, table);
    return sl.w || sl.l || table[t]?.t ? sl : { ...sl, rec: "" };
  };
  return {
    id: `arc:${a.id}:${a.beats.length}`, type: `arc.${a.kind}`, family: "arc", kind: ours ? "preview" : "trend",
    teams: [a.team, ...(a.other ? [a.other] : [])].filter((t) => TEAM_BY_ID[t]), players: a.player ? [a.player] : [],
    value: Math.min(95, def.value + (ours ? 20 : 0) + (star ? 10 : 0) + (ending ? 5 : 0)), ours,
    tags: { [beat]: true, beat, ending, opening: beat === "open", ours, star },
    slots: {
      T: TEAM_BY_ID[a.team] ? club(a.team) : undefined, X: a.other && TEAM_BY_ID[a.other] ? club(a.other) : undefined,
      P: a.player && PLAYER_BY_ID[a.player] ? playerSlots(state, a.player) : undefined, C: coach ? { name: coach.name } : undefined,
      W: a.data?.was && PLAYER_BY_ID[String(a.data.was)] ? playerSlots(state, String(a.data.was)) : undefined,
      days: daysBetween(a.opened, state.date), n: a.beats.length + 1, title: a.title ?? "", text: String(a.data?.text ?? ""),
    },
  };
}

/** Starts an arc another system knows about (a preseason question, a promise). */
export function openArc(state: GameState, kind: string, o: Opening & { title?: string }): Arc | undefined {
  const s = arcState(state);
  if (s.list.some((a) => a.kind === kind && a.key === o.key && !a.ending)) return undefined;
  const a: Arc = { id: `arc${s.next++}`, kind, key: o.key, team: o.team, player: o.player, coach: o.coach, other: o.other, data: o.data, title: o.title, opened: state.date, phase: "open", beats: [] };
  s.list.unshift(a);
  return a;
}

/** Ends an arc from outside (the season answered the question, the promise was kept or broken). */
export function endArc(state: GameState, kind: string, key: string, ending: string): void {
  const a = arcState(state).list.find((x) => x.kind === kind && x.key === key && !x.ending);
  if (!a) return;
  a.ending = ending;
  a.ended = state.date;
  (arcState(state).pending ??= []).push({ id: a.id, beat: ending, ending: true });
}

/** Opens, moves and ends the league's storylines, and writes each step. */
export function arcsDaily(state: GameState, facts: Fact[]): Fact[] {
  const s = arcState(state);
  const date = state.date;
  const table = standings(state);
  const start = K().regularSeasonStart;
  const inSeason = date >= start && date <= K().regularSeasonEnd;
  const c: Ctx = { state, date, us: state.userTeam, wd: weekday(date), table, facts, inSeason, week: inSeason ? Math.floor(daysBetween(start, date) / 7) + 1 : 0 };
  const beats: [Arc, string, boolean][] = [];
  for (const p of s.pending ?? []) {
    const a = s.list.find((x) => x.id === p.id);
    if (a) beats.push([a, p.beat, p.ending]);
  }
  s.pending = [];
  for (const a of s.list.filter((x) => !x.ending)) {
    const def = BY_KIND[a.kind];
    if (!def) continue;
    if (a.beats.length === 0 && !beats.some(([b]) => b === a)) beats.push([a, "open", false]);
    let step = def.step?.(c, a);
    if (!step && daysBetween(a.opened, date) > def.days) step = { end: "fade" };
    if (!step) continue;
    if (step.other) a.other = step.other;
    if (step.coach) a.coach = step.coach;
    if (step.end) {
      a.ending = step.end;
      a.ended = date;
      beats.push([a, step.end, true]);
    } else if (step.phase && step.phase !== a.phase) {
      a.phase = step.phase;
      beats.push([a, step.phase, false]);
    }
  }
  for (const def of ARCS) {
    if (!def.open) continue;
    let room = def.max - s.list.filter((a) => a.kind === def.kind && !a.ending).length;
    for (const o of def.open(c)) {
      if (room <= 0) break;
      // A storyline doesn't restart the day after it ended.
      if (s.list.some((a) => a.kind === def.kind && a.key === o.key && (!a.ending || daysBetween(a.ended!, date) < 30))) continue;
      const a = openArc(state, def.kind, o);
      if (!a) continue;
      room--;
      beats.push([a, "open", false]);
    }
  }
  const facts2: Fact[] = [];
  for (const [a, beat, ending] of beats) {
    facts2.push(beatFact(state, a, beat, ending, table));
    a.beats.push({ date, beat });
  }
  if (facts2.length) fileFacts(state, facts2, 10);
  // Ended storylines stay on the tracker for a season.
  s.list = s.list.filter((a) => !a.ending || daysBetween(a.ended!, date) <= 365).slice(0, 200);
  return facts2;
}

export function openArcs(state: GameState): Arc[] {
  return arcState(state).list.filter((a) => !a.ending);
}

/** What the tracker calls each kind of storyline. */
export const ARC_LABEL: Record<string, string> = {
  hotSeat: "Hot seat", qbSwitch: "Quarterback change", holdout: "Holdout", contractYear: "Contract year", tradeRequest: "Trade request",
  scandal: "Suspension", stadium: "Stadium fight", relocation: "Relocation", sale: "Club sale", labor: "Labor talks",
  winStreak: "Win streak", losingStreak: "Losing streak", unbeaten: "Unbeaten run", winless: "Winless run",
  rookie: "Rookie emergence", breakout: "Breakout season", comeback: "Comeback", injuries: "Injury pileup",
  search: "Coaching search", faChase: "Free-agent chase", capCrunch: "Cap crunch", topPick: "Race for the top pick",
  division: "Division race", lastRide: "Last ride", feud: "Coach and GM at odds", question: "Our preseason question", promise: "The owner's promise",
};

/** A phase or ending in plain words for the tracker. */
export function arcStage(beat: string): string {
  const words: Record<string, string> = { open: "Underway", fade: "Faded away", hurt: "Hurt again", mended: "Patched up", unanswered: "Not answered", deal: "Deal done" };
  return words[beat] ?? beat.charAt(0).toUpperCase() + beat.slice(1);
}

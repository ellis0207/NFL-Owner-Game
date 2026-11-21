// The question desk: picks what reporters ask the owner and other clubs'
// players, coaches and owners from the bank in content/questions.ts, fills it
// from what is going on (our club, its stars and rookies, the division rival,
// the next opponent, the owner's own life, and the league: the best team, the
// MVP race, the latest trade, big signing and firing, last year's champion),
// and remembers what was asked. A line asked lately waits its turn, and the
// exact wording of the last few thousand questions is never repeated, so a long
// save rarely hears the same question twice. Other clubs' people answer in the
// "qa" family of the story engine.
import { teamPlayerIds } from "../cap";
import { personality } from "../clubhouse";
import { daysBetween } from "../dates";
import { money } from "../inbox";
import { PLAYER_BY_ID, RULES, SCHEDULE, TEAM_BY_ID, TEAMS } from "../league";
import { marketView } from "../market";
import { mediaState } from "../outlets";
import type { Rng } from "../rng";
import { teamStaff } from "../staff";
import { matchup, standings, type Record_ } from "../standings";
import { seasonTotals } from "../stats";
import type { GameState, OwnerTone, QuestionMemory } from "../types";
import { ANSWER, ASK } from "./content/ownerdesk";
import { OWNER_A, OWNER_Q } from "./content/questions";
import { SPEAKER_A, SPEAKER_ABOUT, SPEAKER_Q, SPEAKER_SAID } from "./content/interviews";
import { playerSlots, seasonLine, teamSlots, type Fact } from "./facts";
import { render, type Slots } from "./grammar";

/** Every way the owner can answer: the first four are the press desk's originals, in their old order. */
export const ALL_TONES: OwnerTone[] = ["candid", "confident", "deflect", "defiant", "gracious", "playful"];
/** Exact wordings remembered so they are never asked again. */
const SEEN_CAP = 3000;

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

export function questionMemory(state: GameState): QuestionMemory {
  const m = mediaState(state);
  return (m.qmem ??= { used: {}, seen: [] });
}

/** A short fingerprint of a question's wording, case and punctuation aside. */
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * One line from a list, the least recently used ones first, rendered with the
 * slots. With `track`, the exact wording is checked against everything asked
 * before and remembered ("cpu" for questions to other clubs' people).
 */
export function pickLine(state: GameState, rng: Rng, key: string, lines: readonly string[], slots: Slots, track: boolean | "cpu" = true): string {
  if (!lines.length) return "";
  const mem = questionMemory(state);
  const age = (i: number) => {
    const d = mem.used[`${key}#${i}`];
    return d ? daysBetween(d, state.date) : 1e6;
  };
  // Unused lines first, then the longest-rested; a little chance among those rested nearly as long.
  const jitter = lines.map(() => rng());
  const order = lines.map((_, i) => i).sort((a, b) => age(b) - age(a) || jitter[a] - jitter[b]);
  const top = order.filter((i) => age(i) >= 0.8 * age(order[0]));
  // The owner's questions and other clubs' are remembered apart, so a busy league doesn't push ours out.
  const list = track === "cpu" ? (mem.cseen ??= []) : mem.seen;
  const seen = new Set(track ? list : []);
  // The rested lines in a random order, then the rest oldest first; a few wordings of each until one is new.
  const first = [...top].sort(() => rng() - 0.5);
  const attempts = [...first, ...order.filter((i) => !top.includes(i))];
  let text = "";
  let chosen = attempts[0];
  let tries = 0;
  search: for (const i of attempts) {
    for (let k = 0; k < 3; k++) {
      const t = render(lines[i], slots, { rng, banks: {}, tone: "straight" });
      if (!text) { text = t; chosen = i; }
      if (!track || !seen.has(hashOf(t))) { text = t; chosen = i; break search; }
      if (++tries >= 40) break search;
    }
  }
  mem.used[`${key}#${chosen}`] = state.date;
  if (track) {
    list.push(hashOf(text));
    if (list.length > SEEN_CAP) list.splice(0, list.length - SEEN_CAP);
  }
  return text;
}

/** Drops memories older than four years, so the record stays small in a long save. */
export function pruneQuestionMemory(state: GameState): void {
  const mem = state.media?.qmem;
  if (!mem) return;
  for (const [k, d] of Object.entries(mem.used)) if (daysBetween(d, state.date) > 4 * 365) delete mem.used[k];
}

// ---- What there is to ask about ----

const pct = (r: Record_ | undefined) => (r && r.w + r.l + r.t ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0);
const gamesOf = (r: Record_ | undefined) => (r ? r.w + r.l + r.t : 0);
const sameDivision = (a: string, b: string) => TEAM_BY_ID[a].conference === TEAM_BY_ID[b].conference && TEAM_BY_ID[a].division === TEAM_BY_ID[b].division;
const recent = (date: string, today: string, days: number) => date <= today && daysBetween(date, today) <= days;

function nextOpponent(state: GameState, team: string): string | undefined {
  if (state.date < RULES.keyDates.regularSeasonStart || state.date > RULES.keyDates.regularSeasonEnd) return undefined;
  for (const g of SCHEDULE) {
    if (g.date <= state.date || g.type === "PRE") continue;
    const m = matchup(state, g);
    if (m && (m.home === team || m.away === team)) return m.home === team ? m.away : m.home;
  }
  return undefined;
}

/** A team's best players by the league's read, real players only. */
function stars(state: GameState, team: string, n: number, filter: (id: string) => boolean = () => true): string[] {
  return teamPlayerIds(state, team).filter((id) => PLAYER_BY_ID[id] && filter(id))
    .map((id) => [id, marketView(state, id)] as const).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
}

/** The league around a club, as slots: standings, the MVP race and the latest news elsewhere. */
export function leagueSlots(state: GameState, us: string): Slots {
  const table = standings(state);
  const today = state.date;
  const ranked = TEAMS.map((t) => t.id).filter((t) => gamesOf(table[t]) >= 3).sort((a, b) => pct(table[b]) - pct(table[a]));
  const L: Slots = {};
  if (ranked.length >= 16) {
    const best = ranked.find((t) => t !== us);
    const worst = [...ranked].reverse().find((t) => t !== us);
    if (best) { L.best = TEAM_BY_ID[best].name; L.bestRec = `${table[best].w}-${table[best].l}${table[best].t ? `-${table[best].t}` : ""}`; }
    if (worst) L.worst = TEAM_BY_ID[worst].name;
    // The MVP race: the season's most productive player elsewhere, after a few weeks.
    let top: [string, number] | undefined;
    for (const [id, row] of Object.entries(seasonTotals(state, "REG"))) {
      const l = row.line;
      if (!PLAYER_BY_ID[id] || (l.g ?? 0) < 4 || state.players[id]?.team === us) continue;
      const v = (l.passYds ?? 0) / 25 + (l.passTd ?? 0) * 4 - (l.int ?? 0) * 2 + (l.rushYds ?? 0) / 10 + (l.rushTd ?? 0) * 6 + (l.recYds ?? 0) / 12 + (l.recTd ?? 0) * 5 + (l.sacks ?? 0) * 5;
      if (!top || v > top[1]) top = [id, v];
    }
    if (top) {
      const team = state.players[top[0]]?.team;
      L.mvp = { name: PLAYER_BY_ID[top[0]].name, team: team ? TEAM_BY_ID[team]?.name ?? "" : "", line: seasonLine(state, top[0]) };
    }
  }
  const champ = state.champion ?? state.history?.seasons[state.history.seasons.length - 1]?.champion;
  if (champ && TEAM_BY_ID[champ]) L.champ = TEAM_BY_ID[champ].name;
  // The latest trade elsewhere with a real player in it.
  const trade = (state.trades?.log ?? []).filter((t) => t.status !== "voided" && !t.teams.includes(us) && recent(t.date, today, 21))
    .flatMap((t) => [0, 1].flatMap((side) => t.send[side].flatMap((a) => (a.kind === "player" && PLAYER_BY_ID[a.id] ? [{ id: a.id, from: t.teams[side], to: t.teams[1 - side] }] : []))))
    .sort((a, b) => marketView(state, b.id) - marketView(state, a.id))[0];
  if (trade) L.trade = { player: PLAYER_BY_ID[trade.id].name, from: TEAM_BY_ID[trade.from].name, to: TEAM_BY_ID[trade.to].name };
  const deal = state.signings.filter((s) => s.team !== us && recent(s.date, today, 21) && PLAYER_BY_ID[s.player] && s.apy >= 15_000_000 && s.kind !== "tender")
    .sort((a, b) => b.apy - a.apy)[0];
  if (deal) L.deal = { player: PLAYER_BY_ID[deal.player].name, team: TEAM_BY_ID[deal.team].name, money: `${money(deal.total)} over ${deal.years} years` };
  const firing = (state.staff?.searches ?? []).find((s) => s.role === "HC" && s.reason === "fired" && s.team !== us && recent(s.opened, today, 45) && s.previous);
  const firedName = firing?.previous ? state.staff?.people[firing.previous]?.name : undefined;
  if (firing && firedName) L.fired = { name: firedName, team: TEAM_BY_ID[firing.team].name };
  return L;
}

/** Everything a question to our owner can name. */
export function ownerSlots(state: GameState): Slots {
  const us = state.userTeam;
  const table = standings(state);
  const staff = teamStaff(us);
  const [star] = stars(state, us, 1);
  const [rookie] = stars(state, us, 1, (id) => (state.players[id]?.exp ?? 1) === 0);
  const rival = TEAMS.map((t) => t.id).filter((t) => t !== us && sameDivision(t, us)).sort((a, b) => pct(table[b]) - pct(table[a]))[0];
  const next = nextOpponent(state, us);
  const born = state.succession?.born;
  const heir = state.succession?.heirs?.[0];
  return {
    T: teamSlots(state, us, table),
    C: { name: staff.HC?.name ?? "the head coach" },
    G: { name: staff.GM?.name ?? "the general manager" },
    S: star ? playerSlots(state, star) : undefined,
    R: rookie ? playerSlots(state, rookie) : undefined,
    X: rival ? teamSlots(state, rival, table) : undefined,
    N: next ? teamSlots(state, next, table) : undefined,
    L: leagueSlots(state, us),
    me: { age: born ? Number(state.date.slice(0, 4)) - born : 0, heir: heir?.name ?? "", heirRel: heir?.relation ?? "", season: RULES.season },
  };
}

const has = (slots: Slots, path: string): boolean => {
  let cur: unknown = slots;
  for (const p of path.split(".")) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
  return cur !== undefined && cur !== null && cur !== "" && cur !== 0;
};

/** What each bank topic needs before it can be asked. */
const NEEDS: Record<string, string> = {
  "t.star": "S", "t.rookie": "R", "t.rival": "X.rec", "t.nextOpp": "N", "t.standing": "T.rec",
  "l.trade": "L.trade", "l.deal": "L.deal", "l.best": "L.best", "l.mvp": "L.mvp.line", "l.champ": "L.champ", "l.fired": "L.fired",
  "pl.teammate": "M", "pl.rival": "X", "pl.mvp": "L.mvp.line", "pl.trade": "L.trade", "pl.champ": "L.champ", "pl.season": "T.rec", "pl.college": "P.college",
  "co.team": "T.rec", "co.league": "L.fired", "ow.direction": "T.rec",
};
/** News elsewhere is asked about more while it's fresh. */
const HOT: Record<string, number> = { "l.trade": 3, "l.deal": 2.5, "l.fired": 3, "l.mvp": 1.5, "l.best": 1.3, "t.nextOpp": 1.5, "t.standing": 1.4, "pl.trade": 2, "pl.mvp": 1.5 };

export function topicGroup(topic: string): "team" | "personal" | "league" | undefined {
  return topic.startsWith("t.") ? "team" : topic.startsWith("p.") ? "personal" : topic.startsWith("l.") ? "league" : undefined;
}

/** A topic still has a line nobody has heard in the last eight months. */
function freshIn(state: GameState, topic: string): boolean {
  const mem = questionMemory(state);
  const n = (OWNER_Q[topic]?.length ?? 0) + (ASK[topic]?.length ?? 0);
  for (let i = 0; i < n; i++) {
    const d = mem.used[`o:${topic}#${i}`];
    if (!d || daysBetween(d, state.date) > 240) return true;
  }
  return false;
}

/**
 * Topics for questions beyond the day's news, one group at a time in turn
 * (team, the owner's life, the league), the least recently asked first.
 */
export function fillerTopics(state: GameState, rng: Rng, n: number, slots: Slots = ownerSlots(state)): { topic: string; player?: string }[] {
  const mem = questionMemory(state);
  const fresh = (t: string) => freshIn(state, t);
  const groups: ("t." | "p." | "l.")[] = ["t.", "p.", "l."].sort(() => rng() - 0.5) as ("t." | "p." | "l.")[];
  const out: { topic: string; player?: string }[] = [];
  const taken = new Set<string>();
  for (let i = 0; out.length < n && i < n * 3; i++) {
    const g = groups[i % 3];
    const pool = Object.keys(OWNER_Q).filter((t) => t.startsWith(g) && !taken.has(t) && (!NEEDS[t] || has(slots, NEEDS[t])) && fresh(t));
    if (!pool.length) continue;
    const w = pool.map((t) => {
      const last = mem.used[`topic:${t}`];
      const rest = last ? Math.min(400, daysBetween(last, state.date)) : 400;
      return (HOT[t] ?? 1) * (1 + rest / 40);
    });
    let x = rng() * w.reduce((a, b) => a + b, 0);
    let k = 0;
    for (; k < pool.length - 1; k++) if ((x -= w[k]) <= 0) break;
    const topic = pool[k];
    taken.add(topic);
    mem.used[`topic:${topic}`] = state.date;
    const sid = topic === "t.star" ? (slots.S as Slots | undefined)?.id : topic === "t.rookie" ? (slots.R as Slots | undefined)?.id : undefined;
    out.push({ topic, player: typeof sid === "string" ? sid : undefined });
  }
  return out;
}

/** The question for a topic: the bank's lines and the press desk's own, least recently asked first. */
export function ownerQuestion(state: GameState, rng: Rng, topic: string, slots: Slots): string {
  const lines = [...(OWNER_Q[topic] ?? []), ...(ASK[topic] ?? [])];
  return pickLine(state, rng, `o:${topic}`, lines.length ? lines : ASK.plain, slots);
}

/** The lines the owner can answer a topic with in one tone, the most specific first. */
function answerLines(topic: string, tone: OwnerTone, player: boolean): readonly string[] {
  const group = topicGroup(topic);
  return ANSWER[topic]?.[tone] ?? OWNER_A[topic]?.[tone]
    ?? (player ? ANSWER.player?.[tone] ?? OWNER_A.player?.[tone] : undefined)
    ?? (group ? OWNER_A[group]?.[tone] : undefined)
    ?? ANSWER.general[tone] ?? OWNER_A.general[tone] ?? [];
}

/** One answer per tone, worded fresh each time. */
export function ownerAnswers(state: GameState, rng: Rng, topic: string, slots: Slots, tones: readonly OwnerTone[] = ALL_TONES): { tone: OwnerTone; text: string }[] {
  const player = has(slots, "P.name");
  return tones.map((tone) => ({ tone, text: pickLine(state, rng, `a:${topic}:${tone}`, answerLines(topic, tone, player), slots, false) }));
}

// ---- Other clubs' people ----

type Mood = keyof typeof SPEAKER_SAID;

/** How a player comes across with reporters, from his personality. */
function moodOf(id: string | undefined, rng: Rng): Mood {
  if (!id) return pick(rng, ["warm", "warm", "guarded", "fiery", "funny"] as Mood[]);
  const p = personality(id);
  if (p.presence > 0.62) return rng() < 0.5 ? "funny" : "fiery";
  if (p.presence < 0.38) return "guarded";
  return p.leadership > 0.58 ? "warm" : rng() < 0.6 ? "warm" : "guarded";
}

/**
 * Reporters' questions to other clubs' players, head coaches and owners, and
 * their answers, as facts for the story engine: one or two a day in season,
 * a few a week in the offseason.
 */
export function qaFacts(state: GameState, rng: Rng): Fact[] {
  const k = RULES.keyDates;
  const inSeason = state.date >= k.regularSeasonStart && state.date <= k.regularSeasonEnd;
  const n = inSeason ? (rng() < 0.35 ? 2 : 1) : rng() < 0.4 ? 1 : 0;
  const out: Fact[] = [];
  const table = standings(state);
  const teams = TEAMS.map((t) => t.id).filter((t) => t !== state.userTeam);
  const mem = questionMemory(state);
  for (let i = 0; i < n; i++) {
    const team = pick(rng, teams);
    const r = rng();
    const kind: "pl" | "co" | "ow" = r < 0.62 ? "pl" : r < 0.87 ? "co" : "ow";
    const T = teamSlots(state, team, table);
    const slots: Slots = { T, L: leagueSlots(state, team) };
    let speaker: string | undefined;
    if (kind === "pl") {
      const pool = stars(state, team, 8, (id) => !state.players[id].injury);
      if (!pool.length) continue;
      speaker = pick(rng, pool);
      slots.P = playerSlots(state, speaker);
      const mate = pool.filter((x) => x !== speaker)[0];
      if (mate) slots.M = { name: PLAYER_BY_ID[mate].name, pos: PLAYER_BY_ID[mate].position };
      const rival = teams.filter((t) => t !== team && sameDivision(t, team)).sort((a, b) => pct(table[b]) - pct(table[a]))[0] ?? (sameDivision(state.userTeam, team) ? state.userTeam : undefined);
      if (rival) slots.X = teamSlots(state, rival, table);
    } else if (kind === "co") {
      const hc = teamStaff(team).HC;
      if (!hc) continue;
      slots.K = { name: hc.name, role: "head coach" };
    } else {
      const owner = state.rivals?.clubs?.[team]?.owner;
      if (!owner) continue;
      slots.K = { name: owner, role: "owner" };
    }
    const pool = Object.keys(SPEAKER_Q).filter((t) => t.startsWith(`${kind}.`) && (!NEEDS[t] || has(slots, NEEDS[t])));
    const w = pool.map((t) => {
      const last = mem.used[`ctopic:${t}`];
      return (HOT[t] ?? 1) * (1 + (last ? Math.min(200, daysBetween(last, state.date)) : 200) / 20);
    });
    let x = rng() * w.reduce((a, b) => a + b, 0);
    let j = 0;
    for (; j < pool.length - 1; j++) if ((x -= w[j]) <= 0) break;
    const topic = pool[j];
    if (!topic) continue;
    mem.used[`ctopic:${topic}`] = state.date;
    const mood = moodOf(speaker, rng);
    const q = pickLine(state, rng, `c:${topic}`, SPEAKER_Q[topic], slots, "cpu");
    const a = pickLine(state, rng, `ca:${topic}`, (mood === "fiery" && SPEAKER_A[`${topic}.fiery`]) || SPEAKER_A[topic] || [], slots, false);
    if (!q || !a) continue;
    const short = a.split(/(?<=[.!?])\s/)[0].replace(/[.!]$/, "");
    const view = speaker ? marketView(state, speaker) : 0;
    out.push({
      id: `qa:${state.date}:${i}`, type: `qa.${kind}`, family: "qa", kind: "interview", teams: [team], players: speaker ? [speaker] : [],
      value: 28 + (view >= 86 ? 14 : 0) + (kind === "ow" ? 8 : 0), ours: false,
      tags: { [kind]: true, [mood]: true, [topic.split(".")[1]]: true },
      slots: {
        ...slots, Q: q, A: a, short: short.length > 70 ? `${short.slice(0, 67).replace(/\s+\S*$/, "")}...` : short,
        said: pick(rng, SPEAKER_SAID[mood]), about: render(SPEAKER_ABOUT[topic] ?? "the {T.nick}", slots, { rng, banks: {}, tone: "straight" }),
      },
    });
  }
  return out;
}

/** How many question lines the bank holds (before the choices inside each line). */
export function bankSize(): { owner: number; speaker: number } {
  return {
    owner: Object.values(OWNER_Q).reduce((a, l) => a + l.length, 0),
    speaker: Object.values(SPEAKER_Q).reduce((a, l) => a + l.length, 0),
  };
}


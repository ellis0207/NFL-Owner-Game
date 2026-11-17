// The owner's own dealings with the press: press conferences of three to six
// questions at the season opener, the end of the season, after a coaching
// change or a big signing, and when a storyline about the club heats up;
// one-on-one interviews, on or off the record; exclusives handed to one
// reporter; confirming, denying or ignoring a report; the owner's own Huddle
// account; op-eds; and a media access policy per reporter, up to banning one.
// The questions come from what is happening (the club's storylines and the
// occasion), so they cover anything, and the four ways to answer (candid,
// confident, deflect, defiant) move fans, the press, the locker room and the
// head coach by how much the question matters. Everything an answer does is
// hidden; the owner sees the coverage. The owner's credibility (`cred`) is
// engine-only: promises are checked against the record and denials against
// what the report turned out to be, and it scales how far words carry.
import { teamPlayerIds } from "../cap";
import { addDays, daysBetween, shortDate, weekday } from "../dates";
import { money, send } from "../inbox";
import { GAMES_BY_DATE, PLAYER_BY_ID, RULES, TEAM_BY_ID } from "../league";
import { changeMorale } from "../agents";
import { trustHit } from "../fans";
import { changeRel, mediaState, NATIONAL } from "../outlets";
import { rngFor, type Rng } from "../rng";
import { teamStaff } from "../staff";
import { standings } from "../standings";
import type { GameState, OwnerDesk, OwnerTone, Presser, PresserQuestion, Reporter, Rumor } from "../types";
import { ARC_LABEL, ARCS, openArcs } from "./arcs";
import { ANSWER, ASK, EXCLUSIVE, OPED, OWNER_POST, OWNER_REPLY } from "./content/ownerdesk";
import { corps, isLocal, outletOf, working } from "./corps";
import { fileFacts } from "./compose";
import { playerSlots, teamSlots, type Fact } from "./facts";
import { render, type Slots } from "./grammar";
import { fanAccounts, social } from "./social";

const K = () => RULES.keyDates;
const TONES: OwnerTone[] = ["candid", "confident", "deflect", "defiant"];
/** Days the owner has before a called press conference goes ahead without answers. */
const PRESSER_DAYS = 2;
const COOLDOWN = { interview: 10, exclusive: 21, oped: 45 };
const MAX_FAVORED = 3;

export function ownerDesk(state: GameState): OwnerDesk {
  return (mediaState(state).desk ??= {
    next: 1, pressers: [], access: {}, responses: [], cred: 60, claims: [], last: {}, opeds: [], exclusives: [], burns: [],
    hc: teamStaff(state.userTeam).HC?.id,
  });
}

// ---- Small effects ----

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
function fansP(state: GameState, d: number): void {
  state.pressure.fans = clamp(state.pressure.fans + d);
}
function pressP(state: GameState, d: number): void {
  state.pressure.media = clamp(state.pressure.media + d);
}
function coachFaith(state: GameState, d: number): void {
  const m = mediaState(state);
  m.coach = clamp(Math.round((m.coach + d) * 10) / 10);
}
function teamMorale(state: GameState, d: number): void {
  for (const id of teamPlayerIds(state, state.userTeam)) {
    const st = state.players[id]?.status;
    if (st === "active" || st === "camp" || st === "ir") changeMorale(state, id, d);
  }
}
function repRel(r: Reporter | undefined, d: number): void {
  if (r) r.rel = clamp(Math.round((r.rel + d) * 10) / 10, -50, 50);
}
function cred(state: GameState, d: number): void {
  const k = ownerDesk(state);
  k.cred = clamp(k.cred + d);
}
/** Words carry further from an owner people believe. */
const weight = (state: GameState) => ownerDesk(state).cred / 60;
const reporter = (state: GameState, id: string) => corps(state).people.find((p) => p.id === id);
const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

function moodNudge(state: GameState, d: number): void {
  const s = social(state);
  s.mood[state.userTeam] = clamp(Math.round(((s.mood[state.userTeam] ?? 50) + d) * 10) / 10);
}

// ---- Stories ----

function voice(r: Reporter): Slots {
  return { name: r.name, outlet: outletOf(r.outlet).name };
}

function ownerFact(state: GameState, kind: string, key: string, value: number, o: { tags?: Fact["tags"]; slots: Slots; players?: string[]; outlet?: string; reporter?: string; teams?: string[] }): Fact {
  const us = state.userTeam;
  return {
    id: `own:${kind}:${key}`, type: `owner.${kind}`, family: "owner", kind: "owner",
    teams: [us, ...(o.teams ?? []).filter((t) => t !== us && TEAM_BY_ID[t])], players: o.players ?? [], value, ours: true,
    tags: { ours: true, ...(o.tags ?? {}) },
    slots: { O: { name: state.ownerName, title: "owner" }, T: teamSlots(state, us, standings(state)), ...o.slots },
    outlet: o.outlet, reporter: o.reporter,
  };
}

function file(state: GameState, facts: Fact[]): void {
  if (facts.length) fileFacts(state, facts, 4);
}

// ---- Questions ----

interface Topic { topic: string; value: number; player?: string; arc?: string; title?: string; label?: string }

const COACH_TOPICS = new Set(["coachFuture", "hotSeat", "feud"]);
/** Topics where a confident answer is a promise about results, checked a month later. */
const RESULT_TOPICS = new Set(["opener", "record", "losingStreak", "winStreak", "endSeason", "division", "winless", "hotSeat", "coachFuture"]);

function played(state: GameState): number {
  const r = standings(state)[state.userTeam];
  return r ? r.w + r.l + r.t : 0;
}

/** What reporters want to ask about right now: the occasion first, then the club's storylines, then the season. */
function topicsFor(state: GameState, occasion: string, extra: Partial<Topic> = {}): Topic[] {
  const us = state.userTeam;
  const out: Topic[] = [];
  const add = (t: Topic) => {
    if (!out.some((x) => x.topic === t.topic && x.player === t.player)) out.push(t);
  };
  const first: Record<string, string[]> = {
    opener: ["opener"], endSeason: ["endSeason", "coachFuture"], firing: ["firing", "search"], hire: ["hire"], signing: ["signing"],
  };
  for (const t of first[occasion] ?? []) add({ topic: t, value: 22, ...(t === "signing" ? extra : {}) });
  const arcs = openArcs(state).filter((a) => a.team === us || a.other === us)
    .sort((a, b) => (b.beats[b.beats.length - 1]?.date ?? b.opened).localeCompare(a.beats[a.beats.length - 1]?.date ?? a.opened));
  for (const a of arcs) {
    const def = ARCS.find((d) => d.kind === a.kind);
    const topic = ASK[a.kind] ? a.kind : "plain";
    if ((topic === "holdout" || topic === "contractYear" || topic === "tradeRequest" || topic === "rookie" || topic === "breakout" || topic === "comeback" || topic === "lastRide" || topic === "faChase" || topic === "scandal") && !(a.player && PLAYER_BY_ID[a.player])) continue;
    add({ topic, value: clamp(Math.round(10 + (def?.value ?? 40) / 4), 10, 30), player: a.player && PLAYER_BY_ID[a.player] ? a.player : undefined, arc: a.id, title: a.title, label: (ARC_LABEL[a.kind] ?? a.kind).toLowerCase() });
  }
  if (played(state) >= 2) add({ topic: "record", value: 14 });
  if (played(state) >= 6 && (standings(state)[us]?.l ?? 0) > (standings(state)[us]?.w ?? 0)) add({ topic: "coachFuture", value: 18 });
  // The questions every owner gets when nothing bigger is going on.
  for (const t of ["money", "fans", "culture"]) add({ topic: t, value: 10 });
  return out;
}

function questionSlots(state: GameState, t: Topic): Slots {
  return {
    T: teamSlots(state, state.userTeam, standings(state)),
    P: t.player ? playerSlots(state, t.player) : undefined,
    C: { name: teamStaff(state.userTeam).HC?.name ?? "the head coach" },
    title: t.title ?? "", label: t.label ?? "",
  };
}

function makeQuestion(state: GameState, t: Topic, by: string, rng: Rng): PresserQuestion {
  const slots = questionSlots(state, t);
  const say = (tpl: string) => render(tpl, slots, { rng, banks: {}, tone: "straight" });
  const fallback = t.player ? ANSWER.player : ANSWER.general;
  const options = TONES.map((tone) => ({ tone, text: say(pick(rng, ANSWER[t.topic]?.[tone] ?? fallback[tone] ?? ANSWER.general[tone]!)) }));
  return { by, topic: t.topic, text: say(pick(rng, ASK[t.topic])), value: t.value, player: t.player, arc: t.arc, options };
}

/** Who gets a question in: favored reporters first, banned ones not at all, the better-disposed more often. */
function askers(state: GameState, n: number, rng: Rng): Reporter[] {
  const us = state.userTeam;
  const access = ownerDesk(state).access;
  const pool = working(state).filter((p) => access[p.id] !== "banned" &&
    ((p.team === us && isLocal(p.outlet)) || (!isLocal(p.outlet) && (p.role === "insider" || p.role === "reporter" || p.role === "columnist"))));
  const out: Reporter[] = [];
  const left = [...pool];
  while (out.length < n && left.length) {
    const w = left.map((p) => (access[p.id] === "favored" ? 4 : 1) * (p.team === us ? 2 : 1) * (1 + (p.rel + 50) / 100));
    let x = rng() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < left.length - 1; i++) if ((x -= w[i]) <= 0) break;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

const OCCASION: Record<string, { title: string; phrase: string; n: [number, number] }> = {
  opener: { title: "Season-opening press conference", phrase: "at the season-opening press conference", n: [4, 5] },
  endSeason: { title: "End-of-season press conference", phrase: "at the end-of-season press conference", n: [5, 6] },
  firing: { title: "Press conference on the coaching change", phrase: "after the coaching change", n: [4, 5] },
  hire: { title: "Introducing the new head coach", phrase: "at the new head coach's introduction", n: [4, 4] },
  signing: { title: "Introducing a new signing", phrase: "at the signing's introduction", n: [3, 3] },
  availability: { title: "Media availability", phrase: "at a midweek media availability", n: [3, 3] },
  interview: { title: "One-on-one interview", phrase: "in a one-on-one interview", n: [3, 3] },
  offrecord: { title: "Off-the-record conversation", phrase: "off the record", n: [3, 3] },
};

function callPresser(state: GameState, occasion: string, extra: Partial<Topic> = {}, rep?: Reporter): Presser | undefined {
  const k = ownerDesk(state);
  const rng = rngFor(state.seed, `presser:${state.date}:${occasion}`);
  const o = OCCASION[occasion];
  const n = o.n[0] + Math.floor(rng() * (o.n[1] - o.n[0] + 1));
  const topics = topicsFor(state, occasion, extra).slice(0, n);
  if (topics.length < 3) return undefined;
  const who = rep ? topics.map(() => rep) : askers(state, topics.length, rng);
  if (!who.length) return undefined;
  const p: Presser = {
    id: `pc${k.next++}`, kind: occasion === "interview" ? "interview" : occasion === "offrecord" ? "offrecord" : "presser",
    occasion, title: o.title, date: state.date, expires: addDays(state.date, PRESSER_DAYS), reporter: rep?.id,
    questions: topics.map((t, i) => makeQuestion(state, t, who[i % who.length].id, rng)),
  };
  k.pressers.unshift(p);
  k.pressers.length = Math.min(k.pressers.length, 30);
  if (p.kind === "presser") {
    k.last.presser = state.date;
    send(state, "media", "Communications", p.title,
      `The press is expecting you: ${p.questions.length} questions are lined up. Answer them in the Press room by ${shortDate(p.expires)}, or a spokesperson reads a statement and you take no questions.`);
  }
  return p;
}

export function openPressers(state: GameState): Presser[] {
  return (state.media?.desk?.pressers ?? []).filter((p) => !p.held);
}

/** What one answer does. Scaled by how much the question matters and how the setting carries it. */
function answerEffect(state: GameState, q: PresserQuestion, tone: OwnerTone, scale: number, claim: { made: boolean }): void {
  const s = (q.value / 20) * scale;
  const w = weight(state);
  const r = reporter(state, q.by);
  const coachy = COACH_TOPICS.has(q.topic);
  switch (tone) {
    case "candid":
      trustHit(state, 0.5 * s * w);
      pressP(state, 1.2 * s);
      repRel(r, 2);
      if (coachy) coachFaith(state, -3 * s);
      if (q.player) changeMorale(state, q.player, 1);
      break;
    case "confident":
      fansP(state, 1 * s * w);
      trustHit(state, 0.2 * s * w);
      if (coachy) coachFaith(state, 4 * s);
      if (q.player) changeMorale(state, q.player, 2 * s);
      if (["opener", "record", "winStreak", "losingStreak"].includes(q.topic)) teamMorale(state, 0.5 * s);
      if (!claim.made && RESULT_TOPICS.has(q.topic) && scale >= 0.5) {
        const rec = standings(state)[state.userTeam];
        ownerDesk(state).claims.push({ date: state.date, due: addDays(state.date, 28), w: rec?.w ?? 0, l: rec?.l ?? 0 });
        claim.made = true;
      }
      break;
    case "deflect":
      repRel(r, -1.5);
      pressP(state, -0.6 * s);
      break;
    case "defiant":
      teamMorale(state, 0.8 * s);
      fansP(state, 0.6 * s);
      pressP(state, -2 * s);
      repRel(r, -4);
      if (r && !isLocal(r.outlet)) changeRel(state, r.outlet, -1.5);
      break;
  }
}

const QUOTE_ORDER: OwnerTone[] = ["defiant", "confident", "candid", "deflect"];

/**
 * The owner answers a press conference or interview: one answer index per
 * question (-1 lets that one go with a non-answer). Returns an error or null.
 */
export function holdPresser(state: GameState, id: string, answers: number[]): string | null {
  const k = ownerDesk(state);
  const p = k.pressers.find((x) => x.id === id);
  if (!p || p.held) return "That's already over.";
  p.held = state.date;
  const claim = { made: false };
  const off = p.kind === "offrecord";
  const scale = p.kind === "presser" ? 1 : p.kind === "interview" ? 0.8 : 0.3;
  p.questions.forEach((q, i) => {
    const a = answers[i] ?? -1;
    q.answer = a >= 0 && a < q.options.length ? a : 2;
    answerEffect(state, q, q.options[q.answer].tone, scale, claim);
  });
  const rep = p.reporter ? reporter(state, p.reporter) : undefined;
  if (off) {
    // Talking off the record builds a reporter's sources and goodwill, and sometimes ends up in print anyway.
    if (rep) {
      rep.sources[state.userTeam] = clamp((rep.sources[state.userTeam] ?? 30) + 6);
      repRel(rep, 3);
      const frank = p.questions.filter((q) => q.options[q.answer!].tone === "candid" || q.options[q.answer!].tone === "defiant").length;
      const risk = clamp(0.08 - rep.rel / 600 + rep.heat * 0.05, 0.02, 0.25) * (1 + frank * 0.25);
      if (rngFor(state.seed, `burn:${p.id}`)() < risk) {
        const q = p.questions.find((x) => x.options[x.answer!].tone !== "deflect") ?? p.questions[0];
        (k.burns ??= []).push({ date: addDays(state.date, 3 + Math.floor(rngFor(state.seed, `burnday:${p.id}`)() * 10)), reporter: rep.id, quote: q.options[q.answer!].text });
      }
    }
    return null;
  }
  if (rep) repRel(rep, 3);
  file(state, [presserFact(state, p, rep)]);
  return null;
}

function presserFact(state: GameState, p: Presser, rep?: Reporter): Fact {
  const byTone: Record<string, number> = {};
  for (const q of p.questions) {
    const t = q.options[q.answer ?? 2].tone;
    byTone[t] = (byTone[t] ?? 0) + q.value;
  }
  const top = p.skipped ? "skipped" : Object.entries(byTone).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "deflect";
  const quoted = p.skipped ? undefined : [...p.questions].sort((a, b) =>
    QUOTE_ORDER.indexOf(a.options[a.answer ?? 2].tone) - QUOTE_ORDER.indexOf(b.options[b.answer ?? 2].tone) || b.value - a.value)[0];
  const topics = [...new Set(p.questions.map((q) => q.player && PLAYER_BY_ID[q.player] ? PLAYER_BY_ID[q.player].name : q.topic === "plain" || q.topic === "question" || q.topic === "promise" ? "" : TOPIC_WORD[q.topic] ?? ""))].filter(Boolean).slice(0, 3);
  const value = Math.min(80, (p.kind === "presser" ? 40 : 35) + p.questions.reduce((a, q) => a + q.value, 0) / 6);
  return ownerFact(state, p.kind === "interview" ? "interview" : "presser", p.id, Math.round(value), {
    tags: { [top]: true, skipped: !!p.skipped, solo: p.kind === "interview" },
    players: [...new Set(p.questions.map((q) => q.player).filter((x): x is string => !!x))],
    outlet: rep?.outlet, reporter: rep?.id,
    slots: {
      R: rep ? voice(rep) : undefined, n: p.questions.length, occasion: OCCASION[p.occasion]?.phrase ?? "",
      quote: quoted ? quoted.options[quoted.answer ?? 2].text : "", topics: topics.length > 1 ? `${topics.slice(0, -1).join(", ")} and ${topics[topics.length - 1]}` : topics[0] ?? "",
    },
  });
}

const TOPIC_WORD: Record<string, string> = {
  opener: "expectations", endSeason: "the season", coachFuture: "the head coach's future", firing: "the firing", search: "the coaching search",
  hire: "the new coach", record: "the record", money: "spending", hotSeat: "the head coach's job", qbSwitch: "the quarterback",
  stadium: "the stadium", relocation: "the team's future in town", sale: "a possible sale", labor: "the labor talks", winStreak: "the winning streak",
  losingStreak: "the losing streak", unbeaten: "the unbeaten run", winless: "the winless start", injuries: "injuries", capCrunch: "the cap",
  topPick: "the draft order", division: "the division race", feud: "the front office",
};

// ---- Interviews, exclusives ----

function cooling(state: GameState, what: keyof typeof COOLDOWN): string | null {
  const last = ownerDesk(state).last[what];
  if (!last) return null;
  const ready = addDays(last, COOLDOWN[what]);
  return ready > state.date ? ready : null;
}

/** When the owner can next do each thing; null when it's open now. */
export function deskReady(state: GameState): Record<keyof typeof COOLDOWN, string | null> {
  return { interview: cooling(state, "interview"), exclusive: cooling(state, "exclusive"), oped: cooling(state, "oped") };
}

/** Reporters the owner could sit down with or favor: our local media and the national insiders and columnists. */
export function deskReporters(state: GameState): Reporter[] {
  const us = state.userTeam;
  return working(state).filter((p) => (p.team === us && isLocal(p.outlet)) || (!isLocal(p.outlet) && p.role !== "analyst"))
    .sort((a, b) => Number(b.team === us) - Number(a.team === us) || a.outlet.localeCompare(b.outlet) || a.name.localeCompare(b.name));
}

/** The owner asks for a one-on-one with a reporter, on or off the record; the questions come right away. */
export function requestInterview(state: GameState, reporterId: string, offRecord: boolean): Presser | string {
  const rep = reporter(state, reporterId);
  if (!rep || rep.retired !== undefined) return "That reporter isn't working.";
  if (ownerDesk(state).access[rep.id] === "banned") return "That reporter is banned from the building.";
  const wait = cooling(state, "interview");
  if (wait) return `Your next interview can be ${shortDate(wait)}.`;
  const p = callPresser(state, offRecord ? "offrecord" : "interview", {}, rep);
  if (!p) return "There isn't enough to talk about right now.";
  ownerDesk(state).last.interview = state.date;
  return p;
}

/** What the owner could hand a reporter first. */
export function exclusiveTopics(state: GameState): { id: string; label: string; player?: string }[] {
  const us = state.userTeam;
  const out: { id: string; label: string; player?: string }[] = [{ id: "plans", label: EXCLUSIVE.plans.label }];
  if (teamStaff(us).HC) out.push({ id: "coach", label: EXCLUSIVE.coach.label });
  const year = openArcs(state).find((a) => a.team === us && (a.kind === "contractYear" || a.kind === "holdout") && a.player && PLAYER_BY_ID[a.player]);
  if (year) out.push({ id: "extension", label: `${EXCLUSIVE.extension.label}: ${PLAYER_BY_ID[year.player!].name}`, player: year.player });
  if (openArcs(state).some((a) => a.team === us && (a.kind === "stadium" || a.kind === "relocation"))) out.push({ id: "stadium", label: EXCLUSIVE.stadium.label });
  const dl = K().tradeDeadline;
  if (dl && state.date < dl && daysBetween(state.date, dl) <= 21) out.push({ id: "deadline", label: EXCLUSIVE.deadline.label });
  return out;
}

/** The owner gives one reporter a story first: that reporter and outlet warm up; everyone else notices. */
export function giveExclusive(state: GameState, reporterId: string, topic: string): string | null {
  const rep = reporter(state, reporterId);
  const t = exclusiveTopics(state).find((x) => x.id === topic);
  if (!rep || rep.retired !== undefined) return "That reporter isn't working.";
  if (!t) return "That isn't something you can give out right now.";
  if (ownerDesk(state).access[rep.id] === "banned") return "That reporter is banned from the building.";
  const wait = cooling(state, "exclusive");
  if (wait) return `Your next exclusive can be ${shortDate(wait)}.`;
  const k = ownerDesk(state);
  const us = state.userTeam;
  k.last.exclusive = state.date;
  k.exclusives.unshift({ date: state.date, reporter: rep.id, topic });
  k.exclusives.length = Math.min(k.exclusives.length, 20);
  repRel(rep, 8);
  rep.sources[us] = clamp((rep.sources[us] ?? 30) + 10);
  changeRel(state, rep.outlet, 3);
  for (const o of NATIONAL) if (o.id !== rep.outlet) changeRel(state, o.id, -1);
  for (const p of working(state)) if (p.id !== rep.id && p.team === us && isLocal(p.outlet)) repRel(p, -2);
  if (topic === "coach") coachFaith(state, 3);
  if (t.player) changeMorale(state, t.player, 3);
  const slots: Slots = { R: voice(rep), P: t.player ? playerSlots(state, t.player) : undefined, C: teamStaff(us).HC ? { name: teamStaff(us).HC!.name } : undefined };
  const rng = rngFor(state.seed, `excl:${state.date}`);
  const line = render(pick(rng, EXCLUSIVE[topic].line), { ...slots, O: { name: state.ownerName }, T: teamSlots(state, us) }, { rng, banks: {}, tone: "straight" });
  file(state, [ownerFact(state, "exclusive", `${state.date}:${topic}`, 45, {
    tags: { exclusive: true, [topic]: true }, outlet: rep.outlet, reporter: rep.id, players: t.player ? [t.player] : [],
    slots: { ...slots, line },
  })]);
  return null;
}

// ---- Reports about us ----

/** Recent reports about our club the owner could still answer. */
export function reportsAboutUs(state: GameState): Rumor[] {
  const done = new Set(ownerDesk(state).responses.map((r) => r.rumor));
  const since = addDays(state.date, -10);
  return corps(state).rumors.filter((r) => r.team === state.userTeam && !r.outcome && r.date >= since && !done.has(r.id));
}

/** Confirm, deny or ignore a report. A denial puts the owner's word on the line until the report is judged. */
export function respondToReport(state: GameState, rumorId: string, how: "confirm" | "deny" | "ignore"): string | null {
  const r = reportsAboutUs(state).find((x) => x.id === rumorId);
  if (!r) return "That report can't be answered now.";
  const k = ownerDesk(state);
  k.responses.unshift({ rumor: r.id, how, date: state.date });
  k.responses.length = Math.min(k.responses.length, 60);
  const rep = reporter(state, r.reporter);
  if (how === "ignore") return null;
  repRel(rep, how === "confirm" ? 3 : -4);
  if (how === "deny") pressP(state, -0.5);
  if (rep) file(state, [ownerFact(state, "response", `${r.id}:${how}`, how === "deny" ? 45 : 40, {
    tags: { [how]: true }, players: r.player && PLAYER_BY_ID[r.player] ? [r.player] : [],
    slots: { R: voice(rep), head: r.headline ?? "the report" },
  })]);
  return null;
}

function judgeResponses(state: GameState, out: Fact[]): void {
  const k = ownerDesk(state);
  const rumors = new Map(corps(state).rumors.map((r) => [r.id, r]));
  for (const x of k.responses) {
    if (x.judged || x.how === "ignore") continue;
    const r = rumors.get(x.rumor);
    if (!r) { x.judged = true; continue; }
    if (!r.outcome) continue;
    x.judged = true;
    if (r.outcome === "quiet") continue;
    const hit = r.outcome === "hit";
    if (x.how === "deny" && hit) {
      cred(state, -8);
      trustHit(state, -1.5, 0, "The owner denied a report that turned out to be true");
      pressP(state, -3);
      const rep = reporter(state, r.reporter);
      if (rep) out.push(ownerFact(state, "response", `${r.id}:proved`, 50, { tags: { deny: true, proved: true }, slots: { R: voice(rep), head: r.headline ?? "the report" } }));
    } else if (x.how === "deny") {
      cred(state, 3);
      pressP(state, 1);
    } else cred(state, hit ? 2 : -3);
  }
}

// ---- The owner's Huddle account ----

function ourLastGame(state: GameState): { won: boolean; opp: string; score: string } | undefined {
  for (const d of [state.date, addDays(state.date, -1), addDays(state.date, -2)]) {
    for (const g of GAMES_BY_DATE[d] ?? []) {
      const r = state.results[g.id];
      if (!r || g.type === "PRE" || (r.home !== state.userTeam && r.away !== state.userTeam)) continue;
      const home = r.home === state.userTeam;
      const ours = home ? r.homeScore : r.awayScore, theirs = home ? r.awayScore : r.homeScore;
      return { won: ours > theirs, opp: home ? r.away : r.home, score: `${Math.max(ours, theirs)}-${Math.min(ours, theirs)}` };
    }
  }
  return undefined;
}

export function ownerHandle(state: GameState): string {
  return `@${state.ownerName.replace(/[^A-Za-z0-9]/g, "")}`;
}

/** The posts the owner could make today; empty once the owner has posted. */
export function ownerPostOptions(state: GameState): { key: string; label: string }[] {
  if (ownerDesk(state).last.post === state.date) return [];
  const g = ourLastGame(state);
  const keys = g ? (g.won ? ["celebrate", "jab", "thanks"] : ["accountability", "refs", "thanks"]) : ["thanks", "build"];
  return keys.map((key) => ({ key, label: OWNER_POST[key].label }));
}

/** The owner posts on the Huddle. Fans answer; the press notices the loud ones; the league notices shots at the officials. */
export function ownerPost(state: GameState, key: string): string | null {
  if (!ownerPostOptions(state).some((o) => o.key === key)) return "That post isn't available today.";
  const k = ownerDesk(state);
  const us = state.userTeam;
  const rng = rngFor(state.seed, `ownerpost:${state.date}`);
  const g = ourLastGame(state);
  const recent = !!k.last.post && daysBetween(k.last.post, state.date) <= 3;
  k.last.post = state.date;
  const slots: Slots = { T: teamSlots(state, us, standings(state)), X: g ? teamSlots(state, g.opp) : undefined, score: g?.score ?? "" };
  const text = render(pick(rng, OWNER_POST[key].text), slots, { rng, banks: {}, tone: "lively" });
  const s = social(state);
  s.posts.unshift({ id: s.next++, date: state.date, who: ownerHandle(state), text, kind: "owner", team: us, by: state.ownerName, topic: TEAM_BY_ID[us].name });
  // Posting every few days wears thin.
  const f = recent ? 0.5 : 1;
  const mood = s.mood[us] ?? 50;
  let effect = 0;
  const out: Fact[] = [];
  switch (key) {
    case "celebrate": effect = 1.5; break;
    case "thanks": effect = 1.2; trustHit(state, 0.3 * f); break;
    case "build": effect = mood < 40 ? -1 : 0.8; break;
    case "accountability": effect = 1; trustHit(state, 0.4 * f); break;
    case "jab":
      effect = 2.5; pressP(state, -0.5);
      out.push(ownerFact(state, "post", `${state.date}:jab`, 42, { tags: { jab: true }, teams: g ? [g.opp] : [], slots: { quote: text, X: slots.X } }));
      break;
    case "refs": {
      effect = 1.5; pressP(state, -0.5);
      out.push(ownerFact(state, "post", `${state.date}:refs`, 45, { tags: { refs: true }, slots: { quote: text } }));
      if (rng() < 0.4) {
        const amount = 50_000 * (1 + Math.floor(rng() * 3));
        const reason = "public criticism of game officials on social media";
        mediaState(state).fines.push({ date: addDays(state.date, 2), amount, reason });
        send(state, "league", "League Office", "Fine notice", `The league has fined you ${money(amount)} for ${reason}. The fine is charged to the club's accounts and does not count against the salary cap.`);
      }
      break;
    }
  }
  moodNudge(state, effect * f * weight(state));
  // A few fans answer.
  const fans = fanAccounts(state, us);
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const a = pick(rng, fans);
    const tone = a.kind === "troll" || mood < 32 || effect < 0 ? "bad" : effect >= 1.2 && a.kind !== "doomer" ? "good" : "mixed";
    const reply = render(pick(rng, OWNER_REPLY[tone]), slots, { rng, banks: {}, tone: "lively" }).trim();
    s.posts.unshift({ id: s.next++, date: state.date, who: a.handle, text: `${ownerHandle(state)} ${reply}`, kind: "fan", team: us, topic: TEAM_BY_ID[us].name, mood: tone === "good" ? 1 : tone === "bad" ? -1 : 0 });
  }
  file(state, out);
  return null;
}

// ---- Op-eds ----

/** Where the owner could place a column: the national outlets that run columns, and our local paper. */
export function opEdOutlets(state: GameState): { id: string; name: string }[] {
  const local = `local:${state.userTeam}`;
  return [{ id: local, name: outletOf(local).name }, ...NATIONAL.filter((o) => o.id !== "blitz").map((o) => ({ id: o.id, name: o.name }))];
}

export const OPED_TOPICS = Object.entries(OPED).map(([id, o]) => ({ id, label: o.label }));

/** The owner writes a guest column. It reaches fans in the owner's own words and warms the outlet that runs it. */
export function writeOpEd(state: GameState, outlet: string, topic: string): string | null {
  if (!OPED[topic]) return "Pick a topic.";
  if (!opEdOutlets(state).some((o) => o.id === outlet)) return "That outlet doesn't run guest columns.";
  const wait = cooling(state, "oped");
  if (wait) return `Your next column can run ${shortDate(wait)}.`;
  const k = ownerDesk(state);
  k.last.oped = state.date;
  k.opeds.unshift({ date: state.date, outlet, topic });
  k.opeds.length = Math.min(k.opeds.length, 20);
  const w = weight(state);
  trustHit(state, (topic === "community" || topic === "fans" ? 1.2 : 0.8) * w);
  changeRel(state, outlet, 3);
  pressP(state, 1);
  const rng = rngFor(state.seed, `oped:${state.date}`);
  const T = teamSlots(state, state.userTeam, standings(state));
  const lede = render(pick(rng, OPED[topic].lede), { T }, { rng, banks: {}, tone: "straight" });
  file(state, [ownerFact(state, "oped", state.date, 42, {
    tags: { solo: true, [topic]: true }, outlet,
    slots: { R: { name: state.ownerName, outlet: outletOf(outlet).name }, topic: OPED[topic].label, lede },
  })]);
  return null;
}

// ---- Access ----

/** Sets how a reporter is treated: favored (first questions, first calls), normal, or banned from the building. */
export function setAccess(state: GameState, reporterId: string, level: "normal" | "favored" | "banned"): string | null {
  const rep = reporter(state, reporterId);
  if (!rep) return "No such reporter.";
  const k = ownerDesk(state);
  const was = k.access[rep.id] ?? "normal";
  if (was === level) return null;
  const us = state.userTeam;
  if (level === "favored" && Object.values(k.access).filter((v) => v === "favored").length >= MAX_FAVORED) return `You can favor at most ${MAX_FAVORED} reporters.`;
  if (level === "normal") delete k.access[rep.id];
  else k.access[rep.id] = level;
  if (level === "favored") {
    repRel(rep, 5);
    for (const p of working(state)) if (p.id !== rep.id && p.team === us && isLocal(p.outlet)) repRel(p, -2);
  }
  if (level === "banned") {
    repRel(rep, -30);
    changeRel(state, rep.outlet, -5);
    for (const p of working(state)) if (p.id !== rep.id) repRel(p, -2);
    pressP(state, -3);
    trustHit(state, -0.3);
    file(state, [ownerFact(state, "ban", `${rep.id}:${state.date}`, 50, { tags: {}, slots: { R: voice(rep) } })]);
  } else if (was === "banned") {
    repRel(rep, 10);
    file(state, [ownerFact(state, "ban", `${rep.id}:${state.date}:lift`, 35, { tags: { unban: true }, slots: { R: voice(rep) } })]);
  }
  return null;
}

// ---- The day ----

function judgeClaims(state: GameState): void {
  const k = ownerDesk(state);
  const due = k.claims.filter((c) => c.due <= state.date);
  if (!due.length) return;
  k.claims = k.claims.filter((c) => c.due > state.date);
  const rec = standings(state)[state.userTeam];
  for (const c of due) {
    const w = (rec?.w ?? 0) - c.w, l = (rec?.l ?? 0) - c.l;
    if (w + l === 0) continue;
    if (w >= l) { cred(state, 3); trustHit(state, 0.5); } else { cred(state, -4); trustHit(state, -0.8); pressP(state, -1); }
  }
}

function burns(state: GameState, out: Fact[]): void {
  const k = ownerDesk(state);
  const due = (k.burns ?? []).filter((b) => b.date <= state.date);
  if (!due.length) return;
  k.burns = (k.burns ?? []).filter((b) => b.date > state.date);
  for (const b of due) {
    const rep = reporter(state, b.reporter);
    if (!rep) continue;
    cred(state, -6);
    trustHit(state, -1, 0, "The owner's private remarks went public");
    pressP(state, -3);
    out.push(ownerFact(state, "burned", `${b.reporter}:${b.date}`, 55, { tags: {}, outlet: rep.outlet, reporter: rep.id, slots: { R: voice(rep), quote: b.quote } }));
  }
}

function weeklyAccess(state: GameState): void {
  const k = ownerDesk(state);
  const us = state.userTeam;
  for (const [id, level] of Object.entries(k.access)) {
    const rep = reporter(state, id);
    if (!rep || rep.retired !== undefined) { delete k.access[id]; continue; }
    if (level === "favored") { rep.sources[us] = clamp((rep.sources[us] ?? 30) + 1); repRel(rep, 1); } else { repRel(rep, -1); pressP(state, -0.3); }
  }
}

/** Occasions that call a press conference today. */
function occasions(state: GameState, facts: Fact[]): void {
  const k = ownerDesk(state);
  const us = state.userTeam;
  const hc = teamStaff(us).HC?.id;
  const open = openPressers(state).some((p) => p.kind === "presser");
  const call = (o: string, extra: Partial<Topic> = {}) => {
    if (!open && !(k.last.presser && daysBetween(k.last.presser, state.date) < 3)) callPresser(state, o, extra);
  };
  if (hc !== k.hc) {
    const was = k.hc;
    k.hc = hc;
    if (was && !hc) call("firing");
    else if (hc && was) call("hire");
    return;
  }
  if (state.date === addDays(K().regularSeasonStart, -4)) return call("opener");
  const seeds = state.seeds ? [...state.seeds.AFC, ...state.seeds.NFC] : [];
  if (state.date === addDays(K().regularSeasonEnd, 2) && seeds.length && !seeds.includes(us)) return call("endSeason");
  const yesterday = GAMES_BY_DATE[addDays(state.date, -1)] ?? [];
  for (const g of yesterday) {
    const r = state.results[g.id];
    if (!r || g.type !== "POST" || (r.home !== us && r.away !== us)) continue;
    const won = (r.home === us ? r.homeScore - r.awayScore : r.awayScore - r.homeScore) > 0;
    if (!won || state.date === addDays(K().superBowl, 1)) return call("endSeason");
  }
  const big = facts.find((f) => f.family === "signing" && f.ours && f.value >= 70 && f.players[0]);
  if (big) return call("signing", { player: big.players[0] });
  // A storyline about the club heats up: the owner is asked to take a few questions.
  if (weekday(state.date) === "Tuesday" && (!k.last.presser || daysBetween(k.last.presser, state.date) >= 21)) {
    const hot = openArcs(state).some((a) => (a.team === us || a.other === us) && daysBetween(a.beats[a.beats.length - 1]?.date ?? a.opened, state.date) <= 10 && (ARCS.find((d) => d.kind === a.kind)?.value ?? 0) >= 45);
    if (hot) call("availability");
  }
}

/** End of the media day: lapsed press conferences go ahead without answers, promises and denials are judged, and new occasions call the owner in. */
export function ownerDeskDaily(state: GameState, facts: Fact[]): Fact[] {
  const k = ownerDesk(state);
  const out: Fact[] = [];
  for (const p of openPressers(state)) {
    if (p.expires > state.date) continue;
    if (p.kind !== "presser") {
      // An interview the owner asked for and never gave.
      p.held = state.date;
      p.skipped = true;
      repRel(p.reporter ? reporter(state, p.reporter) : undefined, -3);
      continue;
    }
    p.held = state.date;
    p.skipped = true;
    for (const q of p.questions) { q.answer = 2; answerEffect(state, q, "deflect", 0.5, { made: true }); }
    pressP(state, -3);
    trustHit(state, -0.5);
    out.push(presserFact(state, p));
  }
  burns(state, out);
  judgeResponses(state, out);
  judgeClaims(state);
  if (weekday(state.date) === "Monday") weeklyAccess(state);
  occasions(state, facts);
  k.pressers = k.pressers.filter((p) => !p.held || daysBetween(p.held, state.date) <= 365);
  file(state, out);
  return out;
}

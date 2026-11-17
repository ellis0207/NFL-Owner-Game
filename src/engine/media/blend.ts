// Combinations: what lets any story be written many more ways. Three formats
// every family can use (an explainer, an "ask the insider" Q&A, a podcast
// segment); a second angle folded into the same story; the reporter's own
// voice (a numbers person and an old-school voice don't sound alike); a line
// tying the news to the club's running storylines or its place in the
// standings; and daily roundups that gather several smaller items into one
// piece (injuries, transactions, the rumor mill, what we learned in the
// week's games, a club notebook). Words in content/blend.ts.
import { addStory } from "../outlets";
import { daysBetween } from "../dates";
import { RULES, TEAM_BY_ID } from "../league";
import { rngFor, type Rng } from "../rng";
import { standings } from "../standings";
import type { GameState, Reporter } from "../types";
import type { AngleDef, FamilyContent } from "./angles";
import { openArcs } from "./arcs";
import { banksFor, contentFor, pickAngles, withUs } from "./compose";
import {
  CONNECT, CONTEXT, EXPLAIN_HEAD, EXPLAIN_NEXT, EXPLAIN_OPEN, EXPLAIN_WHY, NEXT, PODCAST_CLOSE, PODCAST_HEAD, PODCAST_OPEN, PODCAST_PUSH,
  QA_ANSWER, QA_ASK, QA_HEAD, ROUNDUP, VOICE,
} from "./content/blend";
import { byline, working } from "./corps";
import { teamSlots, type Fact } from "./facts";
import type { FormatId } from "./formats";
import { choose, type RenderContext, type Slots } from "./grammar";

/** Formats any family can be written in, and when a fact is big enough for each. */
export const GENERIC: FormatId[] = ["explainer", "qa", "podcast"];

export function genericFits(f: Fact, format: FormatId): boolean {
  if (format === "explainer") return f.value >= 50 && f.family !== "opinion" && f.family !== "arc";
  if (format === "qa") return f.value >= 45 && f.family !== "opinion" && f.family !== "owner";
  if (format === "podcast") return f.value >= 60 || (f.ours && f.value >= 45);
  return false;
}

/** Formats long enough to fold a second angle into. */
const ROOMY = new Set<FormatId>(["column", "feature", "report", "analytics", "film", "explainer", "qa", "notebook"]);

/** Another angle that fits the fact, for a story that carries two. */
export function secondAngle(c: FamilyContent, f: Fact, first: AngleDef, format: FormatId, rng: Rng): AngleDef | undefined {
  if (!ROOMY.has(format) && format !== "podcast") return undefined;
  const pool = c.angles.filter((a) => a !== first && a.id !== "plain" && a.when(f.tags) > 0);
  if (!pool.length || rng() > 0.55) return undefined;
  return pool[Math.floor(rng() * pool.length)];
}

/** The reporter's own voice: a numbers aside or an old-school one, in opinion and analysis pieces. */
export function voiceLine(rep: Reporter | undefined, group: string, ctx: RenderContext, slots: Slots): string {
  if (!rep || rep.style === "balanced" || (group !== "opinion" && group !== "analysis")) return "";
  if (ctx.rng() > 0.5) return "";
  return choose(VOICE[rep.style], slots, ctx);
}

/** A line tying the story to the club's situation: an open storyline, or where it stands. */
export function contextLine(state: GameState, f: Fact, ctx: RenderContext): string {
  if (ctx.rng() > 0.55) return "";
  const team = (f.slots.US as { id?: string } | undefined)?.id && f.ours ? (f.slots.US as { id: string }).id : f.teams[0];
  if (!team || !TEAM_BY_ID[team]) return "";
  const table = standings(state);
  const CX = teamSlots(state, team, table);
  const keys: string[] = [];
  for (const a of openArcs(state)) {
    if (a.team !== team || !CONTEXT[a.kind]) continue;
    if (a.kind === "losingStreak" && Number(CX.losses) < 2) continue;
    if (a.kind === "winStreak" && Number(CX.wins) < 2) continue;
    // A storyline is about the arc's own subject; don't tie a story to itself.
    if (f.family === "arc" && f.type === `arc.${a.kind}`) continue;
    keys.push(a.kind, a.kind);
  }
  const r = table[team];
  if (r && r.w + r.l + r.t >= 3) {
    const div = Object.values(table).filter((x) => TEAM_BY_ID[x.team]?.division === TEAM_BY_ID[team].division && TEAM_BY_ID[x.team]?.conference === TEAM_BY_ID[team].conference);
    const pct = (x: typeof r) => (x.w + x.t / 2) / Math.max(1, x.w + x.l + x.t);
    const rank = div.filter((x) => pct(x) > pct(r)).length;
    keys.push(rank === 0 ? "lead" : rank === div.length - 1 ? "cellar" : "middle");
  }
  if (!keys.length) return "";
  const key = keys[Math.floor(ctx.rng() * keys.length)];
  return choose(CONTEXT[key], { CX }, ctx);
}

/** One of the three shared formats, built from the angle's own words. */
export function writeGeneric(
  state: GameState, f: Fact, c: FamilyContent, format: FormatId, angle: AngleDef, second: AngleDef | undefined,
  rep: Reporter | undefined, outlet: { id: string; name: string }, slots: Slots, ctx: RenderContext,
): { headline: string; body: string } {
  const head = choose(angle.head, slots, ctx);
  const take = choose(angle.take, slots, ctx);
  const para = choose(angle.para, slots, ctx);
  const extra = second ? `${choose(CONNECT, slots, ctx)} ${choose(second.para, slots, ctx)}` : "";
  const context = contextLine(state, f, ctx);
  const voice = voiceLine(rep, format === "explainer" ? "news" : "analysis", ctx, slots);
  const by = String(slots.by ?? "");
  const s: Slots = { ...slots, H: cap(head) };
  if (format === "explainer") {
    const lede = choose(c.lede.news ?? [], slots, ctx);
    return {
      headline: choose(EXPLAIN_HEAD, s, ctx),
      body: [choose(EXPLAIN_OPEN, s, ctx), lede, choose(EXPLAIN_WHY, s, ctx), para, extra, context, choose(EXPLAIN_NEXT, s, ctx), choose(NEXT[f.family] ?? NEXT.default, s, ctx)].join(" "),
    };
  }
  if (format === "qa") {
    return {
      headline: choose(QA_HEAD, s, ctx),
      body: [choose(QA_ASK, s, ctx), choose(QA_ANSWER, s, ctx), para, extra, voice, context, choose(c.details, slots, ctx)].join(" "),
    };
  }
  // Podcast: the host's take, and a co-host who pushes back with another angle.
  const co = working(state).find((p) => p.outlet === outlet.id && p.id !== rep?.id);
  const show = SHOWS[outlet.id] ?? `${LOCAL_SHOWS[[...outlet.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % LOCAL_SHOWS.length]} on ${outlet.name.replace(/^The /, "")}`;
  const push = second ? choose(second.take, slots, ctx) : choose(c.angles[0].take, slots, ctx);
  const ps: Slots = { ...s, H: cap(take), K: cap(push).replace(/[.!?]$/, ""), show, cohost: co?.name ?? "the co-host", by, n: 100 + daysBetween(RULES.keyDates.regularSeasonStart ?? state.date, state.date) };
  const lede = choose(c.lede.opinion ?? c.lede.news ?? [], slots, ctx);
  return {
    headline: choose(PODCAST_HEAD, ps, ctx),
    body: [choose(PODCAST_OPEN, ps, ctx), lede, para, choose(PODCAST_PUSH, ps, ctx), voice, choose(PODCAST_CLOSE, ps, ctx)].join(" "),
  };
}

const SHOWS: Record<string, string> = {
  blitz: "Big Lou Unfiltered", xp: "Expected Points", sideline: "The Sideline Report Daily", ledger: "The Ledger Pod", afw: "Wire to Wire", capspace: "Cap Space Talk", journal: "The Business of Football",
};

/** Local radio's own shows. */
const LOCAL_SHOWS = ["The Afternoon Drive", "The Morning Huddle", "Postgame Live", "The Locker Room", "Fourth and Long", "The Two-Minute Drill"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---- Roundups ----

/** A headline for a fact, the way a roundup lists it. */
function itemLine(state: GameState, raw: Fact, rng: Rng): string {
  const f = withUs(state, raw);
  const c = contentFor(f);
  if (!c) return "";
  const a = pickAngles(f, c, 1, rng)[0];
  const slots: Slots = { ...f.slots, tag: f.tags, fmt: { report: true }, angle: { [a.id]: true }, by: "" };
  const h = choose(a.head, slots, { rng, banks: banksFor(c), tone: "straight" });
  return h ? cap(h) : "";
}

function fileRoundup(state: GameState, theme: string, outlet: string, role: "insider" | "analyst" | "reporter", facts: Fact[], extra: Slots, rng: Rng): void {
  const items = [...new Set(facts.map((f) => itemLine(state, f, rng)).filter(Boolean))].slice(0, 6);
  if (items.length < (theme === "rumors" ? 2 : 3)) return;
  const w = ROUNDUP[theme];
  const slots: Slots = { ...extra, first: items[0].replace(/[.!?]$/, ""), more: items.length - 1, n: items.length };
  const ctx: RenderContext = { rng, banks: {}, tone: "straight" };
  const by = byline(state, outlet, role);
  addStory(state, {
    outlet, by, kind: "league", teams: [...new Set(facts.flatMap((f) => f.teams))].slice(0, 8), players: [...new Set(facts.flatMap((f) => f.players))].slice(0, 8),
    headline: cap(choose(w.head, slots, ctx)),
    body: `${choose(w.open, slots, ctx)}\n\n${items.map((i) => `• ${i.replace(/[.!?]?$/, ".")}`).join("\n")}\n\n${choose(w.close, slots, ctx)}`,
    type: `roundup.${theme}/${items.length}/list`, format: "roundup",
  });
}

/** The day's roundups, from the facts the desks saw. */
export function roundupsDaily(state: GameState, facts: Fact[]): void {
  const rng = rngFor(state.seed, `words:roundup:${state.date}`);
  const by = (fam: string[]) => facts.filter((f) => fam.includes(f.family)).sort((a, b) => b.value - a.value);
  fileRoundup(state, "injuries", "afw", "insider", by(["injury"]), {}, rng);
  fileRoundup(state, "moves", "capspace", "analyst", by(["signing", "release", "claim"]), {}, rng);
  fileRoundup(state, "rumors", "sideline", "insider", by(["rumor"]), {}, rng);
  const games = facts.filter((f) => f.type === "game.reg").sort((a, b) => b.value - a.value);
  if (games.length >= 6) {
    const start = RULES.keyDates.regularSeasonStart;
    const week = Math.floor(daysBetween(start, state.date) / 7) + 1;
    fileRoundup(state, "week", rng() < 0.5 ? "ledger" : "xp", rng() < 0.5 ? "reporter" : "analyst", games, { week, next: week + 1 }, rng);
  }
  // Club notebooks: ours whenever there's enough, and the busiest few elsewhere.
  const byTeam = new Map<string, Fact[]>();
  for (const f of facts) for (const t of f.teams.slice(0, 2)) if (TEAM_BY_ID[t] && f.value >= 20 && f.family !== "game") byTeam.set(t, [...(byTeam.get(t) ?? []), f]);
  const busy = [...byTeam.entries()].filter(([, l]) => l.length >= 3).sort((a, b) => Number(b[0] === state.userTeam) - Number(a[0] === state.userTeam) || b[1].length - a[1].length).slice(0, 4);
  for (const [team, list] of busy) fileRoundup(state, "local", `local:${team}`, "reporter", list.sort((a, b) => b.value - a.value), { CX: teamSlots(state, team) }, rng);
}

// The desks: turn the day's facts into stories. Bigger news gets more
// coverage, in more formats and from more outlets, the way a real news cycle
// works: every game gets its game story, a big one also gets columns, numbers
// pieces and radio takes, and our own club's beat writers cover everything
// about us. A daily budget keeps the volume near a real outlet's output.
import { addDays } from "../dates";
import { GAMES_BY_DATE, RULES } from "../league";
import { addStory, MEDIA_BY_ID, mediaState } from "../outlets";
import { rngFor, type Rng } from "../rng";
import { beatWriters } from "../teammedia";
import type { GameState, StoryKind } from "../types";
import type { AngleDef, FamilyContent } from "./angles";
import { GAME } from "./content/game";
import { CLAIM, RELEASE, SIGNING, TRADE } from "./content/moves";
import { INJURY, PERFORMANCE } from "./content/players";
import { WIRE_CONTENT } from "./content/wire";
import { CAMP, SEAT, TALK } from "./content/talk";
import { collectFacts, teamSlots, type Fact, type Family } from "./facts";
import { FORMATS, SHARED_BANK, type FormatDef, type FormatId } from "./formats";
import { choose, render, type Bank, type RenderContext, type Slots, type Tone } from "./grammar";
import { standings } from "../standings";

export const FAMILIES: Partial<Record<Family, FamilyContent>> = {
  game: GAME, performance: PERFORMANCE, talk: TALK, camp: CAMP, seat: SEAT, injury: INJURY, signing: SIGNING, release: RELEASE, claim: CLAIM, trade: TRADE,
};

/** The words for a fact: its family's, or for the league wire, its topic's. */
export function contentFor(f: Fact): FamilyContent | undefined {
  if (f.family === "wire") return WIRE_CONTENT[String(f.slots.topic)] ?? WIRE_CONTENT.league;
  return FAMILIES[f.family];
}

const banksCache = new WeakMap<FamilyContent, Bank>();
function banksFor(c: FamilyContent): Bank {
  let b = banksCache.get(c);
  if (!b) {
    b = { ...SHARED_BANK, ...(c.bank ?? {}) };
    banksCache.set(c, b);
  }
  return b;
}

export function toneOf(heat: number): Tone {
  return heat >= 0.7 ? "hot" : heat >= 0.35 ? "lively" : "straight";
}

/** How many stories a fact earns: real coverage scales with how big the news is. */
export function storiesFor(f: Fact): number {
  const v = f.value;
  switch (f.family) {
    case "game": return 1 + (v >= 55 ? 1 : 0) + (v >= 85 ? 1 : 0) + (f.ours ? 1 : 0);
    case "performance": return (v >= 55 ? 1 : 0) + (v >= 70 ? 1 : 0);
    case "injury": return 1 + (v >= 70 ? 1 : 0) + (f.ours ? 1 : 0);
    case "signing": return 1 + (v >= 50 ? 1 : 0) + (v >= 80 ? 1 : 0) + (f.ours ? 1 : 0);
    case "release": return 1 + (v >= 70 ? 1 : 0);
    case "claim": return 1;
    case "trade": return 2 + (f.tags.blockbuster ? 1 : 0) + (f.ours ? 1 : 0);
    case "talk": return 1 + (f.ours ? 1 : 0);
    case "camp": return 1 + (f.ours && v >= 50 ? 1 : 0);
    case "seat": return 1 + (v >= 60 ? 1 : 0);
    case "wire": return (v >= 40 ? 1 : 0) + (v >= 65 ? 1 : 0) + (f.ours ? 1 : 0);
    default: return v >= 40 ? 1 : 0;
  }
}

/** A normal day's ceiling on league coverage; game days and the league's big dates run longer. */
export function dailyBudget(state: GameState): number {
  const K = RULES.keyDates;
  const games = (GAMES_BY_DATE[state.date] ?? []).filter((g) => g.type !== "PRE").length;
  if ([K.tradeDeadline, K.leagueYearStart, K.draftStart].includes(state.date)) return 60;
  return games >= 5 ? 70 : games ? 40 : 30;
}

function weighted<T>(rng: Rng, items: [T, number][]): T | undefined {
  const total = items.reduce((a, [, w]) => a + Math.max(0, w), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const [x, w] of items) {
    r -= Math.max(0, w);
    if (r <= 0) return x;
  }
  return items[items.length - 1][0];
}

function pickFormats(f: Fact, c: FamilyContent, n: number, rng: Rng): FormatId[] {
  const out: FormatId[] = [c.formats[0]];
  const usable = c.formats.slice(1).filter((id) => {
    if (id === "notebook") return f.ours;
    if (id === "grades") return f.family === "trade" || !!f.tags.graded;
    return true;
  });
  // Our beat writers always file.
  if (f.ours && usable.includes("notebook") && n > 1) out.push("notebook");
  const rest = usable.filter((x) => !out.includes(x));
  while (out.length < n && rest.length) {
    const i = Math.floor(rng() * rest.length);
    out.push(rest.splice(i, 1)[0]);
  }
  return out.slice(0, n);
}

function pickAngles(f: Fact, c: FamilyContent, n: number, rng: Rng): AngleDef[] {
  const pool: [AngleDef, number][] = c.angles.map((a) => [a, a.when(f.tags)]);
  const out: AngleDef[] = [];
  for (let i = 0; i < n; i++) {
    const a = weighted(rng, pool.filter(([x]) => !out.includes(x)));
    out.push(a ?? c.angles[0]);
  }
  return out;
}

function pickOutlet(fmt: FormatDef, used: Set<string>, rng: Rng): string {
  const fresh = fmt.outlets.filter(([o]) => !used.has(o));
  return weighted(rng, fresh.length ? fresh : fmt.outlets) ?? fmt.outlets[0][0];
}

const KIND_BY_FORMAT: Partial<Record<FormatId, StoryKind>> = { column: "interview", hottake: "interview", analytics: "trend", film: "trend" };

export interface Draft { headline: string; body: string; outlet: string; by: string; format: FormatId; angle: string; type: string; kind: StoryKind }

/** Writes one story about a fact. `missing` collects empty slots for the template linter. */
export function writeStory(state: GameState, f: Fact, angle: AngleDef, format: FormatId, outletId: string, rng: Rng, missing?: string[]): Draft {
  const c = contentFor(f)!;
  const fmt = FORMATS[format];
  const outlet = MEDIA_BY_ID[outletId];
  const by = outletId === "beat" ? beatWriters(state)[Math.floor(rng() * 2)] : outlet[fmt.role];
  const ctx: RenderContext = { rng, banks: banksFor(c), tone: toneOf(outlet.heat), missing };
  const slots: Slots = { ...f.slots, tag: f.tags, fmt: { [format]: true }, angle: { [angle.id]: true }, by };
  const headline = choose(fmt.style === "take" ? angle.take : angle.head, slots, ctx);
  const lede = choose(c.lede[fmt.group] ?? c.lede.news ?? [], slots, ctx);
  const para = choose(angle.para, slots, ctx);
  const details = choose(c.details, slots, ctx);
  let quote = "";
  if (fmt.quote && c.quote) {
    const q = c.quote(f);
    const line = q && choose(ctx.banks[`${q.bank}.${ctx.tone}`] ?? ctx.banks[q.bank] ?? [], slots, ctx);
    if (q && line) quote = `"${/[.]$/.test(line) ? `${line.slice(0, -1)},` : line}" said ${q.who}, ${q.role}.`;
  }
  const kicker = format === "recap" || format === "alert" ? "" : render(`{@kick.${format}}`, slots, { ...ctx, missing: undefined });
  const parts = format === "alert" ? [lede, details] : fmt.group === "grades" ? [lede, para, kicker] : [lede, para, details, quote, kicker];
  return {
    headline: headline.charAt(0).toUpperCase() + headline.slice(1),
    body: parts.filter((x) => x && x.trim()).join(" ").replace(/\s+/g, " ").trim(),
    outlet: outletId, by, format, angle: angle.id, type: `${f.type}/${angle.id}/${format}`,
    kind: KIND_BY_FORMAT[format] ?? f.kind,
  };
}

/** Adds the slots that depend on whose story it is: US and THEM for our club's coverage. */
export function withUs(state: GameState, f: Fact): Fact {
  const us = state.userTeam;
  const table = standings(state);
  const US: Slots = { ...teamSlots(state, us, table) };
  if (!f.ours) return { ...f, slots: { ...f.slots, US } };
  const them = f.teams.find((t) => t !== us);
  if (f.family === "game") US.won = (f.slots.W as { id: string }).id === us && !f.tags.tie;
  return { ...f, slots: { ...f.slots, US, THEM: them ? teamSlots(state, them, table) : US } };
}

/** Everything the desks file today from the day's facts. */
export function composeDay(state: GameState): number {
  return fileFacts(state, collectFacts(state));
}

/** Writes up a set of facts: the day's own, or ones a weekly desk (interviews, camp, the hot seat) put together. */
export function fileFacts(state: GameState, all: Fact[], budgetOverride?: number): number {
  const facts = all.filter((f) => contentFor(f)).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  if (!facts.length) return 0;
  const m = mediaState(state);
  const since = addDays(state.date, -30);
  const recent = new Set(m.stories.filter((s) => s.date >= since).map((s) => s.headline));
  let budget = budgetOverride ?? dailyBudget(state);
  let filed = 0;
  for (const raw of facts) {
    const f = withUs(state, raw);
    const c = contentFor(f)!;
    // Every game gets its game story and our club always gets its coverage; the rest waits for room.
    const must = f.family === "game" || f.ours;
    let n = storiesFor(f);
    if (!must) n = Math.min(n, budget);
    if (n <= 0) continue;
    const rng = rngFor(state.seed, `words:${f.id}`);
    const formats = pickFormats(f, c, n, rng);
    const angles = pickAngles(f, c, formats.length, rng);
    const used = new Set<string>();
    formats.forEach((format, i) => {
      const fmt = FORMATS[format];
      const outlet = pickOutlet(fmt, used, rng);
      used.add(outlet);
      let d = writeStory(state, f, angles[i], format, outlet, rng);
      for (let tries = 0; recent.has(d.headline) && tries < 3; tries++) d = writeStory(state, f, angles[i], format, outlet, rng);
      recent.add(d.headline);
      addStory(state, {
        outlet: d.outlet, by: d.by, kind: d.kind, headline: d.headline, body: d.body,
        teams: f.teams, players: f.players.length ? f.players : undefined, gameId: f.gameId,
        type: d.type, format: d.format, angle: d.angle,
      });
      filed++;
      budget--;
    });
  }
  return filed;
}

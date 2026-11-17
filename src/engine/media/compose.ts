// The desks: turn the day's facts into stories. Bigger news gets more
// coverage, in more formats and from more outlets, the way a real news cycle
// works: every game gets its game story, a big one also gets columns, numbers
// pieces and radio takes, and our own club's beat writers cover everything
// about us. A daily budget keeps the volume near a real outlet's output.
import { addDays } from "../dates";
import { GAMES_BY_DATE, RULES } from "../league";
import { addStory, mediaState } from "../outlets";
import { rngFor, type Rng } from "../rng";
import type { GameState, ReporterRole, StoryKind } from "../types";
import { corps, isLocal, outletOf, pickReporter } from "./corps";
import type { AngleDef, FamilyContent } from "./angles";
import { GAME } from "./content/game";
import { CLAIM, RELEASE, SIGNING, TRADE } from "./content/moves";
import { INJURY, PERFORMANCE } from "./content/players";
import { WIRE_CONTENT } from "./content/wire";
import { CAMP, SEAT, TALK } from "./content/talk";
import { RUMOR_CONTENT } from "./content/rumors";
import { ARC_CONTENT } from "./content/arcs";
import { SEASON_CONTENT } from "./content/season";
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
  if (f.family === "rumor") return RUMOR_CONTENT[f.type.split(".")[1]];
  if (f.family === "arc") return ARC_CONTENT[f.type.split(".")[1]];
  if (f.family === "season") return SEASON_CONTENT[f.type.split(".")[1]];
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
    case "rumor": return 1 + (v >= 60 ? 1 : 0) + (f.ours ? 1 : 0);
    case "arc": return 1 + (v >= 60 ? 1 : 0) + (f.ours ? 1 : 0);
    case "season": return 1 + (v >= 55 ? 1 : 0) + (v >= 75 ? 1 : 0) + (f.ours ? 1 : 0);
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
  // A sourced report runs first in the format its reporter works in: a radio segment, a beat notebook, an insider report.
  const first = f.tags.scoop && c.formats.includes(f.tags.scoop as FormatId) ? (f.tags.scoop as FormatId) : c.formats[0];
  const out: FormatId[] = [first];
  const usable = c.formats.filter((id) => id !== first).filter((id) => {
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

/** What each national outlet goes looking for: the business paper chases money stories, the analytics site numbers. */
const OUTLET_BEATS: Record<string, string[]> = {
  journal: ["business", "stadiums", "ownership", "relocation", "labor", "league", "frontoffice", "contracts", "signing"],
  capspace: ["contracts", "freeagency", "signing", "release", "trade", "trades"],
  sentinel: ["draft", "college", "camp"],
  xp: ["game", "performance"],
};

function pickOutlet(fmt: FormatDef, used: Set<string>, rng: Rng, f: Fact): string {
  const subject = String(f.slots.topic ?? f.family);
  const home = (f.slots.US as { id?: string } | undefined)?.id ?? f.teams[0];
  const weights: [string, number][] = fmt.outlets.map(([o, w]) => {
    if (o === "beat") return [`local:${home}`, w];
    const beats = OUTLET_BEATS[o];
    return [o, beats ? w * (beats.includes(subject) ? 3 : 0.5) : w];
  });
  const fresh = weights.filter(([o]) => !used.has(o));
  return weighted(rng, fresh.length ? fresh : weights) ?? weights[0][0];
}

const KIND_BY_FORMAT: Partial<Record<FormatId, StoryKind>> = { column: "interview", hottake: "interview", analytics: "trend", film: "trend" };

export interface Draft { headline: string; body: string; outlet: string; by: string; reporter?: string; format: FormatId; angle: string; type: string; kind: StoryKind }

/** Writes one story about a fact. `missing` collects empty slots for the template linter. */
export function writeStory(state: GameState, f: Fact, angle: AngleDef, format: FormatId, outletId: string, rng: Rng, missing?: string[]): Draft {
  const c = contentFor(f)!;
  const fmt = FORMATS[format];
  const outlet = outletOf(outletId);
  const role: ReporterRole = isLocal(outletId) ? (format === "hottake" ? "host" : format === "column" ? "columnist" : "beat") : fmt.role;
  const team = (f.slots.US as { id?: string } | undefined)?.id && f.ours ? (f.slots.US as { id: string }).id : f.teams[0];
  const rep = (f.reporter && f.outlet === outletId ? corps(state).people.find((p) => p.id === f.reporter) : undefined) ?? pickReporter(state, outletId, role, rng, team);
  const by = rep?.name ?? outlet[fmt.role] ?? "Staff";
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
    outlet: outletId, by, reporter: rep?.id, format, angle: angle.id, type: `${f.type}/${angle.id}/${format}`,
    kind: KIND_BY_FORMAT[format] ?? f.kind,
  };
}

/** Adds the slots that depend on whose story it is: US and THEM for our club's coverage, or for the local media of the club `team`. */
export function withUs(state: GameState, f: Fact, team?: string): Fact {
  const us = state.userTeam;
  const table = standings(state);
  const side = team ?? (f.ours ? us : undefined);
  if (!side) return { ...f, slots: { ...f.slots, US: { ...teamSlots(state, us, table) } } };
  const US: Slots = { ...teamSlots(state, side, table) };
  const them = f.teams.find((t) => t !== side);
  if (f.family === "game") US.won = (f.slots.W as { id: string }).id === side && !f.tags.tie;
  // Local media write as their club's own paper, the way our beat writers write about us.
  const tags = team && team !== us ? { ...f.tags, ours: true, local: true } : f.tags;
  return { ...f, tags, slots: { ...f.slots, US, THEM: them ? teamSlots(state, them, table) : US } };
}

/** Everything the desks file today from the day's facts. */
export function composeDay(state: GameState): Fact[] {
  const facts = collectFacts(state);
  fileFacts(state, facts);
  return facts;
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
    const file = (g: Fact, angle: AngleDef, format: FormatId, outlet: string) => {
      let d = writeStory(state, g, angle, format, outlet, rng);
      for (let tries = 0; recent.has(d.headline) && tries < 3; tries++) d = writeStory(state, g, angle, format, outlet, rng);
      recent.add(d.headline);
      addStory(state, {
        outlet: d.outlet, by: d.by, reporter: d.reporter, kind: d.kind, headline: d.headline, body: d.body,
        teams: f.teams, players: f.players.length ? f.players : undefined, gameId: f.gameId,
        type: d.type, format: d.format, angle: d.angle,
      });
      filed++;
      budget--;
    };
    formats.forEach((format, i) => {
      // A sourced report runs first where the reporter who has it works.
      const outlet = i === 0 && f.outlet ? f.outlet : pickOutlet(FORMATS[format], used, rng, f);
      used.add(outlet);
      file(f, angles[i], format, outlet);
    });
    // Each club's local media cover their own team's news: the paper's beat writers, its columnist, the sports radio hosts.
    if (f.value < LOCAL_LINE || f.family === "performance") continue;
    for (const team of f.teams.slice(0, 2)) {
      if (team === state.userTeam ? f.value < 50 : budget <= 0) continue;
      const g = withUs(state, raw, team);
      const local = localFormat(g, c, team === state.userTeam, rng);
      if (!local) continue;
      const [format, outlet] = local;
      if (used.has(outlet)) continue;
      used.add(outlet);
      file(g, pickAngles(g, c, 1, rng)[0], format, outlet);
    }
  }
  return filed;
}

/** Below this news value only the national wire and the box score notice; above it the clubs' own local media write. */
const LOCAL_LINE = 25;

/** The local piece on a club's news: usually the beat writers' notebook, sometimes the paper's columnist or the radio hosts. */
function localFormat(f: Fact, c: FamilyContent, ours: boolean, rng: Rng): [FormatId, string] | undefined {
  const team = (f.slots.US as { id: string }).id;
  const options: [[FormatId, string], number][] = [];
  if (c.formats.includes("notebook") && !ours) options.push([["notebook", `local:${team}`], 3]);
  if (c.formats.includes("column")) options.push([["column", `local:${team}`], 1]);
  if (c.formats.includes("hottake") && f.value >= 45) options.push([["hottake", `radio:${team}`], 1.2]);
  if (c.formats.includes("recap") && !ours) options.push([["recap", `local:${team}`], 2]);
  return weighted(rng, options);
}

// The Huddle: the league's made-up social platform. Every club has its own
// fan accounts by archetype (the diehard, the homer, the doomer, the numbers
// guy, the casual fan, the old-timer, the rival troll, the draftnik), players
// post from their personality (celebrations, signings, injuries, cryptic
// posts when a holdout or trade request is brewing, trash talk after a
// rivalry win), reporters break news first, and clubs post the official
// word. What gets posted about most is trending. Each club has a sentiment
// reading from what its fans are saying, and ours moves fan trust and
// pressure a little every week. Words are written by the story grammar on
// their own rng, so posting never changes results.
import { daysBetween, weekday } from "../dates";
import { trustHit } from "../fans";
import { PLAYER_BY_ID, RULES, TEAMS, TEAM_BY_ID } from "../league";
import { mediaState } from "../outlets";
import { personality } from "../clubhouse";
import { rngFor, type Rng } from "../rng";
import { standings } from "../standings";
import type { GameState, SocialPost, SocialState } from "../types";
import { outletOf, pickReporter } from "./corps";
import { arcState } from "./arcs";
import { ALERT, ARCHETYPES, CLUB, FAN, HANDLE, NEWS_TAKE, PLAYER, SOCIAL_BANK, type Archetype } from "./content/social";
import { teamSlots, type Fact } from "./facts";
import { render, type Slots } from "./grammar";

/** Posts kept: about a week of the feed. */
const KEEP = 450;
const KEEP_DAYS = 8;

export function social(state: GameState): SocialState {
  return (mediaState(state).social ??= { posts: [], next: 1, mood: {} });
}

/** A club's fan sentiment, 0 (furious) to 100 (euphoric); 50 is a normal mood. */
export function sentiment(state: GameState, team: string): number {
  return social(state).mood[team] ?? 50;
}

export function sentimentWord(v: number): string {
  return v >= 75 ? "euphoric" : v >= 60 ? "upbeat" : v >= 42 ? "mixed" : v >= 28 ? "frustrated" : "furious";
}

/** A club's fan accounts, made up from the save's seed: the same handles every time. */
export function fanAccounts(state: GameState, team: string): { handle: string; kind: Archetype }[] {
  const rng = rngFor(state.seed, `huddle:${team}`);
  const nick = TEAM_BY_ID[team].name.replace(/\W/g, "");
  return ARCHETYPES.map((kind) => {
    const h = HANDLE[kind];
    const pre = h.pre[Math.floor(rng() * h.pre.length)];
    const post = h.post[Math.floor(rng() * h.post.length)];
    const n = rng() < 0.35 ? String(Math.floor(rng() * 99) + 1) : "";
    // Trolls are fans of somebody else: their handle doesn't carry our name.
    return { handle: `@${pre}${kind === "troll" ? "" : nick}${post}${n}`, kind };
  });
}

function handleOf(id: string): string {
  return `@${(PLAYER_BY_ID[id]?.name ?? "player").replace(/[^A-Za-z0-9]/g, "")}`;
}

type Mood = "good" | "bad";

/** How a club's fans take a fact, from -1 to 1. */
function moodOf(f: Fact, team: string): number {
  const id = (k: string) => (f.slots[k] as { id?: string } | undefined)?.id;
  switch (f.family) {
    case "game": return id("W") === team ? (f.tags.upset ? 1 : 0.8) : id("L") === team ? (Number(f.tags.margin) >= 17 ? -1 : -0.7) : 0;
    case "performance": return 0.4;
    case "injury": return -0.7;
    case "signing": return 0.6;
    case "claim": return 0.2;
    case "release": return -0.2;
    case "trade": return id("winner") === team ? 0.4 : -0.3;
    case "seat": return -0.6;
    case "season": return f.tags.clinch || f.tags.champion ? 0.9 : f.tags.eliminated || f.tags.bad ? -0.8 : 0.1;
    case "arc": return f.tags.ending && /snapped|fired|benched|traded|lost|broken/.test(String(f.tags.beat)) ? -0.4 : 0;
    default: return 0;
  }
}

function post(state: GameState, p: Omit<SocialPost, "id" | "date">): void {
  const s = social(state);
  if (!p.text) return;
  s.posts.unshift({ id: s.next++, date: state.date, ...p });
}

function say(template: string, slots: Slots, rng: Rng): string {
  return render(template, slots, { rng, banks: SOCIAL_BANK, tone: "lively" });
}

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

/** A fan account's post about its club. */
function fanPost(state: GameState, team: string, mood: Mood | "chat", rng: Rng, extra: Slots = {}, take?: string[]): void {
  const accounts = fanAccounts(state, team);
  const a = pick(rng, accounts);
  // The troll is somebody else's fan, so he roots against our news.
  const m: Mood | "chat" = a.kind === "troll" && mood !== "chat" ? (mood === "good" ? "bad" : "good") : mood;
  const table = standings(state);
  const r = table[team];
  const slots: Slots = { T: { ...teamSlots(state, team, table), rec: r && r.w + r.l + r.t ? teamSlots(state, team, table).rec : "" }, ...extra };
  // News other than a game gets the fan's take on the news itself; games and chatter get the archetype's voice.
  const onNews = take && m !== "chat" && a.kind !== "troll" && rng() < 0.7;
  const text = onNews ? say(pick(rng, take!), slots, rng) : say(pick(rng, FAN[a.kind][m]), slots, rng);
  post(state, { who: a.handle, kind: "fan", team, text, topic: TEAM_BY_ID[team].name, mood: m === "good" ? 1 : m === "bad" ? -1 : 0 });
}

/** The day's reactions to the day's news: alerts first, then the clubs, the players and the fans. */
function react(state: GameState, facts: Fact[]): void {
  const table = standings(state);
  const s = social(state);
  for (const f of facts.filter((x) => x.value >= 30).sort((a, b) => b.value - a.value).slice(0, 30)) {
    const rng = rngFor(state.seed, `huddle:${f.id}`);
    const fam = f.family;
    const P = f.slots.P as Slots | undefined;
    const pid = f.players[0];
    // Reporters break transactions, injuries and league news first.
    const alert = ALERT[fam];
    if (alert && f.value >= (fam === "wire" ? 45 : 35) && f.kind !== "rumor") {
      const team = f.teams[0];
      const outlet = rng() < 0.55 ? "afw" : rng() < 0.6 ? "sideline" : `local:${team}`;
      const r = pickReporter(state, outlet, "insider", rng, team);
      if (r) post(state, { who: `@${r.name.replace(/[^A-Za-z]/g, "")}`, by: outletOf(r.outlet).name, kind: "press", team, text: say(pick(rng, alert), f.slots, rng), topic: P ? String(P.name) : TEAM_BY_ID[team]?.name });
    }
    for (const team of f.teams.filter((t) => TEAM_BY_ID[t])) {
      const m = moodOf(f, team);
      // Each club's fans move with the news, harder for bigger news.
      s.mood[team] = Math.max(0, Math.min(100, sentiment(state, team) + m * (2 + f.value / 12)));
      if (Math.abs(m) < 0.15 && fam !== "game") continue;
      const mood: Mood = m >= 0 ? "good" : "bad";
      const opp = f.teams.find((t) => t !== team);
      const extra: Slots = { O: opp && TEAM_BY_ID[opp] ? TEAM_BY_ID[opp].name : "", P, score: String(f.slots.score ?? ""), total: String(f.slots.total ?? ""), coach: String(f.slots.coach ?? "") };
      const voices = Math.min(5, 1 + Math.floor(f.value / 25) + (team === state.userTeam ? 2 : 0));
      for (let i = 0; i < voices; i++) fanPost(state, team, mood, rng, extra, NEWS_TAKE[fam]?.[mood]);
      if (fam === "game") post(state, { who: `@${TEAM_BY_ID[team].name.replace(/\W/g, "")}`, kind: "club", team, text: say(pick(rng, CLUB[mood === "good" ? "win" : "loss"]), { T: teamSlots(state, team, table), score: String(f.slots.score ?? "") }, rng) });
      if (fam === "signing" && rng() < 0.7) post(state, { who: `@${TEAM_BY_ID[team].name.replace(/\W/g, "")}`, kind: "club", team, text: say(pick(rng, CLUB.signing), f.slots, rng), topic: P ? String(P.name) : undefined });
    }
    // Players speak for themselves, the outgoing ones more than the rest.
    if (pid && PLAYER_BY_ID[pid]) {
      const pres = personality(pid).presence;
      const team = state.players[pid]?.team ?? f.teams[0];
      const slots: Slots = { T: team && TEAM_BY_ID[team] ? teamSlots(state, team, table) : undefined, score: String(f.slots.score ?? ""), O: "" };
      let kind: string | undefined;
      if (fam === "signing") kind = f.type === "sign.ext" ? "extended" : f.type === "sign.fa" ? "signed" : undefined;
      else if (fam === "injury" && f.type === "injury.season") kind = "hurt";
      else if (fam === "performance") kind = "big";
      else if (fam === "season" && f.tags.tribute) kind = "retired";
      if (kind && rng() < 0.35 + pres * 0.6) post(state, { who: handleOf(pid), kind: "player", team: team ?? undefined, player: pid, text: say(pick(rng, PLAYER[kind]), slots, rng), topic: PLAYER_BY_ID[pid].name });
    }
    // After a rivalry win, somebody on the winning side can't help himself.
    if (fam === "game" && f.tags.rival) {
      const star = (f.slots.star as Slots | undefined)?.id as string | undefined;
      const W = (f.slots.W as { id: string }).id, L = (f.slots.L as { id: string; nick: string }).nick;
      if (star && rng() < Math.max(0, personality(star).presence - personality(star).leadership + 0.3)) {
        post(state, { who: handleOf(star), kind: "player", team: W, player: star, text: say(pick(rng, PLAYER.trash), { O: `@${L.replace(/\W/g, "")}` }, rng), topic: PLAYER_BY_ID[star]?.name });
      }
    }
  }
}

/** Cryptic posts from players whose contract standoff or trade request just became a story. */
function cryptic(state: GameState): void {
  for (const a of arcState(state).list) {
    if (!a.player || a.ending || !["holdout", "tradeRequest", "contractYear"].includes(a.kind)) continue;
    const last = a.beats[a.beats.length - 1];
    if (!last || last.date !== state.date) continue;
    const rng = rngFor(state.seed, `huddle:cryptic:${a.id}:${a.beats.length}`);
    if (rng() > 0.25 + personality(a.player).presence * 0.6) continue;
    post(state, { who: handleOf(a.player), kind: "player", team: a.team, player: a.player, text: say(pick(rng, PLAYER.cryptic), {}, rng), topic: PLAYER_BY_ID[a.player]?.name });
    // Fans notice.
    fanPost(state, a.team, "bad", rng, { P: { name: PLAYER_BY_ID[a.player]?.name ?? "" } }, ["What does {P.name} mean by that?", "{P.name} posting like that is not a good sign."]);
  }
}

/** Ordinary chatter: some clubs' fans every day, ours more, more in season. */
function chatter(state: GameState): void {
  const rng = rngFor(state.seed, `huddle:chat:${state.date}`);
  const inSeason = state.date >= RULES.keyDates.regularSeasonStart && state.date <= RULES.keyDates.superBowl;
  const n = inSeason ? 8 : 4;
  for (let i = 0; i < n; i++) {
    const team = TEAMS[Math.floor(rng() * TEAMS.length)].id;
    fanPost(state, team, "chat", rng);
  }
  for (let i = 0; i < (inSeason ? 2 : 1); i++) fanPost(state, state.userTeam, "chat", rng);
}

/** Fan moods drift back toward what each club's record says, a little each day. */
function settle(state: GameState): void {
  const s = social(state);
  const table = standings(state);
  for (const t of TEAMS) {
    const r = table[t.id];
    const games = r ? r.w + r.l + r.t : 0;
    const base = games ? 25 + 50 * ((r.w + 0.5 * r.t) / games) : 50;
    s.mood[t.id] = Math.round((sentiment(state, t.id) * 0.95 + base * 0.05) * 10) / 10;
  }
}

/** What the Huddle is talking about: the most-posted topics of the last two days. */
export function trending(state: GameState, n = 8): { topic: string; posts: number }[] {
  const count = new Map<string, number>();
  for (const p of social(state).posts) {
    if (daysBetween(p.date, state.date) > 1) break;
    if (p.topic) count.set(p.topic, (count.get(p.topic) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([topic, posts]) => ({ topic, posts }));
}

/** The Huddle's day: reactions to the day's facts, cryptic posts, chatter, moods and our club's fan effects. */
export function socialDaily(state: GameState, facts: Fact[]): void {
  react(state, facts);
  cryptic(state);
  chatter(state);
  settle(state);
  const s = social(state);
  s.posts = s.posts.filter((p) => daysBetween(p.date, state.date) <= KEEP_DAYS).slice(0, KEEP);
  // Once a week our fans' mood online reaches the club: trust a little, pressure a little more.
  if (weekday(state.date) === "Monday") {
    const v = sentiment(state, state.userTeam);
    if (Math.abs(v - 50) >= 8) trustHit(state, Math.max(-0.5, Math.min(0.4, (v - 50) / 60)));
    state.pressure.fans = Math.max(0, Math.min(100, state.pressure.fans + Math.max(-1.5, Math.min(1.5, (50 - v) / 25))));
  }
}

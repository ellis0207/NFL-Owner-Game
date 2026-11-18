// Achievements: marks of an ownership worth remembering, earned in this save.
// Each one is a check against what the save already records (the seasons in
// history, honors, the books, the boardroom, the crossroads), so nothing here
// changes how the game plays. Checks run on Mondays and the day after the
// Super Bowl; an earned one stays earned, with the date and the difficulty it
// was earned on. Tutorial games don't earn any.
import { valuation } from "./business";
import { history } from "./seasons";
import { standings } from "./standings";
import { send } from "./inbox";
import { BASE_SEASON, RULES } from "./league";
import { addDays, weekday } from "./dates";
import type { GameState } from "./types";

export type AchievementGroup = "Football" | "Players" | "Roster building" | "Business" | "Ownership";

export interface Achievement {
  id: string;
  group: AchievementGroup;
  title: string;
  what: string;
  check: (state: GameState, c: Ctx) => boolean;
}

/** What the checks read, worked out once per pass. */
interface Ctx {
  us: string;
  /** Our seasons played in this save: [wins, losses, ties], division place, how far in the playoffs. */
  seasons: { season: number; w: number; l: number; place: number; went?: string }[];
  /** Players who have played for us in this save. */
  ours: Set<string>;
}

const M = 1_000_000;

function context(state: GameState): Ctx {
  const us = state.userTeam;
  const from = state.era?.start ?? BASE_SEASON;
  const seasons = history(state).seasons.filter((s) => s.season >= from && s.records[us]).map((s) => ({
    season: s.season, w: s.records[us][0], l: s.records[us][1], place: s.place[us] ?? 4, went: s.playoffs?.[us],
  }));
  const ours = new Set<string>();
  for (const [id, rows] of Object.entries(history(state).stats)) if (rows.some((r) => r.team === us)) ours.add(id);
  for (const [id, p] of Object.entries(state.players)) if (p.team === us) ours.add(id);
  return { us, seasons, ours };
}

const went = (c: Ctx, ...stages: string[]) => c.seasons.some((s) => s.went && stages.includes(s.went));

export const ACHIEVEMENTS: Achievement[] = [
  // ---- Football ----
  { id: "first-win", group: "Football", title: "Opening statement", what: "Win a regular-season game.", check: (s, c) => (standings(s)[c.us]?.w ?? 0) > 0 || c.seasons.some((x) => x.w > 0) },
  { id: "winning-season", group: "Football", title: "Above .500", what: "Finish a season with a winning record.", check: (_, c) => c.seasons.some((x) => x.w > x.l) },
  { id: "playoffs", group: "Football", title: "January football", what: "Make the playoffs.", check: (_, c) => c.seasons.some((x) => !!x.went) },
  { id: "division", group: "Football", title: "Hats and T-shirts", what: "Win the division.", check: (_, c) => c.seasons.some((x) => x.place === 1) },
  { id: "twelve", group: "Football", title: "Twelve and up", what: "Win at least 12 regular-season games.", check: (_, c) => c.seasons.some((x) => x.w >= 12) },
  { id: "turnaround", group: "Football", title: "Turnaround", what: "Win six more games than the season before.", check: (_, c) => c.seasons.some((x, i) => i > 0 && x.w - c.seasons[i - 1].w >= 6) },
  { id: "conference", group: "Football", title: "Conference champions", what: "Reach the Super Bowl.", check: (_, c) => went(c, "SB", "CHAMP") },
  { id: "champion", group: "Football", title: "World champions", what: "Win the Super Bowl.", check: (_, c) => went(c, "CHAMP") },
  { id: "repeat", group: "Football", title: "Back to back", what: "Win the Super Bowl two seasons running.", check: (_, c) => c.seasons.some((x, i) => i > 0 && x.went === "CHAMP" && c.seasons[i - 1].went === "CHAMP" && c.seasons[i - 1].season === x.season - 1) },
  { id: "dynasty", group: "Football", title: "Dynasty", what: "Win three Super Bowls.", check: (_, c) => c.seasons.filter((x) => x.went === "CHAMP").length >= 3 },
  { id: "ten-playoffs", group: "Football", title: "Perennial contender", what: "Make the playoffs five times.", check: (_, c) => c.seasons.filter((x) => !!x.went).length >= 5 },
  // ---- Players ----
  { id: "pro-bowl", group: "Players", title: "Pro Bowler", what: "Have a player picked for the Pro Bowl while he plays for you.", check: (s, c) => Object.values(s.honors?.proBowl ?? {}).some((ids) => ids.some((id) => s.players[id]?.team === c.us)) },
  { id: "all-pro", group: "Players", title: "First-team All-Pro", what: "Have a first-team All-Pro on the roster.", check: (s, c) => Object.values(s.honors?.allPro ?? {}).some((a) => a.first.some((id) => s.players[id]?.team === c.us)) },
  { id: "mvp", group: "Players", title: "Most valuable", what: "Have the league MVP.", check: (s, c) => Object.values(s.honors?.awards ?? {}).some((list) => list.some((a) => a.award === "MVP" && a.team === c.us)) },
  { id: "coy", group: "Players", title: "Coach of the Year", what: "Your head coach wins Coach of the Year.", check: (s, c) => Object.values(s.honors?.awards ?? {}).some((list) => list.some((a) => a.award === "COY" && a.team === c.us)) },
  { id: "draft-hit", group: "Players", title: "Scouting pays off", what: "A player your club drafted makes the Pro Bowl.", check: (s, c) => {
    const drafted = new Set(history(s).drafts.flatMap((d) => d.picks.filter((p) => p[1] === c.us).map((p) => p[0])));
    return Object.values(s.honors?.proBowl ?? {}).some((ids) => ids.some((id) => drafted.has(id)));
  } },
  { id: "late-gem", group: "Players", title: "Day-three gem", what: "A player your club took in round 4 or later makes the Pro Bowl.", check: (s, c) => {
    const late = new Set(history(s).drafts.flatMap((d) => d.picks.filter((p) => p[1] === c.us && p[2] >= 4).map((p) => p[0])));
    return Object.values(s.honors?.proBowl ?? {}).some((ids) => ids.some((id) => late.has(id)));
  } },
  { id: "hall", group: "Players", title: "Canton", what: "A player who played for your club is voted into the Hall of Fame.", check: (s, c) => Object.values(s.honors?.hof?.classes ?? {}).some((ids) => ids.some((id) => c.ours.has(id))) },
  // ---- Roster building ----
  { id: "trade", group: "Roster building", title: "Wheeler-dealer", what: "Complete a trade.", check: (s, c) => (s.trades?.log ?? []).some((t) => t.status === "done" && t.teams.includes(c.us)) },
  { id: "ten-trades", group: "Roster building", title: "Always on the phone", what: "Complete ten trades.", check: (s, c) => (s.trades?.log ?? []).filter((t) => t.status === "done" && t.teams.includes(c.us)).length >= 10 },
  { id: "pay-star", group: "Roster building", title: "Pay the man", what: "Choose to pay a star when the building was split on it.", check: (s) => (s.crossroads?.outcomes ?? []).some((o) => o.kind === "star" && o.choice === 0) },
  // ---- Business ----
  { id: "profit", group: "Business", title: "In the black", what: "Close a league year with operating income above zero.", check: (s) => (s.books?.closed ?? []).some((y) => y.operating > 0) },
  { id: "beat-budget", group: "Business", title: "Better than planned", what: "Close a year with revenue above the budget.", check: (s) => (s.books?.closed ?? []).some((y) => y.revenue > y.planRevenue) },
  { id: "billion", group: "Business", title: "Billion-dollar business", what: "Bring in $1 billion of revenue in a league year.", check: (s) => (s.books?.closed ?? []).some((y) => y.revenue >= 1000 * M) },
  { id: "value-up", group: "Business", title: "Value creator", what: "Raise the club's value by half from the day you took over.", check: (s) => !!s.achievements?.startValue && valuation(s, s.userTeam) >= s.achievements.startValue * 1.5 },
  { id: "garage", group: "Business", title: "Room to park", what: "Build a parking garage.", check: (s) => (s.grounds?.garages ?? []).length > 0 },
  { id: "stadium", group: "Business", title: "Ribbon cutting", what: "Open a new stadium.", check: (s, c) => (s.construction?.opened ?? []).some((n) => n.team === c.us) },
  // ---- Ownership ----
  { id: "pledges", group: "Ownership", title: "A man of his word", what: "Keep three pledges to the board.", check: (s) => (s.boardroom?.kept ?? 0) >= 3 },
  { id: "proven-right", group: "Ownership", title: "Proven right", what: "A season later, the letter says you made the right call over someone's objection.", check: (s) => (s.crossroads?.outcomes ?? []).some((o) => o.right === o.choice && o.sides.some((x) => x.side !== o.choice)) },
  { id: "trusted", group: "Ownership", title: "Trusted", what: "Earn the GM's complete trust.", check: (s) => (s.culture?.gmTrust ?? 0) >= 75 },
  { id: "beloved", group: "Ownership", title: "The people's owner", what: "Fans' trust in you reaches 80.", check: (s) => (s.fans?.trust ?? 0) >= 80 },
  { id: "five-seasons", group: "Ownership", title: "Settled in", what: "Own the club for five seasons.", check: (_, c) => c.seasons.length >= 5 },
  { id: "ten-seasons", group: "Ownership", title: "A decade at the top", what: "Own the club for ten seasons.", check: (_, c) => c.seasons.length >= 10 },
  { id: "hard-title", group: "Ownership", title: "Hall of Fame owner", what: "Win a Super Bowl on the hardest difficulty.", check: (s, c) => s.settings.difficulty === "legend" && went(c, "CHAMP") },
];

export const ACHIEVEMENT_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Check every achievement not yet earned; returns the ones earned now. */
export function checkAchievements(state: GameState): Achievement[] {
  if (state.tutorial) return [];
  const a = (state.achievements ??= { earned: {} });
  a.startValue ??= valuation(state, state.userTeam);
  const c = context(state);
  const now: Achievement[] = [];
  for (const x of ACHIEVEMENTS) {
    if (a.earned[x.id]) continue;
    let ok = false;
    try { ok = x.check(state, c); } catch { ok = false; }
    if (!ok) continue;
    a.earned[x.id] = { date: state.date, difficulty: state.settings.difficulty ?? "standard" };
    now.push(x);
  }
  if (now.length) send(state, "league", "Achievements", now.length === 1 ? `Achievement: ${now[0].title}` : `${now.length} achievements`, now.map((x) => `${x.title}: ${x.what}`).join("\n"));
  return now;
}

export function achievementsDaily(state: GameState): void {
  if (weekday(state.date) === "Monday" || state.date === addDays(RULES.keyDates.superBowl, 1) || !state.achievements) checkAchievements(state);
}

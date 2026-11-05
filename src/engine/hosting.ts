// Bids to host the Super Bowl and the draft. At the annual league meeting
// the owners award the Super Bowl about four years out and the draft about
// two years out. Super Bowls go to domes and warm-weather stadiums; the draft
// moves around the league. A newer building, a bigger market, finished
// stadium upgrades, a bigger bid package and goodwill with the other owners
// all help. Hosting doesn't pay much directly (the league runs the game), but
// the week puts the team in front of the whole country: the team store sells
// more all year, sponsors pay more, and fans are proud of it. The Super Bowl
// takes over the stadium for the four weeks before the game.
//
// Real awards are kept: Super Bowl LXI (2026 season) at SoFi Stadium, LXII
// (2027) in Atlanta, the 2026 draft in Pittsburgh and 2027 in Washington.
// Seasons in between that the league hasn't awarded follow the usual rotation
// (calendar.ts) until the owners vote on them in this save.
import { bindSuperBowlAwards } from "./calendar";
import { addDays, shortDate } from "./dates";
import { inflation, post } from "./business";
import { money, news, send } from "./inbox";
import { RULES, TEAMS, TEAM_BY_ID } from "./league";
import { MEDIA_BY_ID, addStory } from "./outlets";
import { owners } from "./owners";
import { projects } from "./projects";
import { gaussian, rngFor } from "./rng";
import { MARKETS, STADIUM_BY_TEAM } from "./stadiums";
import type { GameState, HostAward, HostingState } from "./types";

const M = 1_000_000;

/** Super Bowls the league has already awarded, by season. */
const REAL_SB: Record<number, { team: string }> = { 2026: { team: "LA" }, 2027: { team: "ATL" } };
const REAL_DRAFT: Record<number, string> = { 2026: "Pittsburgh", 2027: "Washington, D.C." };

/** How far ahead each award is made, from the league year of the meeting. */
const SB_AHEAD = 3; // the March 2027 meeting awards the 2030 season's game (played February 2031)
const DRAFT_AHEAD = 2;

// Open-air stadiums warm enough in February.
const WARM = new Set(["MIA", "TB", "SF", "JAX"]);

export const BID_LEVELS = [
  { label: "Standard bid", sb: 2 * M, draft: 0.75 * M, boost: 0 },
  { label: "Major bid (host committee incentives, hotel blocks, events)", sb: 6 * M, draft: 2.5 * M, boost: 0.4 },
] as const;

export function hosting(state: GameState): HostingState {
  return (state.hosting ??= { sb: {}, draft: {}, bids: {} });
}

/** Puts this save's Super Bowl awards into the calendar (call when a save is applied and after each award). */
export function bindHosts(state: GameState): void {
  const out: Record<number, { stadium: string; city: string }> = {};
  for (const [season, a] of Object.entries(state.hosting?.sb ?? {})) {
    out[Number(season)] = { stadium: STADIUM_BY_TEAM[a.team].name, city: a.city };
  }
  bindSuperBowlAwards(out);
}

export function canHostSuperBowl(team: string): boolean {
  const s = STADIUM_BY_TEAM[team];
  if (!s || s.structure === "tenant" || s.capacity < 60_000) return false;
  return s.roof !== "open" || WARM.has(team);
}

/** The awards the owners vote on at this spring's meeting. */
export function upcomingVotes(state: GameState): { sbSeason: number; draftYear: number } {
  const year = RULES.season + 1;
  const h = hosting(state);
  let draftYear = year + 1;
  while (h.draft[draftYear] || REAL_DRAFT[draftYear]) draftYear++;
  return { sbSeason: year + SB_AHEAD, draftYear: Math.min(draftYear, year + DRAFT_AHEAD) };
}

function hostedRecently(state: GameState, team: string, season: number): boolean {
  const h = hosting(state);
  for (let s = season - 4; s <= season + 4; s++) {
    if (h.sb[s]?.team === team || REAL_SB[s]?.team === team) return true;
  }
  return false;
}

function draftedRecently(state: GameState, team: string, year: number): boolean {
  const h = hosting(state);
  const city = TEAM_BY_ID[team].city;
  for (let y = year - 6; y <= year + 6; y++) if (h.draft[y]?.team === team || REAL_DRAFT[y]?.startsWith(city)) return true;
  return false;
}

/** How strong a bid looks to the room. */
function bidScore(state: GameState, team: string, kind: "sb" | "draft", level: number, key: string): number {
  const s = STADIUM_BY_TEAM[team];
  const rng = rngFor(state.seed, `hostbid:${key}:${team}`);
  let score = (MARKETS[team].pull - 1) * 1.5 + gaussian(rng) * 0.35 + BID_LEVELS[level].boost;
  if (kind === "sb") score += s.opened >= 2015 ? 0.5 : s.opened >= 2000 ? 0.2 : 0;
  if (team === state.userTeam) {
    const done = projects(state).filter((p) => p.opened && ["boards", "wifi", "concourse", "seats", "clubs"].includes(p.id)).length;
    score += Math.min(0.5, done * 0.15);
    const rel = Object.values(owners(state).relations);
    score += rel.length ? (rel.reduce((a, r) => a + r.rapport, 0) / rel.length / 100) * 0.8 : 0;
  }
  return score;
}

export function bidWindow(state: GameState): { open: boolean; closes: string } {
  const m = RULES.keyDates.annualLeagueMeeting;
  const closes = addDays(m, -7);
  return { open: state.date >= addDays(m, -42) && state.date <= closes && state.date > RULES.keyDates.superBowl, closes };
}

/** The owner enters a bid. Returns an error, or null. */
export function submitBid(state: GameState, kind: "sb" | "draft", level: number): string | null {
  const us = state.userTeam;
  const w = bidWindow(state);
  if (!w.open) return "Bids are taken in the six weeks before the annual league meeting.";
  if (kind === "sb" && !canHostSuperBowl(us)) return "Super Bowls go to domed and warm-weather stadiums the team controls; ours doesn't qualify.";
  const v = upcomingVotes(state);
  if (kind === "sb" && hostedRecently(state, us, v.sbSeason)) return "We're hosting too recently to be considered.";
  if (kind === "draft" && draftedRecently(state, us, v.draftYear)) return "The draft was here too recently to come back so soon.";
  const h = hosting(state);
  if (h.bids[kind]) return "Our bid is already in.";
  const fee = BID_LEVELS[level][kind] * inflation(RULES.season + 1, 0.03);
  post(state, "bids", -fee, kind === "sb" ? "Super Bowl bid" : "Draft bid");
  h.bids[kind] = { level, date: state.date };
  return null;
}

function award(state: GameState, kind: "sb" | "draft", key: number): HostAward {
  const h = hosting(state);
  const us = state.userTeam;
  const eligible = TEAMS.map((t) => t.id).filter((t) => kind === "sb" ? canHostSuperBowl(t) && !hostedRecently(state, t, key) : !draftedRecently(state, t, key));
  const rng = rngFor(state.seed, `hostfield:${kind}:${key}`);
  // Three or four cities make a serious run at each one.
  const field = eligible.filter((t) => t !== us).sort(() => rng() - 0.5).slice(0, 3 + Math.floor(rng() * 2));
  if (h.bids[kind] && eligible.includes(us)) field.push(us);
  const scored = field.map((t) => ({ t, v: bidScore(state, t, kind, t === us ? h.bids[kind]!.level : rng() < 0.4 ? 1 : 0, `${kind}${key}`) }))
    .sort((a, b) => b.v - a.v);
  const win = scored[0].t;
  const ballots = scored.length > 2 && scored[0].v - scored[1].v < 0.3 ? 2 : 1;
  return { team: win, city: TEAM_BY_ID[win].city, bidders: scored.map((x) => x.t), votes: 24 + Math.floor(rng() * 7), ballots, ours: field.includes(us) };
}

function holdHostVotes(state: GameState): void {
  const h = hosting(state);
  const v = upcomingVotes(state);
  const results: string[] = [];
  if (!h.sb[v.sbSeason] && !REAL_SB[v.sbSeason]) {
    const a = (h.sb[v.sbSeason] = award(state, "sb", v.sbSeason));
    results.push(`the ${superBowlTitle(v.sbSeason)} to ${a.city}`);
    hostNews(state, "sb", v.sbSeason, a);
  }
  if (!h.draft[v.draftYear] && !REAL_DRAFT[v.draftYear]) {
    const a = (h.draft[v.draftYear] = award(state, "draft", v.draftYear));
    results.push(`the ${v.draftYear} draft to ${a.city}`);
    hostNews(state, "draft", v.draftYear, a);
  }
  h.bids = {};
  bindHosts(state);
  if (results.length) news(state, `Owners award ${results.join(" and ")}`);
}

function superBowlTitle(season: number): string {
  return `Super Bowl after the ${season} season`;
}

function hostNews(state: GameState, kind: "sb" | "draft", key: number, a: HostAward): void {
  const us = state.userTeam;
  const what = kind === "sb" ? `the Super Bowl after the ${key} season` : `the ${key} NFL Draft`;
  const others = a.bidders.filter((t) => t !== a.team).map((t) => TEAM_BY_ID[t].city);
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "league", teams: [a.team],
    headline: `${a.city} lands ${what}`,
    body: `The owners voted ${a.city} the host of ${what}${a.ballots > 1 ? " on a second ballot" : ""}, ${a.votes} votes in favor` +
      (others.length ? `, ahead of bids from ${others.join(", ")}.` : ".") +
      (kind === "sb" ? ` ${STADIUM_BY_TEAM[a.team].name} gets the game.` : " Draft week has become one of the league's biggest fan events."),
  });
  if (!a.ours) return;
  if (a.team === us) {
    state.pressure.fans = Math.min(100, state.pressure.fans + (kind === "sb" ? 4 : 3));
    send(state, "league", "League Office", `We won the ${kind === "sb" ? "Super Bowl" : "draft"} bid`,
      `The owners awarded ${what} to ${a.city}. ` + (kind === "sb"
        ? "Expect a boost to the team store and sponsor interest that season, and plan on the league taking over the stadium for the four weeks before the game."
        : "Draft week will put the team in front of the whole league; the team store and our sponsors will feel it."));
  } else {
    send(state, "league", "League Office", `Our ${kind === "sb" ? "Super Bowl" : "draft"} bid fell short`,
      `The owners went with ${a.city} for ${what}. We can bid again next year.`);
  }
}

// ---- What hosting does ----

/** The season whose Super Bowl a team hosts (played in February after it), if it's this one. */
function hostingSuperBowl(state: GameState, team: string): boolean {
  const s = RULES.season;
  return (state.hosting?.sb[s]?.team ?? REAL_SB[s]?.team) === team;
}

function hostingDraft(state: GameState, team: string): boolean {
  return state.hosting?.draft[RULES.season + 1]?.team === team;
}

/** Fan engagement in a hosting year: team store sales, ticket demand and sponsor interest. */
export function hostEffects(state: GameState, team: string): { merch: number; demand: number; sponsor: number } {
  const sb = hostingSuperBowl(state, team);
  const draft = hostingDraft(state, team);
  return {
    merch: 1 + (sb ? 0.25 : 0) + (draft ? 0.12 : 0),
    demand: 1 + (sb ? 0.02 : 0) + (draft ? 0.01 : 0),
    sponsor: (sb ? 0.04 : 0) + (draft ? 0.02 : 0),
  };
}

/** The league takes over a Super Bowl stadium for the four weeks before the game. */
export function hostBlackout(state: GameState, team: string, date: string): boolean {
  if (!hostingSuperBowl(state, team)) return false;
  const sb = RULES.keyDates.superBowl;
  return date >= addDays(sb, -28) && date <= addDays(sb, 2);
}

export function hostingDaily(state: GameState): void {
  const k = RULES.keyDates;
  const us = state.userTeam;
  if (state.date === addDays(k.annualLeagueMeeting, 2)) holdHostVotes(state);
  if (state.date === addDays(k.annualLeagueMeeting, -42)) {
    const v = upcomingVotes(state);
    send(state, "league", "League Office", "Hosting bids are open",
      `Cities can bid for the ${superBowlTitle(v.sbSeason)} and the ${v.draftYear} draft until ${shortDate(bidWindow(state).closes)}; the owners vote at the annual meeting. ` +
      (canHostSuperBowl(us) ? "Our stadium qualifies for the Super Bowl." : "Our stadium doesn't qualify for a Super Bowl, but any city can host the draft.") + " Bids are on the Owners page.");
  }
  // Super Bowl week and draft week: the team store and the city's events.
  if (state.date === k.superBowl && hostingSuperBowl(state, us)) {
    const x = inflation(RULES.season, 0.04);
    post(state, "hosting", 9 * M * x, "Super Bowl week: team store, events and the host fee");
    state.pressure.fans = Math.min(100, state.pressure.fans + 5);
    send(state, "business", "Business office", "Super Bowl week",
      `The city was full all week. Super Bowl week brought in about ${money(9 * M * x)} through the team store, our events and the league's host fee, and the fan surveys have never been better.`);
  }
  if (state.date === k.draftStart && hostingDraft(state, us)) {
    const x = inflation(RULES.season, 0.04);
    post(state, "hosting", 4 * M * x, "Draft week: team store and fan events");
    state.pressure.fans = Math.min(100, state.pressure.fans + 4);
  }
}

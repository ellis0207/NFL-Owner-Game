// The league office and how the owners govern: a commissioner (made up, with
// a contract the owners renew or don't), the standing committees whose
// members shape what reaches the floor, coalitions owners form issue by issue,
// the office's briefings on what a proposal costs and how hard it is to run,
// technology trials before a vote, and for seasons after 2026 the schedule
// moves the league makes in season: Sunday-night flex and emergency moves for
// weather or a failing stadium.
//
// Owners' leanings on each issue, the commissioner and the committee rosters
// are made up. The rules they follow (24 votes, flex windows, the commissioner's
// powers next to the owners') follow the league's constitution and practice.
import { addDays, shortDate } from "./dates";
import { faultFactor } from "./facilities";
import { FORMAT } from "./format";
import { money, news, send } from "./inbox";
import { BASE_SEASON, GAMES_BY_DATE, RULES, SCHEDULE, TEAMS, TEAM_BY_ID, reindexSchedule, teamLabel } from "./league";
import { marketIndex } from "./leaguemoney";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { gaussian, rngFor } from "./rng";
import { ISSUES, RULE_BY_ID, RULE_CATALOG, type Issue } from "./rules";
import { standings } from "./standings";
import type { Committee, GameState, LeagueOfficeState, RuleProposal } from "./types";

export const COMMITTEES: Record<Committee, { label: string; what: string; issues: Issue[] }> = {
  competition: { label: "Competition Committee", what: "Playing rules, rosters, officiating and safety technology: it writes most proposals and runs the trials.", issues: ["competition", "rosters", "technology"] },
  finance: { label: "Finance Committee", what: "Revenue sharing, league costs, audits of distributions and club debt.", issues: ["money"] },
  media: { label: "Media and Broadcast Committee", what: "The national TV deals and the season's shape and schedule the networks buy.", issues: ["scheduling"] },
  stadium: { label: "Stadium Committee", what: "Stadium projects, league stadium loans and Super Bowl sites.", issues: [] },
  international: { label: "International Committee", what: "Games abroad and the clubs' overseas marketing areas.", issues: ["international"] },
};

/** Who decides what: the commissioner's powers next to the owners' votes. */
export const POWERS: { who: string; what: string }[] = [
  { who: "The commissioner", what: "Discipline of players, staff and clubs (fines, suspensions, lost picks), integrity investigations, the schedule and in-season moves, officiating, and conduct that hurts the league." },
  { who: "The owners (24 of 32 votes)", what: "Playing rules and policies, the season's length and byes, revenue sharing, approving media deals, the commissioner's contract, new owners and relocation." },
  { who: "The players' union", what: "Pay, benefits and working conditions under the labor agreement. Changes there need the union's agreement, not just the owners'." },
];

const COMMITTEE_SIZE = 7;
/** League revenue a change would bring in: every owner gets a share of it, rivals or not. */
const GROWTH: Record<string, number> = { games18: 0.18, secondBye: 0.08, intlMore: 0.07, games17: -0.12, oneBye: -0.05, intlFewer: -0.04 };

export function leagueOffice(state: GameState): LeagueOfficeState {
  if (state.leagueOffice) return state.leagueOffice;
  const rng = rngFor(state.seed, "commissioner");
  const name = `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
  const committees = {} as Record<Committee, string[]>;
  for (const c of Object.keys(COMMITTEES) as Committee[]) {
    const r = rngFor(state.seed, `committee:${c}`);
    committees[c] = TEAMS.filter((t) => t.id !== state.userTeam).map((t) => ({ id: t.id, v: r() + (state.owners?.relations[t.id]?.influence ?? 0.3) })).sort((a, b) => b.v - a.v).slice(0, COMMITTEE_SIZE).map((x) => x.id);
  }
  state.leagueOffice = {
    commissioner: { name, since: 2019, through: 2028, approval: 62 },
    committees, coalitions: [], trials: {}, moves: [], log: [],
  };
  return state.leagueOffice;
}

/** The committee whose remit covers an issue. */
export function committeeFor(issue: Issue): Committee {
  return (Object.keys(COMMITTEES) as Committee[]).find((c) => COMMITTEES[c].issues.includes(issue)) ?? "competition";
}

export function onCommittee(state: GameState, c: Committee): boolean {
  return !!state.leagueOffice?.committees[c].includes(state.userTeam);
}

/**
 * Where an owner stands on an issue regardless of any one proposal, -1 (keep
 * things as they are) to 1 (for change). Made up and fixed per save; on money,
 * big markets lean against sharing more.
 */
export function issueStance(state: GameState, team: string, issue: Issue): number {
  const base = gaussian(rngFor(state.seed, `stance:${team}:${issue}`)) * 0.45;
  return Math.max(-1, Math.min(1, base));
}

/** How strongly the league's other owners rate ours for a seat: tenure, standing with the league office and with them. */
export function seatScore(state: GameState): number {
  const rel = Object.values(state.owners?.relations ?? {});
  const rapport = rel.length ? rel.reduce((t, r) => t + r.rapport, 0) / rel.length : 0;
  const tenure = Math.max(0, RULES.season - BASE_SEASON);
  const league = state.standing?.league ?? 60;
  return 0.25 + tenure * 0.12 + (league - 60) / 80 + rapport / 60;
}

/** Ask the commissioner for a seat on a committee; appointments are made after the draft. */
export function askForSeat(state: GameState, c: Committee): string | null {
  const lo = leagueOffice(state);
  if (onCommittee(state, c)) return "We already sit on that committee.";
  if (Object.values(lo.committees).filter((m) => m.includes(state.userTeam)).length >= 2) return "Owners sit on two committees at most.";
  lo.seatAsk = c;
  return `The commissioner's office has your request for the ${COMMITTEES[c].label}. Appointments come out after the draft.`;
}

/** After the draft the commissioner rotates a seat or two on each committee and answers requests. */
function reshuffle(state: GameState): void {
  const lo = leagueOffice(state);
  const rng = rngFor(state.seed, `reshuffle:${RULES.season}`);
  const us = state.userTeam;
  for (const c of Object.keys(COMMITTEES) as Committee[]) {
    const members = lo.committees[c];
    const others = members.filter((t) => t !== us);
    if (others.length && rng() < 0.6) {
      const out = others[Math.floor(rng() * others.length)];
      const pool = TEAMS.map((t) => t.id).filter((t) => t !== us && !members.includes(t));
      lo.committees[c] = [...members.filter((t) => t !== out), pool[Math.floor(rng() * pool.length)]];
    }
  }
  if (lo.seatAsk) {
    const c = lo.seatAsk;
    delete lo.seatAsk;
    const yes = rng() < Math.max(0.05, Math.min(0.9, seatScore(state)));
    if (yes) {
      const m = lo.committees[c];
      lo.committees[c] = [...m.slice(1), us];
      lo.log.unshift({ date: state.date, text: `Appointed to the ${COMMITTEES[c].label}` });
      send(state, "league", "Commissioner's Office", `Your appointment to the ${COMMITTEES[c].label}`,
        `The commissioner has appointed you to the ${COMMITTEES[c].label}. ${COMMITTEES[c].what} Members can bring a proposal to the floor in the committee's name and argue its recommendation on proposals in its area.`);
    } else {
      send(state, "league", "Commissioner's Office", "Committee appointments", `The ${COMMITTEES[c].label} is full this year. Owners who have been in the league longer and have the office's confidence usually get the seats; ask again next year.`);
    }
  }
}

// ---- Proposals: committee positions, amendments, briefings ----

/** Our committee's position on a proposal in its area: members weigh our view, they don't simply take it. */
export function argueCommittee(state: GameState, p: RuleProposal, stand: "for" | "against"): string | null {
  const c = RULE_BY_ID[p.rule];
  const com = committeeFor(c.issue);
  if (!onCommittee(state, com)) return `Only members of the ${COMMITTEES[com].label} can argue its position.`;
  if (p.votes) return "The vote has happened.";
  if (p.argued) return "You've already made the case in committee.";
  p.argued = true;
  const lo = leagueOffice(state);
  const rel = state.owners?.relations ?? {};
  const members = lo.committees[com].filter((t) => t !== state.userTeam);
  const warmth = members.reduce((t, m) => t + (rel[m]?.rapport ?? 0), 0) / Math.max(1, members.length);
  const odds = 0.45 + warmth / 120 + (p.committee === stand ? 0.4 : 0);
  if (rngFor(state.seed, `argue:${p.id}`)() < odds) {
    p.committee = stand;
    return `The committee agreed: its recommendation is now "${stand}".`;
  }
  return "The committee heard you out and kept its recommendation.";
}

/** Bring a proposal to the floor in our committee's name (one per meeting). */
export function committeeProposal(state: GameState, rule: string, proposable: string[], meeting: { proposals: RuleProposal[]; year: number; deadline: string; done?: boolean }): string | null {
  const c = RULE_BY_ID[rule];
  if (!c) return "No such proposal.";
  const com = committeeFor(c.issue);
  if (!onCommittee(state, com)) return `That's for the ${COMMITTEES[com].label}, and we don't sit on it.`;
  if (meeting.done || state.date > meeting.deadline) return "The deadline for proposals has passed.";
  if (meeting.proposals.some((p) => p.viaUs)) return "We've already brought a committee proposal this year.";
  if (!proposable.includes(rule)) return "That can't be proposed right now.";
  meeting.proposals.push({ id: `${meeting.year}:${rule}`, rule, sponsor: "committee", committee: "for", lobby: {}, ourVote: true, viaUs: true });
  news(state, `The ${COMMITTEES[com].label} proposes: ${c.title.toLowerCase()}`);
  return null;
}

/** Narrow a proposal to a one-season trial: fewer owners object to something they can undo. */
export function amendProposal(state: GameState, p: RuleProposal): string | null {
  if (p.votes) return "The vote has happened.";
  if (p.amended) return "It's already been narrowed to a trial.";
  if (p.sponsor !== state.userTeam && !p.viaUs) return "Only the sponsor can amend a proposal.";
  p.amended = true;
  return "Amended: it would now apply for one season as a trial, and come back to the owners to be made permanent.";
}

/** The league office's read on a proposal: cost to each club, how hard it is to put in place, and what it touches. */
export function briefing(state: GameState, p: RuleProposal): string {
  if (p.briefing) return p.briefing;
  const c = RULE_BY_ID[p.rule];
  const cost = c.cost ? c.cost(state) : 0;
  const diff = c.difficulty ?? "low";
  const touches: Record<Issue, string> = {
    competition: "Officials' training and the replay center.",
    scheduling: "The calendar, every club's schedule, player pay periods and per-game bonuses, and the national TV contracts.",
    money: "Every club's distributions and local revenue; the audit committee would need new reporting.",
    international: "Club travel, home games given up, and the league's overseas offices.",
    technology: "Equipment managers, medical staff and the replay center; the trial results are in the committee's report.",
    rosters: "Roster rules, the salary cap and the waiver system.",
  };
  const growth = GROWTH[p.rule];
  p.briefing = `League office briefing on "${c.title}". ${c.what} ` +
    `Estimated effect on each club: ${cost === 0 ? "negligible" : `${cost > 0 ? "a cost of" : "a gain of"} about ${money(Math.abs(cost))} a year`} (an estimate). ` +
    `Difficulty to put in place: ${diff}. It touches: ${touches[c.issue]}` +
    (growth ? ` League revenue would ${growth > 0 ? "grow" : "shrink"}, and every club's share with it.` : "") +
    (p.amended ? " As amended, it lapses after one season unless the owners make it permanent." : "");
  return p.briefing;
}

/** What a proposal would add to league revenue, which every owner shares (positive for growth). */
export function leagueGrowth(rule: string): number {
  return GROWTH[rule] ?? 0;
}

// ---- Coalitions ----

/** Owners who'd stand with us on an issue: they lean our way on it and don't dislike us. */
export function coalitionCandidates(state: GameState, issue: Issue): string[] {
  const rel = state.owners?.relations ?? {};
  const mine = issueStance(state, state.userTeam, issue);
  return Object.keys(rel).filter((t) => rel[t].rapport > -10 && !rel[t].rival && Math.sign(issueStance(state, t, issue)) === Math.sign(mine || 1)).sort((a, b) => rel[b].rapport - rel[a].rapport);
}

/** Form (or refresh) a coalition on one issue: its members back our side on that issue only. */
export function formCoalition(state: GameState, issue: Issue): string {
  const lo = leagueOffice(state);
  const cands = coalitionCandidates(state, issue).slice(0, 8);
  const rng = rngFor(state.seed, `coalition:${issue}:${state.date}`);
  const rel = state.owners!.relations;
  const members = cands.filter((t) => rng() < 0.45 + rel[t].rapport / 80 + Math.abs(issueStance(state, t, issue)) * 0.3);
  lo.coalitions = lo.coalitions.filter((c) => c.issue !== issue);
  if (!members.length) return `Nobody would sign on for ${ISSUES[issue].toLowerCase()} right now.`;
  lo.coalitions.push({ issue, members, formed: state.date });
  return `${members.length} club${members.length > 1 ? "s" : ""} joined our coalition on ${ISSUES[issue].toLowerCase()}: ${members.map(teamLabel).join(", ")}. They'll vote our way on that issue, and only that one.`;
}

export function endCoalition(state: GameState, issue: string): void {
  const lo = leagueOffice(state);
  lo.coalitions = lo.coalitions.filter((c) => c.issue !== issue);
}

/** How an owner's vote moves from the issue itself, our coalition on it and league growth (owners.ts adds this to its lean). */
export function issuePull(state: GameState, p: RuleProposal, team: string): number {
  const c = RULE_BY_ID[p.rule];
  let s = 0.12 * issueStance(state, team, c.issue) + 0.6 * leagueGrowth(p.rule);
  const co = state.leagueOffice?.coalitions.find((x) => x.issue === c.issue);
  if (co?.members.includes(team) && p.ourVote !== undefined) s += (p.ourVote ? 1 : -1) * 0.3;
  if (p.amended) s += 0.06 + 0.4 * c.change * 0.35;
  if (p.revised) s += 0.04;
  return s;
}

// ---- Technology trials ----

/** Whether a technology has been through its trial season. */
export function trialDone(state: GameState, trial: string): boolean {
  const y = state.leagueOffice?.trials[trial];
  return y !== undefined && y < RULES.season + 1;
}

/** In the preseason the Competition Committee tries one technology in real games and reports. */
function runTrial(state: GameState): void {
  const lo = leagueOffice(state);
  const untried = RULE_CATALOG.filter((r) => r.trial && lo.trials[r.trial] === undefined);
  if (!untried.length) return;
  const rng = rngFor(state.seed, `trial:${RULES.season}`);
  if (rng() > 0.6) return;
  const t = untried[Math.floor(rng() * untried.length)];
  lo.trials[t.trial!] = RULES.season;
  const verdict = rng() < 0.7 ? "worked well enough to bring to a vote" : "had problems the committee wants fixed, but it can still be proposed";
  lo.log.unshift({ date: state.date, text: `Preseason trial: ${t.title.toLowerCase()}. It ${verdict}.` });
  news(state, `The Competition Committee tests a new system in preseason games: ${t.title.toLowerCase()}`);
}

// ---- The commissioner ----

/** The owners' view of the commissioner moves with the league's money, its peace and its scandals. */
function commissionerDrift(state: GameState): void {
  const lo = leagueOffice(state);
  const sanctions = (state.compliance?.leagueCases ?? []).filter((c) => c.year === RULES.season && c.sanction).length;
  const renewals = (state.leagueMoney?.tv.renewals ?? []).filter((r) => r.from === RULES.season + 1);
  const target = 62 + renewals.reduce((t, r) => t + (r.factor - 1) * 120, 0) - sanctions * 2;
  lo.commissioner.approval = Math.round(lo.commissioner.approval + (target - lo.commissioner.approval) * 0.2);
}

/** Our vote on extending the commissioner's contract, if it's up. */
export function voteCommissioner(state: GameState, yes: boolean): void {
  const r = leagueOffice(state).commissioner.renewal;
  if (r && r.passed === undefined) r.ourVote = yes;
}

function commissionerVote(state: GameState): void {
  const lo = leagueOffice(state);
  const c = lo.commissioner;
  const r = c.renewal;
  if (!r || r.passed !== undefined) return;
  const rel = state.owners?.relations ?? {};
  let yes = r.ourVote ?? true ? 1 : 0;
  for (const t of Object.keys(rel)) {
    const lean = (c.approval - 50) / 30 + gaussian(rngFor(state.seed, `commish:${t}:${r.year}`)) * 0.6;
    if (lean > 0) yes++;
  }
  r.yes = yes;
  r.passed = yes >= 24;
  if (r.passed) {
    c.through += 5;
    news(state, `Owners extend Commissioner ${c.name} through ${c.through} (${yes}-${32 - yes})`);
  } else {
    const rng = rngFor(state.seed, `newcommish:${r.year}`);
    const name = `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
    news(state, `Owners decline to extend Commissioner ${c.name}; ${name} is chosen to succeed`);
    lo.commissioner = { name, since: r.year, through: r.year + 5, approval: 60 };
  }
  lo.log.unshift({ date: state.date, text: `Commissioner's contract vote: ${yes}-${32 - yes}${r.passed ? ", extended" : ", not extended"}` });
}

// ---- In-season schedule moves (seasons after 2026) ----

function winPct(state: GameState, team: string): number {
  const r = standings(state)[team];
  const g = r ? r.w + r.l + r.t : 0;
  return g ? (r!.w + r!.t / 2) / g : 0.5;
}

/**
 * Sunday-night flex: twelve days ahead the league can swap a better afternoon
 * game into Sunday night, twice between weeks 5 and 10 and as often as it
 * likes after that.
 */
export function flex(state: GameState): void {
  const lo = leagueOffice(state);
  const sunday = new Date(Date.parse(state.date + "T12:00:00Z") + 12 * 86400000).toISOString().slice(0, 10);
  const games = (GAMES_BY_DATE[sunday] ?? []).filter((g) => g.type === "REG" && !g.neutral);
  const night = games.find((g) => g.timeET === "20:20");
  if (!night || night.week === undefined || night.week < 5) return;
  const early = lo.moves.filter((m) => m.kind === "flex" && m.date.slice(0, 4) === String(RULES.season) && (SCHEDULE.find((g) => g.id === m.game)?.week ?? 99) <= 10).length;
  if (night.week <= 10 && early >= 2) return;
  const score = (g: typeof night) => winPct(state, g.home!) + winPct(state, g.away!) + (marketIndex(g.home!) + marketIndex(g.away!) - 2) * 0.15;
  const best = games.filter((g) => g !== night && g.timeET >= "13:00" && g.timeET < "19:00").sort((a, b) => score(b) - score(a))[0];
  if (!best || score(best) < score(night) + 0.35) return;
  const t = best.timeET;
  best.timeET = night.timeET;
  night.timeET = t;
  const text = `${teamLabel(best.away!)} at ${teamLabel(best.home!)} flexed into Sunday night on ${shortDate(sunday)}; ${teamLabel(night.away!)} at ${teamLabel(night.home!)} moves to ${t === "13:00" ? "1 p.m." : "the afternoon"}.`;
  lo.moves.unshift({ game: best.id, date: state.date, kind: "flex", text });
  news(state, text);
  if ([best.home, best.away, night.home, night.away].includes(state.userTeam)) send(state, "league", "League Office", "Schedule change: Sunday night flex", text);
}

/** Each club's home state, so a game moved to its stadium reads as a domestic site. */
const STATE: Record<string, string> = {
  BUF: "NY", MIA: "FL", NE: "MA", NYJ: "NJ", NYG: "NJ", BAL: "MD", CIN: "OH", CLE: "OH", PIT: "PA", HOU: "TX", IND: "IN", JAX: "FL", TEN: "TN",
  DEN: "CO", KC: "MO", LV: "NV", LAC: "CA", LA: "CA", DAL: "TX", PHI: "PA", WAS: "MD", CHI: "IL", DET: "MI", GB: "WI", MIN: "MN",
  ATL: "GA", CAR: "NC", NO: "LA", TB: "FL", ARI: "AZ", SF: "CA", SEA: "WA",
};

/** The visitors' stadium, for a game the league moves there. */
function siteOf(team: string): Record<string, unknown> {
  const t = TEAM_BY_ID[team];
  return { neutral: true, stadium: t.stadium, stadiumId: t.stadiumId, roof: t.roof, surface: t.surface, city: `${t.city}, ${STATE[team] ?? "US"}` };
}

const HURRICANE = new Set(["MIA", "TB", "JAX", "NO", "HOU"]);
const COLD_OPEN = new Set(["BUF", "CHI", "CLE", "GB", "NE", "NYG", "NYJ", "PIT", "KC", "DEN", "CIN", "BAL", "PHI", "WAS"]);

/**
 * Three days out the league checks every game for a storm or a stadium that
 * can't host safely, and moves it: a day later for a blizzard, to the
 * visitors' stadium for a hurricane or a failing building.
 */
export function emergencies(state: GameState, odds = 1): void {
  const lo = leagueOffice(state);
  const day = new Date(Date.parse(state.date + "T12:00:00Z") + 3 * 86400000).toISOString().slice(0, 10);
  const month = Number(day.slice(5, 7));
  let moved = false;
  for (const g of [...(GAMES_BY_DATE[day] ?? [])]) {
    if (g.type !== "REG" || g.neutral || !g.home || !g.away) continue;
    const rng = rngFor(state.seed, `emergency:${g.id}`);
    const roll = rng();
    const facility = g.home === state.userTeam ? Math.max(0, faultFactor(state) - 1.4) * 0.05 : 0;
    let kind: "weather" | "facility" | null = null;
    let text = "";
    if (HURRICANE.has(g.home) && (month === 9 || month === 10) && roll < 0.02 * odds) {
      kind = "weather";
      text = `A hurricane bearing down on ${TEAM_BY_ID[g.home].city} moves ${teamLabel(g.away)} at ${teamLabel(g.home)} to ${TEAM_BY_ID[g.away].stadium}, same day.`;
      Object.assign(g, siteOf(g.away));
    } else if (COLD_OPEN.has(g.home) && (month === 12 || month === 1) && roll < 0.008 * odds && g.week !== undefined && g.week < FORMAT.weeks) {
      kind = "weather";
      const next = new Date(Date.parse(g.date + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
      text = `A blizzard pushes ${teamLabel(g.away)} at ${teamLabel(g.home)} back a day, to ${shortDate(next)}.`;
      Object.assign(g, { date: next, weekday: "Monday", timeET: "19:00" });
    } else if (facility > 0 && roll < facility) {
      kind = "facility";
      text = `League inspectors won't clear our stadium for ${teamLabel(g.away)} at ${teamLabel(g.home)} after a major systems failure: the game moves to ${TEAM_BY_ID[g.away].stadium}. The league makes up most of the gate.`;
      Object.assign(g, siteOf(g.away));
    }
    if (!kind) continue;
    moved = true;
    lo.moves.unshift({ game: g.id, date: state.date, kind, text });
    news(state, text);
    if (g.home === state.userTeam || g.away === state.userTeam) send(state, "league", "League Office", "Emergency schedule change", `${text} The commissioner's office made the call under the league's emergency procedures, after hearing from both clubs, local officials and the stadium.`);
  }
  if (moved) reindexSchedule();
}

// ---- Building next season's schedule ----

/**
 * How much each club draws a national audience for next season's prime-time
 * picks: its market, how it finished, and the champion's opener.
 */
export function scheduleDraw(state: GameState, place: Record<string, number>, champion?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of TEAMS) {
    const pct = winPct(state, t.id);
    out[t.id] = 0.5 + 0.5 * marketIndex(t.id) + (pct - 0.5) * 1.4 + (place[t.id] === 1 ? 0.15 : 0) + (t.id === champion ? 0.25 : 0);
  }
  return out;
}

// ---- Each day ----

export function leagueOfficeDaily(state: GameState): void {
  const lo = leagueOffice(state);
  const K = RULES.keyDates;
  lo.moves = lo.moves.slice(0, 40);
  lo.log = lo.log.slice(0, 40);
  if (state.date === K.hallOfFameGame) runTrial(state);
  if (state.date.endsWith("-01")) commissionerDrift(state);
  // The commissioner's contract comes to the owners at the March meeting of its last year.
  if (state.date === K.annualLeagueMeeting && lo.commissioner.through <= RULES.season + 1 && !lo.commissioner.renewal) {
    lo.commissioner.renewal = { year: RULES.season + 1 };
    send(state, "league", "League Office", "The commissioner's contract", `Commissioner ${lo.commissioner.name}'s contract runs out this year. The owners vote on an extension at the meeting; it needs 24 votes. The Owners page has the vote.`);
  }
  if (lo.commissioner.renewal && lo.commissioner.renewal.passed === undefined && state.date === addDays(K.annualLeagueMeeting, 2)) commissionerVote(state);
  if (lo.commissioner.renewal?.passed !== undefined && state.date.endsWith("-06-01")) delete lo.commissioner.renewal;
  if (state.date.endsWith("-05-20")) reshuffle(state);
  if (RULES.season > BASE_SEASON && state.date >= K.regularSeasonStart && state.date <= K.regularSeasonEnd) {
    if (new Date(state.date + "T12:00:00Z").getUTCDay() === 2) flex(state);
    emergencies(state);
  }
}


// Labor relations: the players' union as its own side, the real 2020
// agreement through the 2030 season, and the agreements bargained after it.
// Talks open two years before the old deal runs out. The owners' labor
// committee (the Management Council Executive Committee) sets the league's
// goals; each month the two sides' proposals move toward where a deal would
// settle, and the odds of closing rise as the deadline nears. Most talks end
// in a deal before the old one expires. Some end in an offseason lockout that
// stops free agency, trades and team activities; a few run into the season
// and cancel games, which costs every club its gate and part of the national
// money, refunds season tickets and hurts fans' trust. A tentative deal needs
// 24 owners' votes and the players' ratification, and then applies at once
// (cbaterms.ts binds it for contracts, the cap and the business; an 18-game
// season goes into the rulebook). Contracts signed before stay as they are.
//
// The union's leader and how militant it is are made up; the 2020 terms, the
// 24-vote rule, ratification, and how lockouts work follow the real league.
// Grievances (injury, pay, discipline) are filed against clubs and decided by
// an arbitrator unless the club settles.
import { post } from "./business";
import { BASE_TERMS, bindTerms, type CbaTerms, termsFor } from "./cbaterms";
import { keyDatesFor } from "./calendar";
import { addDays, daysBetween, shortDate, weekday } from "./dates";
import { inRecession } from "./economy";
import { payCash } from "./finance";
import { trustHit } from "./fans";
import { formatFor } from "./format";
import { CBA_2011 } from "./eras";
import { money, news, send } from "./inbox";
import { bindCaps, PLAYER_BY_ID, RULES, SCHEDULE, TEAMS, teamLabel } from "./league";
import { onCommittee } from "./leagueoffice";
import { invalidateMarket } from "./market";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { gaussian, rngFor } from "./rng";
import { rulesFor } from "./rules";
import type { GameState, ScheduledGame } from "./types";

export interface Agreement {
  from: number;
  through: number;
  signed: string;
  terms: CbaTerms;
  lockout?: { start: string; end: string; gamesLost: number };
}

export type Stance = "hard" | "steady" | "soft";

export interface Talks {
  /** The last season of the agreement being replaced. */
  through: number;
  opened: string;
  /** Each side's proposal on the table now. */
  owners: CbaTerms;
  union: CbaTerms;
  /** Where a deal would settle: 0 is the union's opening, 1 the owners'. */
  w: number;
  status: "talks" | "tentative" | "lockout";
  tentative?: { date: string; terms: CbaTerms; votesDue: string; ourVote?: boolean };
  lockout?: { start: string; cancelled: string[] };
  rounds: number;
}

export interface Grievance {
  id: string;
  filed: string;
  kind: "injury" | "pay" | "discipline";
  player: string;
  claim: number;
  due: string;
  status: "open" | "won" | "lost" | "settled";
  award?: number;
}

export interface LaborState {
  agreements: Agreement[];
  union: { leader: string; since: number; militancy: number };
  /** Our position in the owners' room. */
  stance: Stance;
  /** What we push the committee to ask for. */
  priorities: { games18: boolean; rookie: boolean; share: boolean };
  talks?: Talks;
  grievances: Grievance[];
  /** Regular-season games lost to work stoppages, league-wide, by season. */
  lost: Record<number, number>;
  log: { date: string; text: string }[];
}

/** What each side opens with: owners want a lower share, a cheaper rookie pool and an 18th game; the union wants the reverse plus health and safety. */
const OWNERS_OPEN: CbaTerms = { share: 0.475, minScale: 1.02, rookieScale: 0.95, benefits: 1.05, practice: 16, games: 18, safety: 0, cashFloor: 0.89 };
const UNION_OPEN: CbaTerms = { share: 0.5, minScale: 1.12, rookieScale: 1.05, benefits: 1.3, practice: 12, games: 17, safety: 3, cashFloor: 0.92 };
const TERM_YEARS = 10;
const VOTES_NEEDED = 24;

export const STANCES: Record<Stance, string> = {
  hard: "Hold out for better terms: a better deal for the clubs, but talks take longer and a lockout is likelier.",
  steady: "Back the committee's line.",
  soft: "Push for labor peace: a deal comes sooner, on terms closer to the union's.",
};

export function labor(state: GameState): LaborState {
  if (state.labor) return state.labor;
  const r = rngFor(state.seed, "union");
  const leader = `${FIRST_NAMES[Math.floor(r() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(r() * LAST_NAMES.length)]}`;
  state.labor = {
    // A start before 2021 opens under the 2011 agreement (eras.ts).
    agreements: state.era && state.era.start <= 2020
      ? [{ from: 2011, through: 2020, signed: "2011-08-04", terms: { ...CBA_2011 } }]
      : [{ from: 2021, through: 2030, signed: "2020-03-15", terms: { ...BASE_TERMS } }],
    union: { leader, since: 2023, militancy: Math.round((0.3 + 0.4 * r()) * 100) / 100 },
    stance: "steady",
    priorities: { games18: true, rookie: false, share: true },
    grievances: [], lost: {}, log: [],
  };
  bindLabor(state);
  return state.labor;
}

/** Binds the save's agreements for contracts, the cap and the business. Called whenever a season is applied. */
export function bindLabor(state: GameState): void {
  const list = state.labor?.agreements;
  if (!list?.length) { bindTerms(() => BASE_TERMS); return; }
  bindTerms((y) => {
    let t = list[0].terms;
    for (const a of list) if (a.from <= y) t = a.terms;
    return t;
  });
}

export function currentAgreement(state: GameState): Agreement {
  const l = labor(state);
  return l.agreements[l.agreements.length - 1];
}

/** True while the owners have locked the players out: no signings, trades or team activities. */
export function lockedOut(state: GameState): boolean {
  return !!state.labor?.talks?.lockout;
}

export const LOCKOUT_REASON = "The league has locked out the players: no signings, trades or team activities until there's a new labor deal.";

/** The deadline: without a new deal there's no negotiating window, and the old agreement expires. */
export function deadline(through: number): string {
  return keyDatesFor(through).negotiatingWindowOpens;
}

/** Labor uncertainty: sponsors and season-ticket buyers hold back as a deadline nears without a deal, more in a lockout. */
export function laborDrag(state: GameState): number {
  const t = state.labor?.talks;
  if (!t) return 0;
  if (t.lockout) return 0.03;
  return daysBetween(state.date, deadline(t.through)) < 365 ? 0.01 : 0;
}

/** National money lost to cancelled games: the networks pay for the games played. */
export function distributionCut(state: GameState, year: number): number {
  const lost = state.labor?.lost[year] ?? 0;
  if (!lost) return 1;
  return Math.max(0.3, 1 - 0.9 * lost / (16 * formatFor(year).games));
}

/** How much our stance moves the owners' room: members of the labor committee count fully. */
function weight(state: GameState): number {
  return onCommittee(state, "labor") ? 1 : 0.4;
}

/** How fast the sides close: our stance, the union's mood, and a weak economy that leaves players keener to settle. */
function pace(state: GameState): number {
  const l = labor(state);
  const w = weight(state);
  const stance = l.stance === "hard" ? 1 - 0.3 * w : l.stance === "soft" ? 1 + 0.35 * w : 1;
  return stance * (inRecession(state) ? 1.1 : 1) * (1.25 - 0.5 * l.union.militancy);
}

function settlePoint(state: GameState, r: () => number): number {
  const l = labor(state);
  const w = weight(state);
  const lean = l.stance === "hard" ? 0.08 * w : l.stance === "soft" ? -0.08 * w : 0;
  const v = 0.5 + lean + (inRecession(state) ? 0.05 : 0) - (l.union.militancy - 0.5) * 0.2 + gaussian(r) * 0.04;
  return Math.max(0.25, Math.min(0.75, v));
}

function ownersOpening(state: GameState): CbaTerms {
  const p = labor(state).priorities;
  return { ...OWNERS_OPEN, games: p.games18 ? 18 : 17, rookieScale: p.rookie ? 0.9 : OWNERS_OPEN.rookieScale, share: p.share ? 0.47 : 0.48 };
}

const round = (x: number, step: number) => Math.round(x / step) * step;
function lerp(a: CbaTerms, b: CbaTerms, w: number): CbaTerms {
  const m = (k: keyof CbaTerms) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * w;
  return {
    share: m("share"), minScale: m("minScale"), rookieScale: m("rookieScale"), benefits: m("benefits"),
    practice: m("practice"), games: (w >= 0.5 ? b.games : a.games), safety: m("safety"), cashFloor: m("cashFloor"),
  };
}

/**
 * Where the deal lands at settle point w. The 18th game is the big trade:
 * the union gives it only for a higher share, fewer padded practices and
 * another safety provision.
 */
export function dealTerms(owners: CbaTerms, w: number): CbaTerms {
  const t = lerp(UNION_OPEN, owners, w);
  t.games = owners.games === 18 && w >= 0.45 ? 18 : 17;
  if (t.games === 18) {
    t.share = Math.max(t.share, 0.495);
    t.practice -= 2;
    t.safety += 1;
  }
  return {
    share: round(t.share, 0.0025), minScale: round(t.minScale, 0.01), rookieScale: round(t.rookieScale, 0.01), benefits: round(t.benefits, 0.01),
    practice: Math.round(t.practice), games: t.games, safety: Math.round(t.safety), cashFloor: round(t.cashFloor, 0.01),
  };
}

function note(state: GameState, text: string): void {
  const l = labor(state);
  l.log.unshift({ date: state.date, text });
  l.log.length = Math.min(l.log.length, 30);
}

function openTalks(state: GameState): void {
  const l = labor(state);
  const cur = currentAgreement(state);
  const r = rngFor(state.seed, `talks:${cur.through}`);
  const w = settlePoint(state, r);
  l.talks = { through: cur.through, opened: state.date, owners: ownersOpening(state), union: { ...UNION_OPEN }, w, status: "talks", rounds: 0 };
  news(state, `The league and the players' union open talks on a new labor agreement; the current one runs through the ${cur.through} season`);
  note(state, `Talks opened. The deal expires on ${shortDate(deadline(cur.through))}.`);
  send(state, "league", "Management Council", "Labor talks open",
    `Formal talks with the players' union start today. The current agreement expires on ${shortDate(deadline(cur.through))}. ` +
    "The owners want a lower player share, a cheaper rookie pool and an 18th game; the union wants a bigger share, better benefits and fewer padded practices. " +
    `You can set our stance and priorities on the Owners page${onCommittee(state, "labor") ? "; as a member of the labor committee, your view carries full weight" : ""}.`);
}

/** Monthly odds of a deal in talks: low early, rising sharply in the last few months. */
function talksHazard(monthsLeft: number): number {
  return 0.015 + 0.2 * Math.exp(-(Math.max(1, monthsLeft) - 1) / 2.5);
}

function bargain(state: GameState, r: () => number, h: number): void {
  const t = labor(state).talks!;
  t.rounds++;
  t.w = Math.max(0.25, Math.min(0.75, t.w + gaussian(r) * 0.015 + (t.lockout ? 0.004 : 0)));
  const target = dealTerms(t.owners.games === 18 || labor(state).priorities.games18 ? { ...t.owners, games: 18 } : t.owners, t.w);
  t.owners = { ...lerp(t.owners, target, 0.15), games: t.owners.games };
  t.union = { ...lerp(t.union, target, 0.15), games: t.union.games };
  if (r() < h * pace(state)) tentative(state);
}

function tentative(state: GameState): void {
  const t = labor(state).talks!;
  const owners = ownersOpening(state);
  t.tentative = { date: state.date, terms: dealTerms(owners, t.w), votesDue: addDays(state.date, 7) };
  t.status = "tentative";
  const d = t.tentative.terms;
  news(state, `The league and the players' union reach a tentative labor agreement; owners vote within a week, then the players`);
  note(state, "Tentative deal reached.");
  send(state, "league", "Management Council", "Tentative labor deal: your vote",
    `${termsLine(d)}. The owners vote on ${shortDate(t.tentative.votesDue)} (24 of 32 needed), then the players ratify. ` +
    "Cast our vote on the Owners page; if you don't, we'll vote with the committee.");
}

export function termsLine(d: CbaTerms): string {
  return `Players' share ${(d.share * 100).toFixed(2)}%, ${d.games} games, minimums ${pctLine(d.minScale)}, rookie pool ${pctLine(d.rookieScale)}, benefits ${pctLine(d.benefits)}, ` +
    `${d.practice} padded camp practices, ${d.safety} new safety provision${d.safety === 1 ? "" : "s"}, cash floor ${Math.round(d.cashFloor * 100)}%`;
}

function pctLine(x: number): string {
  const p = Math.round((x - 1) * 100);
  return p === 0 ? "unchanged" : `${p > 0 ? "+" : ""}${p}%`;
}

/** Our vote on a tentative deal. */
export function castVote(state: GameState, yes: boolean): string | null {
  const t = state.labor?.talks;
  if (!t?.tentative) return "There's no deal to vote on.";
  t.tentative.ourVote = yes;
  return null;
}

function vote(state: GameState): void {
  const l = labor(state);
  const t = l.talks!;
  const tt = t.tentative!;
  const r = rngFor(state.seed, `labor-vote:${state.date}`);
  const ours = tt.ourVote ?? (l.stance !== "hard" || t.w >= 0.5);
  const p = Math.max(0.6, Math.min(0.98, 0.85 + 0.6 * (t.w - 0.5)));
  const yes = TEAMS.filter((x) => x.id !== state.userTeam && r() < p).length + (ours ? 1 : 0);
  if (yes < VOTES_NEEDED) {
    news(state, `Owners reject the tentative labor deal, ${yes}-${32 - yes}; the committee goes back to the table`);
    note(state, `Owners voted the deal down ${yes}-${32 - yes}.`);
    back(state, 0.04);
    return;
  }
  const ratify = Math.max(0.5, Math.min(0.97, 0.97 - Math.max(0, t.w - 0.55) * 3));
  if (r() >= ratify) {
    news(state, `Players vote down the tentative labor deal after the owners approved it ${yes}-${32 - yes}`);
    note(state, "The players voted the deal down.");
    back(state, -0.04);
    return;
  }
  sign(state, tt.terms, yes);
}

function back(state: GameState, shift: number): void {
  const t = labor(state).talks!;
  t.w = Math.max(0.25, Math.min(0.75, t.w + shift));
  t.tentative = undefined;
  t.status = t.lockout ? "lockout" : "talks";
}

/** A new agreement takes effect: terms bound at once, the cap rescaled, an 18th game into the rulebook, any lockout lifted. */
function sign(state: GameState, terms: CbaTerms, yes: number): void {
  const l = labor(state);
  const t = l.talks!;
  const from = t.through + 1;
  const old = termsFor(from);
  const lost = t.lockout ? t.lockout.cancelled.filter((id) => SCHEDULE.find((g) => g.id === id)?.type === "REG").length : 0;
  const a: Agreement = { from, through: from + TERM_YEARS - 1, signed: state.date, terms };
  if (t.lockout) a.lockout = { start: t.lockout.start, end: state.date, gamesLost: lost };
  l.agreements.push(a);
  l.talks = undefined;
  bindLabor(state);
  // Caps already announced for the new deal's years follow the new share.
  const caps = state.league?.caps;
  if (caps && terms.share !== old.share) {
    for (const y of Object.keys(caps).map(Number)) if (y >= from) caps[y] = Math.round(caps[y] * terms.share / old.share / 100_000) * 100_000;
    bindCaps(caps);
  }
  invalidateMarket(state);
  // The players agreed to an 18th game: it starts with the first season not yet scheduled.
  const start = Math.max(from, RULES.season + 1);
  const owners = (state.owners ??= { relations: {}, rules: [], history: [] } as never);
  if (terms.games === 18 && rulesFor(state, start).games === 17) owners.rules.push({ rule: "games18", year: start, yes: 32, sponsor: "labor" });
  const len = `${from}-${a.through}`;
  news(state, `Owners (${yes}-${32 - yes}) and players ratify a new labor agreement for ${len}${a.lockout ? `, ending the lockout${lost ? ` after ${lost} regular-season games were lost` : ""}` : ""}`);
  note(state, `New agreement for ${len} signed.`);
  send(state, "league", "Management Council", `New labor agreement, ${len}`,
    `${termsLine(terms)}. ${terms.games === 18 ? `The 18-game season starts in ${start}. ` : ""}Contracts already signed stay as written; ` +
    `the cap, minimums and rookie scale follow the new terms from ${from}.${a.lockout ? " Free agency, trades and team activities resume today." : ""}`);
}

function startLockout(state: GameState): void {
  const t = labor(state).talks!;
  t.status = "lockout";
  t.lockout = { start: state.date, cancelled: [] };
  news(state, "The labor agreement expires without a new deal, and the owners lock out the players: free agency, trades and team activities stop");
  note(state, "Lockout began.");
  send(state, "league", "Management Council", "Lockout",
    "The agreement expired without a deal and the league has locked out the players. Until a new deal is ratified there's no free agency, no trades or signings, and no team activities. " +
    "Talks continue. If it reaches the regular season, games are cancelled: no gate, refunds for season-ticket holders, and less national money for every club.");
  fanTrust(state, -2, 0, "the lockout");
}

function fanTrust(state: GameState, delta: number, scar: number, why: string): void {
  if (state.fans) trustHit(state, delta, scar, why);
}

/** A game falls on a lockout day: it's cancelled. Our home games refund their deposits. */
export function cancelGame(state: GameState, g: ScheduledGame): void {
  const l = labor(state);
  const t = l.talks!;
  if (t.lockout!.cancelled.includes(g.id)) return;
  t.lockout!.cancelled.push(g.id);
  if (g.type === "REG") {
    const season = RULES.season;
    l.lost[season] = (l.lost[season] ?? 0) + 1;
    const us = state.userTeam;
    if (g.home === us || g.away === us) fanTrust(state, -1.5, 0.5, "a cancelled game");
  }
  if (g.home === state.userTeam && !g.neutral) refundDeposit(state, g);
  const day = SCHEDULE.filter((x) => x.date === g.date && x.type === g.type).length;
  if (SCHEDULE.filter((x) => x.date === g.date && t.lockout!.cancelled.includes(x.id)).length === day) {
    news(state, `Lockout: the league cancels the ${g.type === "PRE" ? "preseason" : "regular-season"} games of ${shortDate(g.date)}`);
  }
}

function refundDeposit(state: GameState, g: ScheduledGame): void {
  const b = state.business;
  const d = b?.deferred;
  if (!d || d.season !== RULES.season || d.applied >= d.amount) return;
  const us = state.userTeam;
  const left = SCHEDULE.filter((x) => x.home === us && !x.neutral && (x.type === "PRE" || x.type === "REG") && x.date >= g.date).length;
  const part = left <= 1 ? d.amount - d.applied : Math.round((d.amount - d.applied) / left);
  // The deposit goes back to the buyers: cash out, no ticket revenue earned.
  post(state, "deposits", -part, `Refund for the cancelled game of ${shortDate(g.date)}`);
  d.applied += part;
}

// ---- Grievances ----

const KIND_TEXT: Record<Grievance["kind"], string> = {
  injury: "an injury grievance over his release while hurt",
  pay: "a grievance over unpaid salary and bonus language",
  discipline: "a grievance over a club fine",
};

function grievancesDaily(state: GameState): void {
  const l = labor(state);
  if (state.date.endsWith("-15")) {
    const r = rngFor(state.seed, `grievance:${state.date}`);
    if (r() < 0.035) {
      const roster = Object.keys(state.players).filter((id) => state.players[id].team === state.userTeam);
      const player = roster[Math.floor(r() * roster.length)];
      if (player) {
        const kind = (["injury", "pay", "discipline"] as const)[Math.floor(r() * 3)];
        const claim = Math.round((kind === "discipline" ? 50_000 + r() * 350_000 : 400_000 + r() * 2_600_000) / 10_000) * 10_000;
        const g: Grievance = { id: `gr${state.date}`, filed: state.date, kind, player, claim, due: addDays(state.date, 60 + Math.floor(r() * 90)), status: "open" };
        l.grievances.unshift(g);
        send(state, "league", "Management Council", "Grievance filed",
          `The union filed ${KIND_TEXT[kind]} for ${PLAYER_BY_ID[player]?.name ?? "a player"}, claiming ${money(claim)}. An arbitrator hears it around ${shortDate(g.due)}. We can settle now on the Owners page.`);
      }
    }
    if (r() < 0.6) news(state, `The players' union files a grievance against the ${teamLabel(TEAMS[Math.floor(r() * TEAMS.length)].id)}`);
  }
  for (const g of l.grievances) {
    if (g.status !== "open" || state.date < g.due) continue;
    const r = rngFor(state.seed, `ruling:${g.id}`);
    const staff = state.compliance?.staff ?? 2;
    if (r() < 0.5 - 0.03 * Math.min(4, staff)) {
      g.status = "lost";
      g.award = Math.round(g.claim * (0.6 + 0.4 * r()));
      payCash(state, state.userTeam, g.award);
      send(state, "league", "Management Council", "Grievance ruling", `The arbitrator ruled for ${PLAYER_BY_ID[g.player]?.name ?? "the player"}: we owe ${money(g.award)}.`);
    } else {
      g.status = "won";
      send(state, "league", "Management Council", "Grievance ruling", `The arbitrator denied ${PLAYER_BY_ID[g.player]?.name ?? "the player"}'s grievance.`);
    }
  }
  if (l.grievances.length > 20) l.grievances.length = 20;
}

/** Settle a grievance before the hearing, at a bit over half the claim. */
export function settleGrievance(state: GameState, id: string): string | null {
  const g = labor(state).grievances.find((x) => x.id === id);
  if (!g || g.status !== "open") return "Nothing to settle.";
  g.status = "settled";
  g.award = Math.round(g.claim * 0.55);
  payCash(state, state.userTeam, g.award);
  return `Settled for ${money(g.award)}.`;
}

export function setStance(state: GameState, stance: Stance): void {
  labor(state).stance = stance;
}

export function setPriority(state: GameState, k: keyof LaborState["priorities"], on: boolean): void {
  labor(state).priorities[k] = on;
  const t = state.labor!.talks;
  if (t && t.status !== "tentative") t.owners = { ...t.owners, games: ownersOpening(state).games };
}

/** Forces a deal (tests and reports): the tentative deal at the current settle point, voted at once. */
export function forceDeal(state: GameState, terms?: Partial<CbaTerms>): void {
  const l = labor(state);
  if (!l.talks) openTalks(state);
  const t = l.talks!;
  sign(state, { ...dealTerms(ownersOpening(state), t.w), ...terms }, 30);
}

/** Forces a lockout (tests and reports). */
export function forceLockout(state: GameState): void {
  const l = labor(state);
  if (!l.talks) openTalks(state);
  startLockout(state);
}

export function laborDaily(state: GameState): void {
  const l = labor(state);
  grievancesDaily(state);
  const cur = currentAgreement(state);
  // Real history: the 2020 agreement was ratified on March 15, 2020, and runs through 2030.
  const real2020 = state.era && !state.era.alt && cur.through === 2020;
  if (real2020 && state.date >= "2020-03-15") {
    l.agreements.push({ from: 2021, through: 2030, signed: "2020-03-15", terms: { ...BASE_TERMS } });
    bindLabor(state);
    note(state, "The players ratified a new agreement through 2030: a 48.5% share with the 17th game, and bigger minimums.");
    news(state, "Players ratify a new labor deal through 2030: a 17th game from 2021, an expanded playoff field and higher minimum salaries");
    return;
  }
  if (!l.talks && !real2020 && state.date >= `${cur.through - 1}-03-01` && state.date < deadline(cur.through)) openTalks(state);
  const t = l.talks;
  if (!t) return;
  const r = rngFor(state.seed, `labor:${state.date}`);
  if (t.status === "tentative") {
    if (state.date >= t.tentative!.votesDue) vote(state);
    return;
  }
  const due = deadline(t.through);
  if (!t.lockout) {
    if (state.date >= due) { startLockout(state); return; }
    if (state.date.endsWith("-01")) bargain(state, r, talksHazard(Math.ceil(daysBetween(state.date, due) / 30.4)));
    return;
  }
  if (weekday(state.date) !== "Monday") return;
  // In a lockout the sides meet weekly; once games are being lost, pressure on both sides is intense.
  const season = keyDatesFor(t.through + 1).regularSeasonStart;
  const lostWeeks = Math.floor(Math.max(0, daysBetween(season, state.date)) / 7);
  const h = state.date < addDays(season, -7) ? 0.07 : lostWeeks >= 6 ? 1 : 0.35;
  bargain(state, r, h);
}

/** For the report: the expected odds behind `laborDaily`, run on the hazard alone. */
export function laborOdds(n = 20000, mult = 1): { beforeDeadline: number; offseasonLockout: number; gamesLost: number } {
  let a = 0, b = 0, c = 0;
  const r = rngFor(1, "labor-odds");
  outer: for (let i = 0; i < n; i++) {
    for (let m = 24; m >= 1; m--) if (r() < talksHazard(m) * mult) { a++; continue outer; }
    for (let w = 0; w < 25; w++) if (r() < 0.07 * mult) { b++; continue outer; }
    c++;
  }
  return { beforeDeadline: a / n, offseasonLockout: b / n, gamesLost: c / n };
}

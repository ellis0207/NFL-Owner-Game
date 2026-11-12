// League money: the national revenue every club shares, split into its
// pools (national media, league sponsorship, licensing and the league's other
// businesses), with the league office's own costs taken off the top before
// the 32 shares go out. Clubs are paid a preliminary estimate each month with
// a small amount held back; after the league's audit in the spring the
// difference is settled. The media deals in teammedia.ts come up for renewal
// (the league can opt out after the 2029 season), and what the networks pay
// moves the salary cap. Owners can vote to change how the gate and premium
// seating are shared, and big and small markets want different things.
//
// The audit variances, disputes and renewal results are made up; the shape
// of the system (pools, costs off the top, a spring true-up, the 34% visiting
// gate share) follows how the league describes it.
import { distributionCut } from "./labor";
import { business, nationalRevenue, post } from "./business";
import { leagueYear } from "./contracts";
import { addDays, shortDate } from "./dates";
import { execBoost } from "./executives";
import { METRO } from "./fans";
import { formatFor } from "./format";
import { money, news, send } from "./inbox";
import { BASE_SEASON, RULES, TEAMS, teamLabel } from "./league";
import { gaussian, rngFor } from "./rng";
import { LEAGUE_RULES } from "./rules";
import { OPT_OUT, teamMedia, TV_DEALS } from "./teammedia";
import type { GameState, LeagueMoneyState } from "./types";
import { PACK } from "./pack";

const M = 1_000_000;
/** Share of each monthly distribution the league holds back until the audit. */
export const WITHHELD = 0.01;
/** League office, officiating, NFL Films and the rest, as a share of gross national revenue. */
const LEAGUE_COSTS = 0.035;
/** About how much of league revenue the TV deals make up: what a new deal does to the cap. */
const MEDIA_SHARE = 0.65;
/** The real deals run through 2033. */
const DEALS_END = 2033;

export function leagueMoney(state: GameState): LeagueMoneyState {
  return (state.leagueMoney ??= { tv: { renewals: [] }, log: [], settled: {} });
}

// ---- Markets ----

let indexCache: Record<string, number> | null = null;

/** A club's market strength next to the league's average (1): people and income. Big markets lean against sharing more. */
export function marketIndex(team: string): number {
  if (!indexCache) {
    const raw: Record<string, number> = {};
    for (const t of TEAMS) {
      const m = METRO[t.id];
      raw[t.id] = m ? Math.pow(m.pop + m.region * 0.25, 0.35) * m.income : 1;
    }
    const avg = Object.values(raw).reduce((a, b) => a + b, 0) / TEAMS.length;
    indexCache = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / avg]));
  }
  return indexCache[team] ?? 1;
}

// ---- The pools ----

export interface Pools { media: number; sponsorship: number; licensing: number; other: number; gross: number; costs: number; net: number }

/** One club's share of each national pool this league year, before and after the league's costs. */
export function poolsFor(_state: GameState | undefined, year: number): Pools {
  // The share already follows the cap, which the media deals move (see capMediaBump).
  const net = nationalRevenue(year);
  const gross = net / (1 - LEAGUE_COSTS);
  const tvAll = TV_DEALS.filter((d) => d.through >= Math.min(year, DEALS_END)).reduce((a, d) => a + d.annual, 0);
  const media = Math.min(gross * 0.82, (tvAll / 32) * (net / nationalRevenue(PACK ? 2026 : BASE_SEASON)));
  const sponsorship = gross * 0.055;
  const licensing = gross * 0.06;
  return { media, sponsorship, licensing, other: gross - media - sponsorship - licensing, gross, costs: gross * LEAGUE_COSTS, net };
}

/** What the league pays each month as its preliminary estimate, net of the amount held back. */
export function monthlyDistribution(state: GameState, year: number): number {
  // Games cancelled by a lockout aren't paid for by the networks (labor.ts).
  return (poolsFor(state, year).net * (1 - WITHHELD)) / 12 * distributionCut(state, year);
}

/** Revenue belongs to the league year it was earned in; the cash arrives monthly and the rest after the spring audit. */
export function distributionStatus(state: GameState, year = leagueYear(state.date)): { recognized: number; paid: number; withheld: number; dueAfterAudit: string } {
  const paid = business(state).ledger.filter((e) => e.year === year && e.cat === "national").reduce((t, e) => t + e.amount, 0);
  return { recognized: poolsFor(state, year).net, paid, withheld: paid / (1 - WITHHELD) - paid, dueAfterAudit: `${year + 1}-04-15` };
}

// ---- Sharing between clubs ----

/** Our home gate and premium seating over the last full league year (or this one so far, scaled up). */
function ourGates(state: GameState): { gate: number; premium: number } {
  const year = leagueYear(state.date);
  const sum = (cat: string, y: number) => business(state).ledger.filter((e) => e.year === y && e.cat === cat).reduce((t, e) => t + e.amount, 0);
  let gate = sum("tickets", year - 1);
  let premium = sum("premium", year - 1);
  if (gate <= 0) { gate = sum("tickets", year); premium = sum("premium", year); }
  return { gate: Math.max(gate, 60 * M), premium: Math.max(premium, 20 * M) };
}

/** A club's typical gate and premium revenue, scaled from ours by market (an estimate: other clubs' books aren't public). */
function clubGates(state: GameState, team: string): { gate: number; premium: number } {
  const ours = ourGates(state);
  const k = marketIndex(team) / marketIndex(state.userTeam);
  return { gate: ours.gate * Math.pow(k, 0.6), premium: ours.premium * Math.pow(k, 0.9) };
}

function averageGates(state: GameState): { gate: number; premium: number } {
  const all = TEAMS.map((t) => clubGates(state, t.id));
  return { gate: all.reduce((a, b) => a + b.gate, 0) / all.length, premium: all.reduce((a, b) => a + b.premium, 0) / all.length };
}

/** What raising the pooled gate share by `delta` would cost us a year (negative: we'd gain). */
export function gateShareCost(state: GameState, delta: number): number {
  const avg = averageGates(state).gate;
  return Math.round(delta * 0.85 * (ourGates(state).gate - avg));
}

/** What pooling `share` of premium revenue would cost us a year (negative: we'd gain). */
export function premiumPoolCost(state: GameState, share: number): number {
  const avg = averageGates(state).premium;
  return Math.round(share * (ourGates(state).premium - avg));
}

/**
 * Each club's yearly transfer under today's sharing rules compared with a
 * plan, and what that does to its value (about six times the yearly money):
 * how sharing changes who can afford to compete.
 */
export function sharingImpact(state: GameState, gateShare: number, premiumPool: number): { team: string; transfer: number; value: number }[] {
  const avg = averageGates(state);
  return TEAMS.map((t) => {
    const g = clubGates(state, t.id);
    const transfer = (gateShare - LEAGUE_RULES.gateShare) * 0.85 * (avg.gate - g.gate) + (premiumPool - LEAGUE_RULES.premiumPool) * (avg.premium - g.premium);
    return { team: t.id, transfer: Math.round(transfer), value: Math.round(transfer * 6) };
  }).sort((a, b) => b.transfer - a.transfer);
}

// ---- TV renewals ----

/** How the media deals have moved revenue by a league year: 1 until a renewal starts. `before` leaves out a renewal starting that year. */
export function tvFactor(state: GameState, year: number, before = false): number {
  return (state.leagueMoney?.tv.renewals ?? []).filter((r) => (before ? r.from < year : r.from <= year)).reduce((f, r) => f * r.factor, 1);
}

/**
 * How healthy the league's business looks, about -0.02 to 0.02: close races
 * and a clean year help, scandals and sanctions hurt. Every owner gains from
 * it, whatever happens on the field.
 */
export function leagueHealth(state: GameState): number {
  const seasons = state.history?.seasons ?? [];
  const last = seasons[seasons.length - 1];
  let parity = 0;
  if (last) {
    const pct = Object.values(last.records).map((r) => (r[0] + r[2] / 2) / Math.max(1, r[0] + r[1] + r[2]));
    const mean = pct.reduce((a, b) => a + b, 0) / Math.max(1, pct.length);
    const sd = Math.sqrt(pct.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, pct.length));
    parity = (0.19 - sd) * 0.15;
  }
  const sanctions = (state.compliance?.leagueCases ?? []).filter((c) => c.year >= RULES.season - 1 && c.sanction).length;
  return Math.max(-0.02, Math.min(0.02, parity - sanctions * 0.002));
}

/** The next window to renegotiate the national deals, if one is still ahead. */
export function nextRenewal(state: GameState): { decide: string; from: number } | null {
  const lm = leagueMoney(state);
  const done = new Set(lm.tv.renewals.map((r) => r.from));
  if (!lm.tv.optOut) return { decide: `${OPT_OUT}-10-15`, from: OPT_OUT + 1 };
  if (lm.tv.optOut === "stay" && !done.has(DEALS_END + 1)) return { decide: `${DEALS_END - 1}-10-15`, from: DEALS_END + 1 };
  const latest = Math.max(...lm.tv.renewals.map((r) => r.from), 0);
  return latest ? { decide: `${latest + 7}-10-15`, from: latest + 8 } : null;
}

/** The league negotiates new national deals: the result follows the streaming market, the league's health and luck. */
function negotiate(state: GameState, from: number): void {
  const lm = leagueMoney(state);
  const rng = rngFor(state.seed, `tvdeal:${from}`);
  const market = teamMedia(state).streaming;
  const factor = Math.max(0.95, Math.min(1.22, 1.085 + (market - 1) * 0.5 + leagueHealth(state) * 2 + gaussian(rng) * 0.035));
  const pct = Math.round((factor - 1) * 100);
  const text = `New national media deals from ${from}: rights fees ${pct >= 0 ? "up" : "down"} about ${Math.abs(pct)}% a year, with ${Math.round(6 + rng() * 5)}-year terms.`;
  lm.tv.renewals.push({ from, factor: Math.round(factor * 1000) / 1000, text });
  lm.log.unshift({ date: state.date, text });
  news(state, `The league signs new national TV deals starting in ${from}; rights fees ${pct >= 0 ? "rise" : "fall"} about ${Math.abs(pct)}%`);
  send(state, "league", "League Office", "New national media agreements",
    `${text} The salary cap and every club's distribution move with them from the ${from} league year. ` +
    (state.leagueOffice?.committees.media.includes(state.userTeam) ? "As a member of the media committee you saw the terms before the vote; the owners approved them." : "The media committee recommended them and the owners approved."));
}

/** After the 2029 season the league can walk away from the current deals; it does if the market looks better than what it has. */
function optOutDecision(state: GameState): void {
  const lm = leagueMoney(state);
  const rng = rngFor(state.seed, `optout:${OPT_OUT}`);
  const out = teamMedia(state).streaming + leagueHealth(state) * 3 + (rng() - 0.5) * 0.08 > 0.98;
  lm.tv.optOut = out ? "out" : "stay";
  if (out) negotiate(state, OPT_OUT + 1);
  else {
    const text = `The league kept its national media deals through ${DEALS_END} instead of opting out: the market didn't promise more.`;
    lm.log.unshift({ date: state.date, text });
    news(state, "The league passes on its TV opt-out and keeps its media deals in place");
  }
}

/**
 * What the national deals add to next year's cap: a renewal starting that
 * year, and an extra game the networks pay for (or one taken away).
 */
export function capMediaBump(state: GameState, year: number): number {
  const r = (state.leagueMoney?.tv.renewals ?? []).find((x) => x.from === year);
  let bump = r ? MEDIA_SHARE * (r.factor - 1) : 0;
  const now = formatFor(year).games;
  const before = formatFor(year - 1).games;
  if (now !== before) bump += MEDIA_SHARE * 0.8 * (now / before - 1);
  // Like the real deals of 2021, a new contract is phased in: no single cap year takes more than about a 10% jump from it.
  return Math.max(-0.05, Math.min(0.1, bump));
}

/** Expected distributions ahead with a range: wider in years that depend on deals not yet signed. */
export function distributionForecast(state: GameState, years = 6): { year: number; mid: number; low: number; high: number; unsigned: boolean }[] {
  const year = leagueYear(state.date);
  const next = nextRenewal(state);
  const out = [];
  for (let y = year; y <= year + years; y++) {
    const mid = poolsFor(state, y).net;
    const unsigned = !!next && y >= next.from;
    const spread = 0.015 * (y - year) + (unsigned ? 0.08 : 0);
    out.push({ year: y, mid, low: mid * (1 - spread), high: mid * (1 + spread * (unsigned ? 1.4 : 1)), unsigned });
  }
  return out;
}

// ---- The spring audit ----

/** The audited true-up for last league year: what was held back, the audit's correction, premium pooling, and any dispute. */
function trueUp(state: GameState): void {
  const lm = leagueMoney(state);
  const year = leagueYear(state.date) - 1;
  if (lm.settled[year]) return;
  const paid = business(state).ledger.filter((e) => e.year === year && e.cat === "national").reduce((t, e) => t + e.amount, 0);
  if (paid <= 0) { lm.settled[year] = state.date; return; }
  const gross = paid / (1 - WITHHELD);
  const rng = rngFor(state.seed, `trueup:${year}`);
  const variance = Math.max(-0.025, Math.min(0.025, gaussian(rng) * 0.01));
  const due = Math.round(gross - paid + gross * variance);
  post(state, "revenueShare", due, `League audit: ${year} distributions settled (${money(gross - paid)} held back, audit ${variance >= 0 ? "+" : ""}${(variance * 100).toFixed(1)}%)`);
  let lines = [`The audited ${year} national revenue came in ${variance >= 0 ? "above" : "below"} the preliminary estimate by ${(Math.abs(variance) * 100).toFixed(1)}%. With the ${Math.round(WITHHELD * 100)}% held back during the year, the league ${due >= 0 ? "pays us" : "takes back"} ${money(Math.abs(due))} this week.`];
  if (LEAGUE_RULES.premiumPool > 0) {
    const share = Math.round(-premiumPoolCost(state, LEAGUE_RULES.premiumPool));
    post(state, "revenueShare", share, `${year} premium-seating pool settlement`);
    lines.push(`Premium-seating pool: ${share >= 0 ? "we receive" : "we pay"} ${money(Math.abs(share))}.`);
  }
  // Sometimes our auditors think the league charged clubs for costs that aren't allowed.
  if (rng() < 0.07 && !lm.dispute) {
    const amount = Math.round(gross * (0.002 + rng() * 0.004) / 1000) * 1000;
    lm.dispute = { year, amount, opened: state.date };
    lines.push(`Our finance staff questions ${money(amount)} of the league's deductions for central costs. We can contest it (outside accountants and lawyers, about $150K) or let it go; the Business page has the choice.`);
  }
  lm.settled[year] = state.date;
  lm.log.unshift({ date: state.date, text: `${year} distributions settled: ${due >= 0 ? "+" : ""}${money(due)}` });
  send(state, "business", "League Office", `${year} revenue distribution: audited true-up`, lines.join("\n\n"));
}

/** Contest the league's deductions, or let them go. */
export function decideDispute(state: GameState, contest: boolean): string | null {
  const lm = leagueMoney(state);
  const d = lm.dispute;
  if (!d || d.contested !== undefined) return "There's nothing to decide.";
  d.contested = contest;
  if (!contest) {
    d.outcome = "Let go.";
    lm.log.unshift({ date: state.date, text: `Accepted the league's ${d.year} deductions` });
    delete lm.dispute;
    return null;
  }
  post(state, "professional", -150_000, `Contesting the league's ${d.year} deductions`);
  d.resolves = addDays(state.date, 75);
  return `We've filed. The league's finance committee and an independent auditor will rule by ${shortDate(d.resolves)}.`;
}

function resolveDispute(state: GameState): void {
  const lm = leagueMoney(state);
  const d = lm.dispute;
  if (!d?.resolves || state.date < d.resolves) return;
  const won = rngFor(state.seed, `dispute:${d.year}`)() < 0.5 + 0.15 * execBoost(state, "CFO");
  if (won) post(state, "revenueShare", d.amount, `Recovered from the league after our ${d.year} audit dispute`);
  const text = won ? `The independent auditor agreed with us: the league returns ${money(d.amount)} of ${d.year} deductions.` : `The independent auditor sided with the league on the ${d.year} deductions.`;
  lm.log.unshift({ date: state.date, text });
  send(state, "business", "League Office", "Ruling on our distribution dispute", text);
  delete lm.dispute;
}

// ---- Each day ----

export function leagueMoneyDaily(state: GameState): void {
  const lm = leagueMoney(state);
  if (state.date.endsWith("-04-15")) trueUp(state);
  resolveDispute(state);
  if (!lm.tv.optOut && state.date === `${OPT_OUT}-10-15`) optOutDecision(state);
  const next = nextRenewal(state);
  if (lm.tv.optOut && next && state.date === next.decide) negotiate(state, next.from);
  // Other clubs dispute their numbers now and then, and it makes the business pages.
  if (state.date.endsWith("-05-20") && rngFor(state.seed, `cpudispute:${state.date}`)() < 0.12) {
    const t = TEAMS.filter((x) => x.id !== state.userTeam)[Math.floor(rngFor(state.seed, `cpudisputeteam:${state.date}`)() * 31)];
    news(state, `${teamLabel(t.id)} challenge the league's accounting of central costs in last year's distributions`);
  }
}

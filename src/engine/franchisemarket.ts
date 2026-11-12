// The market for NFL clubs: what they're worth, who sells, and how the
// player buys one.
//
// Clubs rarely change hands: one to three changes of control a decade. A
// club comes up for sale for a reason (an estate, a family split, a cash
// squeeze, a fight among the owners, or an offer too good to refuse), and a
// rival buyer group usually takes it within months. The player can pursue a
// listed club, or make an offer for any club that a seller may not refuse.
//
// A purchase runs: diligence (advisers comb the books, debts, lawsuits,
// leases, guaranteed pay and stadium needs), a bid against rival groups,
// exclusivity, financing (the player's own money, a family trust, limited
// partners and approved funds within the league's limits, and debt within
// the league's limit), the finance committee and a 24-vote approval, then
// closing. Any stage can fail. The player can own only one club, so buying
// a new one means selling the old one at closing.
//
// The sellers' reasons, rival groups and diligence findings are made up.
// The comparable sales marked real are, approximately.
import { billions, cashBalance, operatingEstimate, revenueEstimate, valuation } from "./business";
import { addDays, daysBetween } from "./dates";
import { LEAGUE_DEBT_LIMIT, totalDebt } from "./debt";
import { addMemo, openMemos } from "./delegation";
import { inRecession } from "./economy";
import { money, news, send } from "./inbox";
import { CONTROL, OWNERSHIP_RULES, ownerShare } from "./investors";
import { TEAM_BY_ID, TEAMS } from "./league";
import { owner } from "./ownership";
import { owners } from "./owners";
import { rngFor } from "./rng";
import { MARKETS, STADIUM_BY_TEAM, STRUCTURE_LABEL } from "./stadiums";
import { standingState } from "./standing";
import { closeDeal, tenure } from "./takeover";
import type { ClubDeal, Finding, FranchiseMarketState, GameState, Listing, Memo, RivalBid, StakeTerms } from "./types";
import { wealth } from "./wealth";

const M = 1_000_000;

/** Real changes of control, approximately: headline price, buyer. */
const REAL_SALES = [
  { team: "CAR", date: "2018-07-09", price: 2_275 * M, pct: 1, buyer: "David Tepper", real: true },
  { team: "DEN", date: "2022-08-09", price: 4_650 * M, pct: 1, buyer: "the Walton-Penner group", real: true },
  { team: "WAS", date: "2023-07-20", price: 6_050 * M, pct: 1, buyer: "the Harris group", real: true },
];

export const REASONS: Record<Listing["reason"], string> = {
  estate: "The owner's estate has to settle taxes and divide the family's money.",
  family: "The family that controls the club has split over its future.",
  liquidity: "The owner needs cash for other businesses.",
  governance: "The owners are fighting over control and a sale ends it.",
  offer: "An offer came in that the owner decided not to refuse.",
};

const GROUPS = ["the Alder Ridge group", "the Harcastle partnership", "a group led by a technology founder", "the Pemberton family", "a group led by a hedge-fund founder", "the Vance & Sorel partnership", "a group led by a former team president"];

export function franchise(state: GameState): FranchiseMarketState {
  return (state.franchise ??= { listings: [], deals: [], sales: REAL_SALES.map((x) => ({ ...x })), control: {}, log: [] });
}

function rand(state: GameState, key: string) {
  return rngFor(state.seed, `${key}|${[...key].reverse().join("")}`);
}

function note(state: GameState, text: string): void {
  const f = franchise(state);
  f.log.unshift({ date: state.date, text });
  f.log.splice(60);
}

/** Who controls a club now. */
export function controller(state: GameState, team: string): string {
  if (team === state.userTeam && tenure(state).role === "control") return state.ownerName;
  return franchise(state).control[team] ?? CONTROL[team] ?? "Unknown";
}

/** A club's debt: the player's real books for their own club, an estimate for the others. */
export function clubDebt(state: GameState, team: string): number {
  if (team === state.userTeam && state.debt) return totalDebt(state);
  const r = rand(state, `clubdebt-${team}`);
  return Math.min(LEAGUE_DEBT_LIMIT, Math.round(valuation(state, team) * (0.02 + r() * 0.05) / (10 * M)) * 10 * M);
}

/** An appraisal: the value and what drives it, with recent comparable sales. */
export function appraise(state: GameState, team: string): {
  value: number; revenue: number; national: number; local: number; operating: number; multiple: number; stadium: string; market: string; debt: number; equity: number; comps: string;
} {
  const value = valuation(state, team);
  const revenue = revenueEstimate(state, team);
  const national = Math.min(revenue, Math.round(revenue * 0.52));
  const sales = franchise(state).sales.filter((s) => s.pct >= 0.5).slice(-3);
  const debt = clubDebt(state, team);
  return {
    value, revenue, national, local: revenue - national, operating: operatingEstimate(state, team), multiple: value / Math.max(1, revenue),
    stadium: STRUCTURE_LABEL[STADIUM_BY_TEAM[team].structure], market: MARKETS[team].pull >= 1.15 ? "A big, rich market" : MARKETS[team].pull >= 1 ? "A solid market" : "A small market",
    debt, equity: value - debt,
    comps: sales.map((s) => `${TEAM_BY_ID[s.team]?.name ?? s.team} ${s.date.slice(0, 4)} at ${billions(s.price / s.pct)}`).join("; "),
  };
}

// ---- Sellers ----

function list(state: GameState, team: string, reason: Listing["reason"], ask?: number): Listing {
  const f = franchise(state);
  const r = rand(state, `list-${team}-${state.date}`);
  const l: Listing = {
    team, since: state.date, reason, seller: controller(state, team), ask: ask ?? Math.round(valuation(state, team) * (1 + r() * 0.12) / (50 * M)) * 50 * M,
    status: "open", closes: addDays(state.date, 150 + Math.floor(r() * 90)),
  };
  f.listings.unshift(l);
  f.listings.splice(30);
  return l;
}

/** Once a month a club may come up for sale (about one every four years) and listed clubs may sell to rival groups. */
function monthly(state: GameState): void {
  const f = franchise(state);
  const r = rand(state, `market-${state.date.slice(0, 7)}`);
  const open = f.listings.filter((l) => l.status === "open");
  if (open.length < 2 && r() < 0.022) {
    const pool = TEAMS.filter((t) => t.id !== state.userTeam && t.id !== "GB" && !open.some((l) => l.team === t.id));
    const t = pool[Math.floor(r() * pool.length)];
    const reasons: Listing["reason"][] = ["estate", "estate", "family", "liquidity", "governance"];
    const l = list(state, t.id, reasons[Math.floor(r() * reasons.length)]);
    news(state, `The ${TEAM_BY_ID[t.id].name} are for sale: ${l.seller} hired bankers to find a buyer`);
    note(state, `The ${TEAM_BY_ID[t.id].name} came up for sale. ${REASONS[l.reason]}`);
  }
}

/** A listed club the player isn't buying sells to a rival group, or the sale is called off. */
function settleListing(state: GameState, l: Listing): void {
  const f = franchise(state);
  if (f.deal && f.deal.team === l.team && f.deal.stage !== "failed" && f.deal.stage !== "closed") {
    if (f.deal.stage === "exclusive" || f.deal.stage === "league") { l.closes = addDays(state.date, 30); return; }
  }
  const r = rand(state, `settle-${l.team}-${l.since}`);
  if (r() < 0.15) {
    l.status = "withdrawn";
    note(state, `The ${TEAM_BY_ID[l.team].name} sale was called off.`);
    return;
  }
  const buyer = GROUPS[Math.floor(r() * GROUPS.length)];
  const price = Math.round(l.ask * (0.95 + r() * 0.1) / (50 * M)) * 50 * M;
  sold(state, l.team, price, buyer);
  l.status = "sold";
  l.buyer = buyer;
  l.price = price;
  if (f.deal?.team === l.team && f.deal.stage !== "closed") failDeal(state, f.deal, `${buyer} bought the club first.`);
}

/** Records a change of control. */
export function sold(state: GameState, team: string, price: number, buyer: string): void {
  const f = franchise(state);
  f.sales.push({ team, date: state.date, price, pct: 1, buyer });
  f.control[team] = buyer;
  news(state, `League owners approve the sale of the ${TEAM_BY_ID[team].name} to ${buyer} for about ${billions(price)}`);
  note(state, `The ${TEAM_BY_ID[team].name} sold to ${buyer} for ${billions(price)}.`);
}

// ---- The player's purchase ----

const DILIGENCE_COST = 0.0015;

/** Start pursuing a club: a listed one, or any club with an offer the seller may take. */
export function pursue(state: GameState, team: string): string | null {
  const f = franchise(state);
  if (f.deal && f.deal.stage !== "closed" && f.deal.stage !== "failed") return "You're already working on a deal.";
  if (team === state.userTeam && tenure(state).role === "control") return "You already own this club.";
  if (team === "GB") return "The Packers are owned by their shareholders and can't be bought.";
  const o = owner(state);
  const value = valuation(state, team);
  const cost = Math.round(Math.max(2 * M, value * DILIGENCE_COST));
  if (state.settings.finances !== "relaxed" && o.liquid < cost) return `Diligence costs about ${money(cost)} and you don't have the cash.`;
  const deal: ClubDeal = { id: `deal-${team}-${state.date}`, team, opened: state.date, stage: "diligence", due: addDays(state.date, 30), costs: cost, findings: [], rivals: [] };
  if (state.settings.finances !== "relaxed") o.liquid -= cost;
  f.deal = deal;
  note(state, `Hired advisers to look at the ${TEAM_BY_ID[team].name}.`);
  return null;
}

function findings(state: GameState, deal: ClubDeal): Finding[] {
  const r = rand(state, `diligence-${deal.id}`);
  const value = valuation(state, deal.team);
  const out: Finding[] = [];
  if (r() < 0.3) { const a = Math.round(value * (0.01 + r() * 0.03) / M) * M; out.push({ kind: "debt", text: `Stadium bonds the club guaranteed, about ${money(a)}, weren't in the sales materials.`, assumed: a, cashNeed: 0, valueHit: 0 }); }
  if (r() < 0.3) { const a = Math.round((5 + r() * 35) * M); out.push({ kind: "lawsuit", text: `A pending lawsuit could cost the club about ${money(a)}.`, assumed: a, cashNeed: 0, valueHit: 0 }); }
  if (r() < 0.25) out.push({ kind: "lease", text: "The stadium lease has rent escalators and a short term left; the city will want concessions.", assumed: 0, cashNeed: 0, valueHit: Math.round(value * 0.01) });
  if (r() < 0.35) { const a = Math.round((20 + r() * 60) * M); out.push({ kind: "guarantees", text: `Guaranteed player pay owed in cash this year runs about ${money(a)} more than the club's cash covers.`, assumed: 0, cashNeed: a, valueHit: 0 }); }
  if (r() < 0.3) { const a = Math.round((25 + r() * 125) * M); out.push({ kind: "capex", text: `Deferred stadium and facility work: about ${money(a)} is due soon.`, assumed: 0, cashNeed: a, valueHit: 0 }); }
  if (r() < 0.15) out.push({ kind: "books", text: "Local revenue was dressed up with one-time items; the run rate is lower than the books show.", assumed: 0, cashNeed: 0, valueHit: Math.round(value * (0.02 + r() * 0.03)) });
  return out;
}

/** What the advisers say the club is worth to a buyer, after the findings. */
export function fairPrice(state: GameState, deal: ClubDeal): number {
  return valuation(state, deal.team) - deal.findings.reduce((t, f) => t + f.valueHit, 0);
}

function rivalBids(state: GameState, deal: ClubDeal): RivalBid[] {
  const r = rand(state, `rivals-${deal.id}`);
  const value = valuation(state, deal.team);
  const n = 1 + Math.floor(r() * 3) - (inRecession(state) ? 1 : 0);
  const out: RivalBid[] = [];
  for (let i = 0; i < Math.max(0, n); i++) {
    const name = GROUPS[Math.floor(r() * GROUPS.length)];
    if (out.some((b) => b.name === name)) continue;
    const cash = r() < 0.5;
    out.push({ name, price: Math.round(value * (0.95 + r() * 0.12) / (25 * M)) * 25 * M, cash, note: cash ? "All cash, no financing condition" : "Subject to its lenders' approval" });
  }
  return out.sort((a, b) => b.price - a.price);
}

/** Bid for the club. A financing condition protects you but sellers like it less. */
export function placeBid(state: GameState, price: number, financingOut: boolean): string | null {
  const deal = franchise(state).deal;
  if (!deal || (deal.stage !== "bidding")) return "There's no club to bid on right now.";
  if (price < valuation(state, deal.team) * 0.8) return "The seller won't look at a bid that far under the club's value.";
  deal.bid = { price: Math.round(price), financingOut, date: state.date };
  if (!deal.rivals.length) deal.rivals = rivalBids(state, deal);
  deal.due = addDays(state.date, 10);
  note(state, `Bid ${billions(price)} for the ${TEAM_BY_ID[deal.team].name}${financingOut ? ", subject to financing" : ""}.`);
  return null;
}

/** The seller weighs the bids: price, then certainty. */
function sellerDecides(state: GameState, deal: ClubDeal): void {
  const listing = franchise(state).listings.find((l) => l.team === deal.team && l.status === "open");
  const bid = deal.bid!;
  const r = rand(state, `decide-${deal.id}-${bid.date}`);
  const standing = state.standing ? (standingState(state).league - 50) / 1000 : 0;
  const ours = bid.price * (bid.financingOut ? 0.97 : 1) * (1 + standing);
  const best = deal.rivals[0];
  const theirs = best ? best.price * (best.cash ? 1 : 0.97) * (0.98 + r() * 0.04) : 0;
  // An offer for a club that isn't for sale has to be too good to refuse.
  const reluctance = listing ? 1 : 1.2 + r() * 0.15;
  if (ours >= theirs && bid.price >= valuation(state, deal.team) * reluctance * (listing ? 0.97 : 1)) {
    deal.stage = "exclusive";
    deal.due = addDays(state.date, 60);
    if (!listing) list(state, deal.team, "offer", bid.price);
    note(state, `The seller accepted your bid of ${billions(bid.price)} and gave you 60 days of exclusivity.`);
    send(state, "business", "Your deal advisers", `Exclusivity on the ${TEAM_BY_ID[deal.team].name}`,
      `The seller took your bid of ${billions(bid.price)}. You have 60 days to line up the money (Ownership > Deals) and send it to the league.`);
    return;
  }
  const raise = Math.round(Math.max(theirs * 1.02, valuation(state, deal.team) * reluctance) / (25 * M)) * 25 * M;
  addMemo(state, {
    kind: "general", from: "Your deal advisers", title: `Outbid for the ${TEAM_BY_ID[deal.team].name}`,
    problem: listing
      ? `The seller prefers ${best ? `${best.name}'s ${billions(best.price)} (${best.note.toLowerCase()})` : "to wait"} over your ${billions(bid.price)}.`
      : `The owner says the club isn't for sale at ${billions(bid.price)}.`,
    proposal: `Raise to ${billions(raise)}.`, amount: raise,
    options: [
      { label: `Raise to ${billions(raise)}`, effect: "Likely enough to win exclusivity." },
      { label: "Walk away", effect: "The diligence money is spent." },
    ],
    risks: ["Overpaying shows up in your return for years."], budget: "Your own money and partners'.", recommend: raise > fairPrice(state, deal) * 1.08 ? 1 : 0,
    deadline: addDays(state.date, 10), ifLate: "You walk away.", payload: { franchise: "outbid", deal: deal.id, raise },
  });
  deal.due = addDays(state.date, 11);
}

/** The money for the deal: limited partners, approved funds, debt and the family trust. The rest is the owner's. */
export function setFinancing(state: GameState, f: { lp: number; pe: number; debt: number; trust: number; terms: StakeTerms }): string | null {
  const deal = franchise(state).deal;
  if (!deal || deal.stage !== "exclusive") return "Financing comes after the seller gives you exclusivity.";
  if (f.lp + f.pe > 1 - OWNERSHIP_RULES.controlMin + 1e-9) return "You must keep at least 30% yourself.";
  if (f.pe > OWNERSHIP_RULES.fundCap + 1e-9) return "Funds can hold at most 10% of a club.";
  const assumed = clubDebt(state, deal.team) + deal.findings.reduce((t, x) => t + (x.kind === "debt" ? x.assumed : 0), 0);
  if (assumed + f.debt > LEAGUE_DEBT_LIMIT) return `With the club's ${money(assumed)} of debt, the league's limit leaves room for ${money(Math.max(0, LEAGUE_DEBT_LIMIT - assumed))} of acquisition debt.`;
  if (f.trust > wealth(state).trust) return "The family trust doesn't hold that much.";
  deal.financing = { ...f };
  const s = sources(state, deal);
  if (s.short > 0) return `You'd be ${money(s.short)} short. Bring in more partners or debt, or sell holdings.`;
  return null;
}

/** Where the money for the deal comes from, and what the owner puts in. */
export function sources(state: GameState, deal: ClubDeal): { equityPrice: number; costs: number; lp: number; pe: number; debt: number; trust: number; proceeds: number; owner: number; available: number; short: number; assumed: number; claims: number; cash: number } {
  const price = deal.bid?.price ?? valuation(state, deal.team);
  const f = deal.financing ?? { lp: 0, pe: 0, debt: 0, trust: 0, terms: "standard" as StakeTerms };
  const assumed = clubDebt(state, deal.team) + deal.findings.reduce((t, x) => t + (x.kind === "debt" ? x.assumed : 0), 0);
  const claims = deal.findings.reduce((t, x) => t + (x.kind === "lawsuit" ? x.assumed : 0), 0);
  const cash = 100 * M;
  // The headline price is for the whole club, debt included: the seller gets it less the debt and claims the buyer takes on, plus the club's cash.
  const stake = tenure(state).role === "minority" && deal.team === state.userTeam ? tenure(state).stake ?? 0 : 0;
  const equityPrice = Math.max(0, (price - assumed - claims + cash) * (1 - stake));
  const costs = Math.round(price * 0.0025 + 8 * M + f.debt * 0.01 + 1 * M);
  const lp = Math.round((equityPrice - f.debt) * f.lp);
  const pe = Math.round((equityPrice - f.debt) * f.pe);
  const proceeds = sellProceeds(state, deal.team);
  const ownerNeed = equityPrice + costs - lp - pe - f.debt - f.trust - proceeds;
  const o = owner(state);
  const h = wealth(state).holdings;
  const available = o.liquid + 0.99 * (h.stocks + h.bonds) + 0.85 * (h.realEstate + h.business);
  return { equityPrice, costs, lp, pe, debt: f.debt, trust: f.trust, proceeds, owner: Math.max(0, ownerNeed), available, short: Math.max(0, ownerNeed - available), assumed, claims, cash };
}

/** What the owner would net from selling the club they control now, as they must before owning another. */
export function sellProceeds(state: GameState, buying: string): number {
  if (tenure(state).role !== "control" || buying === state.userTeam || !state.business) return 0;
  const price = valuation(state, state.userTeam) * 0.98;
  const equity = (price - totalDebt(state) + Math.max(0, cashBalance(state))) * ownerShare(state);
  const o = owner(state);
  const basis = (o.equityIn ?? o.purchase) + o.putIn - o.takenOut;
  return Math.round(equity - Math.max(0, equity - basis) * 0.238);
}

/** Send the deal to the league: the finance committee, then the owners' vote. */
export function submitDeal(state: GameState): string | null {
  const deal = franchise(state).deal;
  if (!deal || deal.stage !== "exclusive") return "There's no deal ready for the league.";
  if (!deal.financing) return "Line up the financing first.";
  const s = sources(state, deal);
  if (s.short > 0) return `You're ${money(s.short)} short.`;
  deal.stage = "league";
  deal.due = addDays(state.date, 45);
  note(state, `Sent the ${TEAM_BY_ID[deal.team].name} purchase to the league's finance committee.`);
  return null;
}

/** The lenders and partners confirm, the committee reviews, and 24 owners must vote yes. */
function leagueDecides(state: GameState, deal: ClubDeal): void {
  const r = rand(state, `vote-${deal.id}`);
  const f = deal.financing!;
  const s = sources(state, deal);
  // Lenders can pull out, more often in a recession or on a heavily borrowed deal.
  const lever = f.debt / Math.max(1, s.equityPrice);
  if (f.debt > 0 && r() < 0.04 + (inRecession(state) ? 0.12 : 0) + (lever > 0.25 ? 0.08 : 0)) {
    failDeal(state, deal, "The lenders backed out before closing.");
    return;
  }
  const rel = owners(state).relations;
  let yes = 1; // the selling club
  let voters = 0;
  for (const t of TEAMS) {
    if (t.id === deal.team) continue;
    if (t.id === state.userTeam && tenure(state).role === "control") continue;
    voters++;
    const rapport = rel[t.id]?.rapport ?? 0;
    const p = 0.9 + rapport / 250 - lever * 0.3 - (standingState(state).league < 40 ? 0.1 : 0);
    if (r() < p) yes++;
  }
  void voters;
  deal.vote = { yes, needed: 24 };
  if (yes < 24) {
    failDeal(state, deal, `The owners voted it down: ${yes} for, 24 needed.`);
    return;
  }
  closeDeal(state, deal);
}

export function failDeal(state: GameState, deal: ClubDeal, why: string): void {
  deal.stage = "failed";
  deal.failed = why;
  franchise(state).deals.unshift({ team: deal.team, opened: deal.opened, outcome: `Failed: ${why}` });
  note(state, `The ${TEAM_BY_ID[deal.team].name} deal failed. ${why}`);
  send(state, "business", "Your deal advisers", `The ${TEAM_BY_ID[deal.team].name} deal is off`, `${why} The costs so far, ${money(deal.costs)}, are spent.`);
}

export function walkAway(state: GameState): string | null {
  const deal = franchise(state).deal;
  if (!deal || deal.stage === "closed" || deal.stage === "failed") return "No deal in progress.";
  failDeal(state, deal, "You walked away.");
  return null;
}

/** Decide a franchise memo (from memos.ts). */
export function resolveFranchiseMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  const deal = franchise(state).deal;
  if (p.franchise === "outbid") {
    if (!deal || deal.id !== p.deal || deal.stage !== "bidding") return "That deal has moved on.";
    if (choice === 0) return placeBid(state, p.raise as number, deal.bid?.financingOut ?? false);
    failDeal(state, deal, "You walked away.");
  }
  return null;
}

export function franchiseDaily(state: GameState): void {
  const f = franchise(state);
  if (state.date.slice(8, 10) === "01") monthly(state);
  for (const l of f.listings.filter((x) => x.status === "open" && x.closes <= state.date)) settleListing(state, l);
  const deal = f.deal;
  if (!deal || deal.stage === "closed" || deal.stage === "failed" || state.date < deal.due) return;
  if (deal.stage === "diligence") {
    deal.findings = findings(state, deal);
    deal.stage = "bidding";
    deal.due = addDays(state.date, 60);
    send(state, "business", "Your deal advisers", `Diligence on the ${TEAM_BY_ID[deal.team].name}`,
      `${deal.findings.length ? deal.findings.map((x) => x.text).join(" ") : "Nothing worrying turned up."} We'd put a fair price near ${billions(fairPrice(state, deal))}. Bid from Ownership > Deals.`);
  } else if (deal.stage === "bidding") {
    if (deal.bid && deal.bid.date >= addDays(state.date, -11) && !openMemos(state).some((m) => m.payload?.franchise)) sellerDecides(state, deal);
    else if (!deal.bid || daysBetween(deal.bid.date, state.date) > 30) failDeal(state, deal, "The seller moved on without a bid from you.");
  } else if (deal.stage === "exclusive") {
    failDeal(state, deal, "Exclusivity ran out before the deal went to the league.");
  } else if (deal.stage === "league") {
    leagueDecides(state, deal);
  }
}

/** For tests: run a deal straight to the league's decision. */
export function forceDeal(state: GameState, team: string, f: { lp: number; pe: number; debt: number; trust: number; terms: StakeTerms } = { lp: 0.2, pe: 0, debt: 0, trust: 0, terms: "standard" }): ClubDeal {
  const fm = franchise(state);
  fm.deal = { id: `deal-${team}-${state.date}`, team, opened: state.date, stage: "exclusive", due: addDays(state.date, 60), costs: 0, findings: [], rivals: [], bid: { price: valuation(state, team), financingOut: false, date: state.date } };
  const err = setFinancing(state, f);
  if (err) throw new Error(err);
  closeDeal(state, fm.deal);
  return fm.deal;
}

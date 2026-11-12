// Taking over a club: closing a purchase, moving the player from one club to
// another, and the ways into the game other than buying a club outright.
//
// The player can control one club at a time. Buying a new one sells the old
// one at closing to a buyer group (made up), and the player steps into the
// new club as it stands: its contracts, history, lease and stadium, its debt
// and lawsuits from diligence, a new set of executives with their contracts,
// and partners who came in on the deal. League-wide things (players, the
// schedule, records, other clubs' stadium projects) carry on untouched.
//
// A game can also start with the player as a buyer still looking (the club in
// view is run by its owner's staff and the pages are read-only), or as a
// minority partner who gets reports and distributions, can buy more from
// the controlling owner, and can bid for control.
import { billions, business, cashBalance, post, valuation } from "./business";
import { approvePlan, books, reserveTarget } from "./books";
import { ensureClubhouse } from "./clubhouse";
import { leagueYear } from "./contracts";
import { ensureCulture } from "./culture";
import { addDays } from "./dates";
import { acquisitionLoan, debt, openLoans, totalDebt } from "./debt";
import { addMemo, setMode, AREA_KEYS } from "./delegation";
import { ensureExecs } from "./executives";
import { franchise, controller, sold, sources } from "./franchisemarket";
import { money, news, send } from "./inbox";
import { callCapital, investors, ownerShare } from "./investors";
import { TEAM_BY_ID } from "./league";
import { bindLeases } from "./leases";
import { bindBrand } from "./merch";
import { owners } from "./owners";
import { addStory, MEDIA_BY_ID, mediaState } from "./outlets";
import { owner, ownerEquity } from "./ownership";
import { rngFor } from "./rng";
import { ensureScouts } from "./scouts";
import { ensureAnalytics } from "./strategy";
import type { ClubDeal, GameState, Memo, Partner, TenureState } from "./types";
import { syncHoldings, wealth } from "./wealth";

const M = 1_000_000;

export function tenure(state: GameState): TenureState {
  return (state.tenure ??= { role: "control", clubs: [{ team: state.userTeam, from: state.owner?.since ?? state.date, how: "Bought outright", price: state.owner?.purchase }] });
}

export function inControl(state: GameState): boolean {
  return !state.tenure || state.tenure.role === "control";
}

/** Club slices that belong to the club the player runs, rebuilt for a new club. */
const CLUB_SLICES = [
  "business", "fans", "merch", "teamMedia", "venue", "facilities", "community", "departments", "program", "crisis", "legal", "review", "books", "debt",
  "investors", "execs", "office", "culture", "analytics", "gameWeek", "scouts", "gameOps", "standing", "people", "treasury", "shocks", "politics",
] as const;

/**
 * Move the player to another club: the old club's slices go (it returns to
 * a controlling owner of its own) and the new club's are built as they
 * stand today. The old club keeps a name the player gave it.
 */
export function switchClub(state: GameState, team: string): void {
  const old = state.userTeam;
  if (old === team) return;
  const t = tenure(state);
  if (state.merch && TEAM_BY_ID[old]) (t.brands ??= {})[old] = TEAM_BY_ID[old].name;
  const st = state as unknown as Record<string, unknown>;
  const league = state.standing?.league;
  for (const k of CLUB_SLICES) delete st[k];
  // Mixed slices keep their league-wide parts.
  if (state.construction) { delete state.construction.plan; delete state.construction.temporary; delete state.construction.exploreRelocation; }
  if (state.relocation) {
    const r = state.relocation;
    r.studies = [];
    r.bids = r.bids.filter((b) => b.team !== old);
    delete r.legacy; delete r.lameDuck;
    r.feeLeft = 0; r.feeYears = 0;
  }
  if (state.global) {
    const g = state.global;
    g.rights = []; delete g.application; delete g.hedge; g.deals = []; delete g.offer; g.trips = {}; g.pathway.joined = false;
  }
  if (state.compliance) {
    const cases = state.compliance.leagueCases;
    delete state.compliance;
    state.compliance = { leagueCases: cases } as unknown as GameState["compliance"];
  }
  if (state.clubhouse) {
    const { chem, core } = state.clubhouse;
    delete state.clubhouse;
    state.clubhouse = { chem, core } as unknown as GameState["clubhouse"];
  }
  if (state.trades) state.trades.offers = state.trades.offers.filter((o) => o.status !== "open");
  if (state.trades) state.trades.block = [];
  state.negotiations = {};
  delete state.cutPlan;
  // The other owners: the old club has a new owner, and the new club is ours.
  const o = owners(state);
  o.relations[old] = { rapport: 0, tradition: 0.5, influence: 0.3 };
  delete o.relations[team];
  if (state.media) state.media.coach = 50;
  state.pressure = { fans: 50, media: 50 };
  state.userTeam = team;
  // The new club as it stands.
  const clubhouse = state.clubhouse as unknown as { chem: Record<string, number>; core: Record<string, unknown> } | undefined;
  if (clubhouse) {
    delete state.clubhouse;
    ensureClubhouse(state);
    Object.assign(state.clubhouse!, { chem: clubhouse.chem, core: clubhouse.core });
  } else ensureClubhouse(state);
  business(state);
  debt(state);
  books(state);
  ensureExecs(state);
  ensureCulture(state);
  ensureAnalytics(state);
  ensureScouts(state);
  approvePlan(state, leagueYear(state.date));
  bindLeases(state);
  bindBrand(state);
  if (league !== undefined && state.standing) state.standing.league = league;
}

/** The deal closes: money moves, the old club is sold if there is one, and the player takes control. */
export function closeDeal(state: GameState, deal: ClubDeal): void {
  const t = tenure(state);
  const o = owner(state);
  const f = deal.financing!;
  const s = sources(state, deal);
  const price = deal.bid?.price ?? valuation(state, deal.team);
  const real = state.settings.finances !== "relaxed";
  const oldTeam = state.userTeam;
  const sameClub = deal.team === oldTeam;
  const priorStake = t.role === "minority" && sameClub ? t.stake ?? 0 : 0;
  // Selling the club the player controls now: the old club's partners take their shares, the owner takes theirs less tax.
  if (t.role === "control" && !sameClub) {
    const salePrice = Math.round(valuation(state, oldTeam) * 0.98 / (25 * M)) * 25 * M;
    const buyer = ["the Ashgrove group", "the Kincaid family", "a group led by a private-equity founder"][Math.floor(rngFor(state.seed, `oldsale-${deal.id}`)() * 3)];
    sold(state, oldTeam, salePrice, buyer);
    const rec = t.clubs.find((c) => c.team === oldTeam && !c.to);
    if (rec) { rec.to = state.date; rec.proceeds = s.proceeds; rec.how += `; sold to ${buyer} for ${billions(salePrice)}`; }
    o.log.unshift({ date: state.date, text: `Sold the ${TEAM_BY_ID[oldTeam].name} to ${buyer} for ${billions(salePrice)}; your part came to ${money(s.proceeds)} after tax.` });
    if (real) o.liquid += s.proceeds;
  } else if (t.role !== "control" && !sameClub) {
    const rec = t.clubs.find((c) => c.team === oldTeam && !c.to);
    if (rec) rec.to = state.date;
    // A minority stake in another club has to be sold too.
    if (t.role === "minority" && t.stake) {
      const proceeds = Math.round(ownerEquity(state) * 0.95);
      if (real) o.liquid += proceeds;
      if (rec) rec.proceeds = proceeds;
      o.log.unshift({ date: state.date, text: `Sold your ${Math.round(t.stake * 100)}% of the ${TEAM_BY_ID[oldTeam].name} for ${money(proceeds)}.` });
    }
  }
  // The owner's own money: cash first, then quick holdings, then slow ones at a discount.
  if (real) payFromWealth(state, s.owner);
  if (f.trust > 0) wealth(state).trust -= f.trust;
  if (!sameClub) switchClub(state, deal.team);
  // The club as bought: its debt, the acquisition loan, the claims found in diligence.
  const d = debt(state);
  if (s.assumed > 0 && !sameClub) {
    d.loans.push({
      id: `LA-${state.date}`, lender: "Existing club lenders", amount: s.assumed, years: 6, kind: "floating", rate: 0.02, amort: "bullet", fee: 0,
      minCoverage: 1.25, maxLeverage: 6, security: "The club's media revenue", start: state.date, maturity: addDays(state.date, 6 * 365), balance: s.assumed, stepUp: 0, breaches: 0,
      purpose: "Debt taken on with the club",
    });
  }
  if (f.debt > 0) acquisitionLoan(state, f.debt);
  if (s.claims > 0) post(state, "legal", -Math.round(s.claims * 0.5), "Lawsuit inherited with the club: first settlement payment");
  // The ownership group: limited partners and funds who came in on the deal.
  const inv = investors(state);
  inv.partners = [];
  const r = rngFor(state.seed, `partners-${deal.id}`);
  const lpNames = ["the Corwin family office", "Helena Strand", "Marcus Okonjo", "the Bramwell family office", "Jonah Pell"];
  const add = (name: string, kind: Partner["kind"], pct: number, paid: number) => inv.partners.push({
    id: `lp-${deal.id}-${inv.partners.length}`, name, kind, pct, since: state.date, paid, calls: 0, distributions: 0, mood: 62, board: pct >= 0.1 || f.terms === "investor",
    terms: f.terms, putFrom: f.terms === "investor" ? addDays(state.date, 7 * 365) : undefined, complaints: 0, background: kind === "fund" ? "An approved private-equity fund" : "Came in with you on the purchase", entryValue: price,
  });
  if (f.lp > 0) {
    const n = f.lp >= 0.3 ? 3 : f.lp >= 0.15 ? 2 : 1;
    for (let i = 0; i < n; i++) add(lpNames[Math.floor(r() * lpNames.length)] + (i ? ` ${i + 1}` : ""), i === 0 ? "family" : "individual", f.lp / n, s.lp / n);
  }
  if (f.pe > 0) add("Harborline Sports Partners", "fund", f.pe, s.pe);
  // The minority partner who buys control keeps their old stake as part of the new one.
  t.role = "control";
  delete t.stake;
  delete t.controller;
  const share = ownerShare(state);
  o.purchase = price;
  o.since = state.date;
  o.putIn = 0;
  o.takenOut = 0;
  o.equityIn = Math.round(s.owner + s.trust + s.proceeds - s.costs + priorStake * (price - s.assumed - s.claims + s.cash));
  o.clubEquityIn = Math.round(price - s.assumed - f.debt - s.claims);
  delete o.coachTarget;
  delete o.suggestion;
  deal.stage = "closed";
  deal.closing = { price, assumedDebt: s.assumed, claims: s.claims, cash: s.cash, equityPrice: s.equityPrice, costs: s.costs, ownerEquity: s.owner, partners: s.lp + s.pe, debt: f.debt, trust: f.trust, proceeds: s.proceeds, share };
  const fm = franchise(state);
  fm.deals.unshift({ team: deal.team, opened: deal.opened, outcome: `Bought for ${billions(price)}` });
  const listing = fm.listings.find((l) => l.team === deal.team && l.status === "open");
  if (listing) { listing.status = "sold"; listing.buyer = state.ownerName; listing.price = price; }
  fm.sales.push({ team: deal.team, date: state.date, price, pct: 1, buyer: state.ownerName });
  fm.control[deal.team] = state.ownerName;
  if (!sameClub || priorStake) t.clubs.push({ team: deal.team, from: state.date, how: priorStake ? "Bought control as a minority partner" : "Bought", price, share });
  else { const rec = t.clubs.find((c) => c.team === deal.team && !c.to); if (rec) { rec.how = "Bought"; rec.price = price; rec.share = share; } }
  o.log.unshift({ date: state.date, text: `Bought the ${TEAM_BY_ID[deal.team].name} for ${billions(price)}, with ${Math.round(share * 100)}% of the club yours.` });
  news(state, `League owners approve ${state.ownerName}'s purchase of the ${TEAM_BY_ID[deal.team].name} for about ${billions(price)}`);
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [deal.team],
    headline: `${state.ownerName} takes over the ${TEAM_BY_ID[deal.team].name}`,
    body: `The purchase, at about ${billions(price)}, closed after the owners' vote (${deal.vote?.yes ?? 24} in favor). The club's ${money(s.assumed)} of debt came with it.`,
  });
  mediaState(state);
  afterClosing(state, deal);
}

/** The owner's part of a purchase: cash, then stocks and bonds, then property and businesses at a discount. */
export function payFromWealth(state: GameState, amount: number): void {
  const o = owner(state);
  syncHoldings(state);
  const h = wealth(state).holdings;
  let need = amount;
  const fromCash = Math.min(o.liquid, need);
  o.liquid -= fromCash;
  need -= fromCash;
  for (const [k, cut] of [["stocks", 0.99], ["bonds", 0.99], ["realEstate", 0.85], ["business", 0.85]] as const) {
    if (need <= 0) break;
    const sell = Math.min(h[k], need / cut);
    h[k] -= sell;
    need -= sell * cut;
  }
  o.outside = Math.max(0, Math.round(h.stocks + h.bonds + h.realEstate + h.business));
  if (need > 1) o.personalDebt += need;
}

/** Right after closing: what the club needs that its cash doesn't cover. */
function afterClosing(state: GameState, deal: ClubDeal): void {
  const need = deal.findings.reduce((t, x) => t + x.cashNeed, 0) + Math.max(0, reserveTarget(state) - cashBalance(state));
  const exec = "Chief financial officer";
  const commitments = [
    `${openLoans(state).length} loan${openLoans(state).length === 1 ? "" : "s"} totaling ${money(totalDebt(state))}`,
    ...deal.findings.map((x) => x.text),
  ];
  send(state, "business", exec, `Welcome to the ${TEAM_BY_ID[state.userTeam].name}`,
    `Here's what we took on: ${commitments.join(" ")} The executives' contracts, the lease, every player contract and the club's history carry over as they were.`);
  if (need >= 10 * M) {
    addMemo(state, {
      kind: "general", from: exec, title: "New capital the club needs",
      problem: `After closing, the club needs about ${money(need)} it doesn't have on hand: ${deal.findings.filter((x) => x.cashNeed).map((x) => x.kind === "capex" ? "stadium work" : "guaranteed pay").join(" and ") || "a cash cushion"}.`,
      proposal: `Call ${money(need)} from every partner now.`, amount: need,
      options: [
        { label: `Call ${money(need)} from the partners`, effect: "Everyone pays their share; the club starts with a proper cushion." },
        { label: "Run on the credit line", effect: "No money now; interest, and a capital call later if the line runs out." },
      ],
      risks: ["New owners who start short end up with an emergency call."], budget: "Your own money for your share.",
      recommend: 0, deadline: addDays(state.date, 14), ifLate: "We run on the credit line.", payload: { takeover: "capital", amount: need },
    });
  }
}

/** Decide a takeover memo (from memos.ts). */
export function resolveTakeoverMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  if (p.takeover === "capital" && choice === 0) {
    const amount = p.amount as number;
    post(state, "capital", amount, "Capital call after the purchase");
    callCapital(state, amount, "After the purchase");
  }
  return null;
}

// ---- Other ways in ----

/** Start as a buyer: the club in view belongs to its owner, who is selling. */
export function startAsBuyer(state: GameState): void {
  const t = tenure(state);
  t.role = "buyer";
  t.stake = 0;
  t.controller = controller(state, state.userTeam);
  t.clubs = [];
  const o = owner(state);
  o.purchase = 0;
  o.equityIn = 0;
  for (const a of AREA_KEYS) setMode(state, a, "delegate", true);
  const fm = franchise(state);
  if (!fm.listings.some((l) => l.team === state.userTeam && l.status === "open")) {
    fm.listings.unshift({ team: state.userTeam, since: state.date, reason: "estate", seller: t.controller, ask: Math.round(valuation(state, state.userTeam) * 1.05 / (50 * M)) * 50 * M, status: "open", closes: addDays(state.date, 200) });
  }
  o.log.unshift({ date: state.date, text: `Came in as a buyer for the ${TEAM_BY_ID[state.userTeam].name}, which ${t.controller} has put up for sale.` });
}

/** Start as a minority partner with a stake bought at a discount for lack of control. */
export function startAsMinority(state: GameState, stake = 0.1): void {
  const t = tenure(state);
  t.role = "minority";
  t.stake = stake;
  t.controller = controller(state, state.userTeam);
  const value = valuation(state, state.userTeam);
  const paid = Math.round((value - totalDebt(state) + cashBalance(state)) * stake * 0.9);
  t.clubs = [{ team: state.userTeam, from: state.date, how: "Bought a minority stake", price: paid, share: stake }];
  const o = owner(state);
  o.purchase = value;
  o.equityIn = paid;
  for (const a of AREA_KEYS) setMode(state, a, "delegate", true);
  o.log.unshift({ date: state.date, text: `Bought ${Math.round(stake * 100)}% of the ${TEAM_BY_ID[state.userTeam].name} from ${t.controller} for ${money(paid)}.` });
}

/** A minority partner buys more from the controlling owner, if they'll sell, up to 49%. */
export function buyMore(state: GameState, pct: number): string | null {
  const t = tenure(state);
  if (t.role !== "minority") return "Only a minority partner buys in this way.";
  if ((t.stake ?? 0) + pct > 0.49 + 1e-9) return "The controlling owner keeps control: you can hold at most 49%.";
  const r = rngFor(state.seed, `buymore-${state.date}`);
  if (r() < 0.35) return `${t.controller} isn't selling more right now.`;
  const price = Math.round((valuation(state, state.userTeam) - totalDebt(state) + cashBalance(state)) * pct * 0.95);
  const o = owner(state);
  if (state.settings.finances !== "relaxed") {
    if (o.liquid + 0.99 * (wealth(state).holdings.stocks + wealth(state).holdings.bonds) < price) return `That's ${money(price)}, more than you can raise quickly.`;
    payFromWealth(state, price);
  }
  t.stake = (t.stake ?? 0) + pct;
  o.equityIn = (o.equityIn ?? 0) + price;
  const rec = t.clubs.find((c) => c.team === state.userTeam && !c.to);
  if (rec) rec.share = t.stake;
  o.log.unshift({ date: state.date, text: `Bought another ${Math.round(pct * 100)}% of the club for ${money(price)}; you hold ${Math.round(t.stake * 100)}%.` });
  return null;
}

/** Each April the controlling owner pays a distribution, and a minority partner gets their share. */
function minorityDistribution(state: GameState): void {
  const t = tenure(state);
  if (t.role !== "minority" || !t.stake) return;
  const cash = cashBalance(state);
  const spare = Math.max(0, cash - reserveTarget(state));
  const total = Math.round(Math.min(spare, valuation(state, state.userTeam) * 0.01) / M) * M;
  if (total <= 0) return;
  post(state, "distribution", -total, `Distribution by ${t.controller}`);
  const ours = Math.round(total * t.stake);
  const o = owner(state);
  o.takenOut += ours;
  if (state.settings.finances !== "relaxed") o.liquid += ours;
  send(state, "business", t.controller ?? "The controlling owner", "Annual distribution", `The club paid out ${money(total)} to its owners; your ${Math.round(t.stake * 100)}% came to ${money(ours)}.`);
}

export function takeoverDaily(state: GameState): void {
  if (!state.tenure) return;
  if (state.date.slice(5) === "04-20") minorityDistribution(state);
}

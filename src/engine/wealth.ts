// The owner's own money outside the club: what it's in, what it earns, what
// it owes, and what the owner does with it.
//
// Outside holdings are split four ways: public stocks, bonds, real estate and
// the owner's own operating businesses (how much of each depends on how the
// owner made their money). Each earns a return month by month from the
// national economy (economy.ts): stocks and businesses fall in recessions,
// bonds pay the going rate, property follows real-estate prices. Stocks and
// bonds sell in a day; property takes about three months and a business
// about six, at a discount. Personal debt costs the market rate plus two
// points; borrowing against holdings is allowed up to a limit, and a margin
// call sells stocks when prices fall too far.
//
// None of this touches the club's books or the cap. It shapes what the owner
// can afford: capital calls, buyouts and a stake in the team that may be too
// much of everything they own. The owner can also hire a family office, move
// money into a family trust, endow a personal foundation (separate from the
// club's), choose how public to be, and must handle conflicts between their
// businesses and the club. The businesses and conflicts are made up.
import { billions, post } from "./business";
import { culture } from "./culture";
import { addDays } from "./dates";
import { marketRate } from "./debt";
import { addMemo, openMemos } from "./delegation";
import { money, send } from "./inbox";
import { investors, ownerShare } from "./investors";
import { TEAM_BY_ID } from "./league";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { equityAtPurchase, owner, ownerEquity } from "./ownership";
import { gaussian, rngFor } from "./rng";
import { standingState } from "./standing";
import type { GameState, Holding, Memo, OwnerBackground, WealthState } from "./types";

const M = 1_000_000;

export const HOLDINGS: Record<Holding, { label: string; days: number; cost: number; what: string }> = {
  stocks: { label: "Public stocks", days: 0, cost: 0.01, what: "Sell in a day for about 1% in costs. They swing with the market." },
  bonds: { label: "Bonds", days: 0, cost: 0.005, what: "Pay about the going interest rate and hardly move." },
  realEstate: { label: "Real estate", days: 90, cost: 0.06, what: "Follow property prices; a sale takes about three months and 6%." },
  business: { label: "Your businesses", days: 180, cost: 0.1, what: "Your own companies: the best returns and the worst in a recession; a sale takes about six months at 10% off." },
};
export const HOLDING_KEYS = Object.keys(HOLDINGS) as Holding[];

/** How each kind of owner holds their outside money. */
const MIX: Record<OwnerBackground, Record<Holding, number>> = {
  industry: { stocks: 0.3, bonds: 0.1, realEstate: 0.1, business: 0.5 },
  finance: { stocks: 0.45, bonds: 0.2, realEstate: 0.15, business: 0.2 },
  realEstate: { stocks: 0.2, bonds: 0.1, realEstate: 0.6, business: 0.1 },
  family: { stocks: 0.4, bonds: 0.3, realEstate: 0.2, business: 0.1 },
  exPlayer: { stocks: 0.4, bonds: 0.25, realEstate: 0.25, business: 0.1 },
};

/** Gifts to the owner's foundation reduce taxable income up to this share of it. */
const GIFT_LIMIT = 0.3;
/** Grants a private foundation must pay out each year, as a share of its endowment. */
const PAYOUT = 0.05;

export function wealth(state: GameState): WealthState {
  if (state.wealth) return state.wealth;
  const o = owner(state);
  const mix = MIX[o.background];
  // The money in the club so far, less what already came back out of it.
  const start = equityAtPurchase(state) + o.putIn - o.takenOut - (state.investors?.proceeds ?? 0);
  state.wealth = {
    holdings: { stocks: o.outside * mix.stocks, bonds: o.outside * mix.bonds, realEstate: o.outside * mix.realEstate, business: o.outside * mix.business },
    pending: [], index: 1, alt: start, seen: { putIn: o.putIn, takenOut: o.takenOut, proceeds: state.investors?.proceeds ?? 0 },
    familyOffice: false, trust: 0, foundation: { endowment: 0, focus: "education", givenThisYear: 0, granted: 0 },
    visibility: "engaged", profile: 50, conflicts: [], history: [], log: [],
  };
  return state.wealth;
}

function note(state: GameState, text: string): void {
  const w = wealth(state);
  w.log.unshift({ date: state.date, text });
  w.log.splice(50);
}

function rand(state: GameState, key: string) {
  return rngFor(state.seed, `${key}|${[...key].reverse().join("")}`);
}

/**
 * Other systems change `owner.outside` directly (a forced sale for a capital
 * call, a buyout). Bring the holdings in line: a drop comes out of the
 * quickest things to sell first, a rise goes into stocks.
 */
export function syncHoldings(state: GameState): void {
  const w = wealth(state);
  const o = owner(state);
  const total = HOLDING_KEYS.reduce((t, k) => t + w.holdings[k], 0);
  let gap = o.outside - total;
  if (Math.abs(gap) < 1) return;
  if (gap > 0) {
    w.holdings.stocks += gap;
    return;
  }
  for (const k of ["stocks", "bonds", "realEstate", "business"] as Holding[]) {
    const take = Math.min(w.holdings[k], -gap);
    w.holdings[k] -= take;
    gap += take;
    if (gap >= -1) break;
  }
}

function setOutside(state: GameState): void {
  const w = wealth(state);
  owner(state).outside = Math.max(0, Math.round(HOLDING_KEYS.reduce((t, k) => t + w.holdings[k], 0)));
}

/** What the owner is worth: their stake in the club, cash and holdings, less personal debt (the trust and foundation are no longer theirs). */
export function netWorth(state: GameState): { team: number; liquid: number; outside: number; pending: number; debt: number; total: number; concentration: number } {
  const o = owner(state);
  const w = wealth(state);
  const team = ownerEquity(state);
  const pending = w.pending.reduce((t, p) => t + p.proceeds, 0);
  const total = team + o.liquid + o.outside + pending - o.personalDebt;
  return { team, liquid: o.liquid, outside: o.outside, pending, debt: o.personalDebt, total, concentration: total > 0 ? team / total : 1 };
}

/** The share of the owner's wealth tied up in the team, in words. */
export function concentrationWord(c: number): string {
  return c >= 0.85 ? "Almost everything you own is the team" : c >= 0.65 ? "Most of what you own is the team" : c >= 0.4 ? "A large part of what you own is the team" : "Well spread out";
}

/** The team against the stock market: the owner's money in the club, had it gone into stocks instead. Money that came back out has already left `alt`. */
export function opportunityCost(state: GameState): { alt: number; stake: number; gap: number } {
  const ours = ownerEquity(state);
  const alt = wealth(state).alt;
  return { alt: Math.round(alt), stake: Math.round(ours), gap: Math.round(ours - alt) };
}

/** How much the owner can borrow against their holdings: 40% of stocks and bonds, 25% of property. */
export function borrowLimit(state: GameState): number {
  const h = wealth(state).holdings;
  return Math.round(0.4 * (h.stocks + h.bonds) + 0.25 * h.realEstate);
}

export function borrow(state: GameState, amount: number): string | null {
  syncHoldings(state);
  const o = owner(state);
  if (amount <= 0) return "Pick an amount.";
  if (o.personalDebt + amount > borrowLimit(state)) return `Lenders will go to ${money(borrowLimit(state))} against your holdings; you owe ${money(o.personalDebt)}.`;
  o.personalDebt += amount;
  o.liquid += amount;
  note(state, `Borrowed ${money(amount)} against your holdings.`);
  return null;
}

/** Sell holdings: stocks and bonds at once, property and businesses after a wait. */
export function sellHolding(state: GameState, kind: Holding, amount: number): string | null {
  syncHoldings(state);
  const w = wealth(state);
  const o = owner(state);
  const sell = Math.min(w.holdings[kind], Math.round(amount));
  if (sell <= 0) return "Nothing left to sell there.";
  const h = HOLDINGS[kind];
  // Slow assets fetch less in a recession.
  const slump = h.days && state.economy?.now.recession ? 0.1 : 0;
  const proceeds = Math.round(sell * (1 - h.cost - slump));
  w.holdings[kind] -= sell;
  setOutside(state);
  if (!h.days) {
    o.liquid += proceeds;
    note(state, `Sold ${money(sell)} of ${h.label.toLowerCase()}.`);
  } else {
    w.pending.push({ kind, amount: sell, proceeds, date: addDays(state.date, h.days) });
    note(state, `Put ${money(sell)} of ${h.label.toLowerCase()} up for sale; about ${money(proceeds)} should close in ${h.days / 30} months.`);
  }
  return null;
}

/** Put cash into holdings. */
export function invest(state: GameState, kind: Holding, amount: number): string | null {
  syncHoldings(state);
  const o = owner(state);
  if (kind === "business") return "Your businesses grow on their own; put money into stocks, bonds or property.";
  const put = Math.min(o.liquid, Math.round(amount));
  if (put <= 0) return "No cash on hand to invest.";
  o.liquid -= put;
  wealth(state).holdings[kind] += put;
  setOutside(state);
  note(state, `Put ${money(put)} into ${HOLDINGS[kind].label.toLowerCase()}.`);
  return null;
}

// ---- Family ----

/** A family office manages the holdings for a fee: steadier and a little better, about 0.75% a year. */
export function setFamilyOffice(state: GameState, on: boolean): void {
  const w = wealth(state);
  if (w.familyOffice === on) return;
  w.familyOffice = on;
  note(state, on ? "Hired a family office to manage your holdings." : "Closed the family office.");
}

/** Move money into a family trust: it stays in the family but is no longer yours to spend on the club. */
export function fundTrust(state: GameState, amount: number): string | null {
  syncHoldings(state);
  const o = owner(state);
  const w = wealth(state);
  const fromCash = Math.min(o.liquid, amount);
  const fromHoldings = Math.min(w.holdings.stocks + w.holdings.bonds, amount - fromCash);
  if (fromCash + fromHoldings < amount - 1) return "You don't have that much in cash, stocks and bonds.";
  o.liquid -= fromCash;
  let rest = fromHoldings;
  for (const k of ["bonds", "stocks"] as Holding[]) {
    const take = Math.min(w.holdings[k], rest);
    w.holdings[k] -= take;
    rest -= take;
  }
  setOutside(state);
  w.trust += amount;
  note(state, `Moved ${money(amount)} into a family trust.`);
  return null;
}

// ---- The owner's foundation ----

export const FOCUS: Record<WealthState["foundation"]["focus"], string> = {
  education: "Schools and scholarships", health: "Hospitals and medical research", city: "Neighborhoods in the club's city", arts: "Museums and the arts",
};

/** Give to the owner's own foundation: deductible up to 30% of the year's taxable income. */
export function giveToFoundation(state: GameState, amount: number): string | null {
  const o = owner(state);
  if (amount <= 0) return "Pick an amount.";
  if (amount > o.liquid) return "You don't have that much cash on hand.";
  const w = wealth(state);
  o.liquid -= amount;
  w.foundation.endowment += amount;
  w.foundation.givenThisYear += amount;
  note(state, `Gave ${money(amount)} to your foundation.`);
  return null;
}

export function setFocus(state: GameState, focus: WealthState["foundation"]["focus"]): void {
  wealth(state).foundation.focus = focus;
}

/** Called by closeOwnerYear: the year's gifts come off taxable income, up to the limit. */
export function giftDeduction(state: GameState, taxable: number): number {
  const w = state.wealth;
  if (!w) return 0;
  const d = Math.min(w.foundation.givenThisYear, Math.max(0, taxable) * GIFT_LIMIT);
  w.foundation.givenThisYear = 0;
  return Math.round(d);
}

export function setVisibility(state: GameState, v: WealthState["visibility"]): void {
  const w = wealth(state);
  if (w.visibility === v) return;
  w.visibility = v;
  note(state, { private: "Stepped back from public life.", engaged: "Kept a normal public profile.", spotlight: "Stepped into the spotlight." }[v]);
}

export function profileWord(p: number): string {
  return p >= 75 ? "Admired" : p >= 58 ? "Well regarded" : p >= 42 ? "Known, not much of an opinion" : p >= 25 ? "Doubted" : "Unpopular";
}

// ---- Conflicts between the owner's businesses and the club ----

const CONFLICTS = [
  {
    key: "supplier", title: "Your company wants a club contract",
    problem: (amount: number) => `One of your companies has bid ${money(amount)} a year to run the stadium's technology and concessions systems. It's a related-party deal: the league must be told, and partners will ask whether the price is fair.`,
  },
  {
    key: "betting", title: "A sports-betting stake in your portfolio",
    problem: () => "A fund you invest in through your businesses wants to take a stake in a sports-betting operator. League rules bar owners from gambling interests, even indirect ones.",
  },
  {
    key: "media", title: "Your company and the club's media rights",
    problem: () => "A media company you hold a stake in wants to bid for the club's local radio and streaming rights. The other bidders will say the process isn't fair.",
  },
];

function conflictMemo(state: GameState): void {
  const w = wealth(state);
  const r = rand(state, `conflict-${state.date}`);
  const c = CONFLICTS[Math.floor(r() * CONFLICTS.length)];
  const amount = Math.round((3 + r() * 5) * M);
  const options = c.key === "betting"
    ? [
        { label: "Make the fund leave you out", effect: "No stake for you; nothing changes." },
        { label: "Sell your interest in the fund", effect: `About ${money(w.holdings.business * 0.05)} of your businesses sold at a 10% discount, over six months.` },
        { label: "Let it go ahead", effect: "The league will find out. Expect a fine and an order to sell." },
      ]
    : [
        { label: "Recuse yourself and let the staff decide", effect: "Your company is out of it. Nothing changes." },
        { label: "Approve it with an independent fairness review", effect: `The club pays about ${money(400_000)} for the review; your company earns about ${money(amount * 0.15)} a year.` },
        { label: "Approve it as it stands", effect: `Your company earns about ${money(amount * 0.25)} a year; partners and the league may object.` },
      ];
  addMemo(state, {
    kind: "general", from: "General counsel", title: c.title, problem: c.problem(amount),
    proposal: options[0].label + ".", options, risks: ["Conflicts of interest are the easiest owner story for the press to write.", "The league fines owners who hide related-party deals."],
    budget: "None unless you choose otherwise.", recommend: 0, deadline: addDays(state.date, 21), ifLate: "Counsel keeps you out of it.",
    payload: { wealth: "conflict", conflict: c.key, amount },
  });
}

/** Decide a wealth memo. Called from memos.ts for general memos that carry `wealth` in the payload. */
export function resolveWealthMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  if (p.wealth !== "conflict") return null;
  const w = wealth(state);
  const o = owner(state);
  const amount = p.amount as number;
  const log = (outcome: string) => { w.conflicts.unshift({ date: state.date, what: m.title, outcome }); w.conflicts.splice(20); };
  if (choice === 0) { log("You stayed out of it."); return null; }
  if (p.conflict === "betting") {
    if (choice === 1) { sellHolding(state, "business", w.holdings.business * 0.05); log("You sold your interest in the fund."); return null; }
    post(state, "fines", -5 * M, "League fine: owner's indirect gambling interest");
    w.profile = Math.max(0, w.profile - 12);
    const st = standingState(state);
    st.league = Math.max(0, st.league - 10);
    st.incidents.unshift({ date: state.date, text: "Owner: fined for an indirect gambling interest", good: false });
    sellHolding(state, "business", w.holdings.business * 0.05);
    addStory(state, {
      outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [state.userTeam],
      headline: `League fines ${TEAM_BY_ID[state.userTeam].name} owner over a betting stake`,
      body: `${state.ownerName} was fined and ordered to sell an indirect stake in a sports-betting operator, the league said. Owners may not hold gambling interests.`,
    });
    log("The league fined the club $5M and ordered you to sell.");
    return null;
  }
  // Supplier or media deals: money to the owner's company, a related-party review, and the risk of a league inquiry.
  const reviewed = choice === 1;
  if (reviewed) post(state, "professional", -400_000, "Independent fairness review of a related-party deal");
  const earn = Math.round(amount * (reviewed ? 0.15 : 0.25));
  o.liquid += earn;
  const inv = investors(state);
  inv.reviews.unshift({ date: state.date, what: `${m.title}: ${money(amount)} a year`, amount, outcome: reviewed ? "Approved after an independent fairness review" : "Approved without a review" });
  for (const x of inv.partners) x.mood = Math.max(0, x.mood - (reviewed ? 2 : 8));
  const r = rand(state, `conflict-probe-${m.id}`);
  if (!reviewed && r() < 0.3) {
    post(state, "fines", -1 * M, "League fine: undisclosed related-party deal");
    w.profile = Math.max(0, w.profile - 6);
    log(`Approved without a review; the league fined the club $1M. Your company earned ${money(earn)}.`);
  } else {
    log(`Approved${reviewed ? " after a fairness review" : ""}. Your company earned ${money(earn)}.`);
  }
  return null;
}

// ---- Month by month ----

function monthly(state: GameState): void {
  const w = wealth(state);
  const o = owner(state);
  syncHoldings(state);
  const now = state.economy?.now;
  const r = rand(state, `wealth-${state.date.slice(0, 7)}`);
  const growth = now ? now.growth : 2;
  const recession = !!now?.recession;
  const rate = marketRate(state);
  const calm = w.familyOffice ? 0.85 : 1;
  const extra = w.familyOffice ? 0.004 / 12 : 0;
  // Returns this month, by kind.
  const stocks = 0.07 / 12 + (growth - 2) * 0.002 + (recession ? -0.015 : 0) + gaussian(r) * 0.04 * calm;
  const bonds = rate / 12 + gaussian(r) * 0.004;
  const re = now ? now.realEstate : 1;
  const realEstate = 0.045 / 12 + (w.lastRealEstate ? re / w.lastRealEstate - 1 : 0) + gaussian(r) * 0.008 * calm;
  w.lastRealEstate = re;
  const business = 0.08 / 12 + (growth - 2) * 0.003 + (recession ? -0.02 : 0) + gaussian(r) * 0.03 * calm;
  const ret: Record<Holding, number> = { stocks, bonds, realEstate, business };
  for (const k of HOLDING_KEYS) w.holdings[k] = Math.max(0, w.holdings[k] * (1 + ret[k] + extra));
  if (w.familyOffice) {
    const fee = Math.round(o.outside * 0.0075 / 12);
    o.liquid -= fee;
  }
  w.index *= 1 + stocks;
  setOutside(state);
  // The trust and the foundation are invested too, conservatively.
  w.trust = Math.round(w.trust * (1 + 0.6 * stocks + 0.4 * bonds));
  w.foundation.endowment = Math.round(w.foundation.endowment * (1 + 0.6 * stocks + 0.4 * bonds));
  // Cash earns a little; personal debt costs the market rate plus two points.
  o.liquid += Math.round(o.liquid * Math.max(0, rate - 0.01) / 12);
  const interest = Math.round(o.personalDebt * (rate + 0.02) / 12);
  o.liquid -= interest;
  if (o.liquid < 0) {
    o.personalDebt += -o.liquid;
    o.liquid = 0;
  }
  // A margin call: debt past 60% of what it's secured by sells stocks.
  const secured = w.holdings.stocks + w.holdings.bonds + 0.5 * w.holdings.realEstate;
  if (o.personalDebt > 0.6 * secured && w.holdings.stocks > 0) {
    const sell = Math.min(w.holdings.stocks, o.personalDebt - 0.45 * secured);
    w.holdings.stocks -= sell;
    o.personalDebt = Math.max(0, o.personalDebt - sell * 0.99);
    setOutside(state);
    note(state, `Margin call: lenders sold ${money(sell)} of your stocks to cut your debt.`);
    send(state, "business", "Your private banker", "Margin call", `Stocks fell far enough that your lenders sold ${money(sell)} of them to bring your borrowing back in line. You now owe ${money(o.personalDebt)}.`);
  }
  // What the owner's money in the club would be worth in stocks: new money in grows it, money out shrinks it.
  const proceeds = state.investors?.proceeds ?? 0;
  w.alt = w.alt * (1 + stocks) + (o.putIn - w.seen.putIn) - (o.takenOut - w.seen.takenOut) - (proceeds - w.seen.proceeds);
  w.seen = { putIn: o.putIn, takenOut: o.takenOut, proceeds };
  // The public's sense of the owner: winning, giving, scandals and how public they are.
  const st = state.standing;
  const scandals = st ? st.incidents.filter((i) => !i.good && i.date >= addDays(state.date, -180) && i.text.startsWith("Owner")).length : 0;
  const last = o.legacy[o.legacy.length - 1];
  const winning = last ? (last.scores.titles - 50) * 0.2 : 0;
  const giving = Math.min(15, w.foundation.granted / (20 * M) * 5);
  const target = 50 + giving - scandals * 8 + { private: -5, engaged: 0, spotlight: 8 }[w.visibility] + winning;
  w.profile = Math.max(0, Math.min(100, w.profile + (target - w.profile) * 0.1));
  // A public owner helps with sponsors and draws the press's attention; a private one the reverse. Engaged is neutral.
  if (w.visibility !== "engaged" && state.culture) {
    const c = culture(state);
    const d = w.visibility === "spotlight" ? 0.3 : -0.2;
    c.rel.sponsors = Math.max(0, Math.min(100, c.rel.sponsors + d));
    c.rel.sources = Math.max(0, Math.min(100, c.rel.sources - d));
  }
  const nw = netWorth(state);
  w.history.push({ month: state.date.slice(0, 7), worth: Math.round(nw.total), team: Math.round(nw.team) });
  w.history.splice(0, Math.max(0, w.history.length - 180));
}

function yearly(state: GameState): void {
  const w = wealth(state);
  // The foundation pays out its required 5% in grants.
  const grants = Math.round(w.foundation.endowment * PAYOUT);
  if (grants > 0) {
    w.foundation.endowment -= grants;
    w.foundation.granted += grants;
    note(state, `Your foundation granted ${money(grants)} to ${FOCUS[w.foundation.focus].toLowerCase()}.`);
    // Giving in the club's own city wins goodwill there too.
    if (w.foundation.focus === "city" && state.culture) culture(state).rel.community = Math.min(100, culture(state).rel.community + Math.min(4, grants / (10 * M)));
  }
}

export function wealthDaily(state: GameState): void {
  if (!state.owner) return;
  const w = wealth(state);
  for (const p of w.pending.filter((x) => x.date <= state.date)) {
    owner(state).liquid += p.proceeds;
    note(state, `The sale of ${money(p.amount)} of ${HOLDINGS[p.kind].label.toLowerCase()} closed for ${money(p.proceeds)}.`);
  }
  w.pending = w.pending.filter((x) => x.date > state.date);
  if (state.date.slice(8, 10) === "01") monthly(state);
  if (state.date.slice(5) === "12-31") yearly(state);
  // About once a year, an owner with businesses runs into a conflict with the club.
  if (state.date.slice(8, 10) === "10" && w.holdings.business > 50 * M && !openMemos(state).some((m) => m.payload?.wealth)) {
    if (rand(state, `conflict-roll-${state.date}`)() < 0.08) conflictMemo(state);
  }
}

/** A short line for the Today page and tests: where the owner's money stands. */
export function wealthSummary(state: GameState): string {
  const nw = netWorth(state);
  return `Worth about ${billions(nw.total)}; ${Math.round(nw.concentration * 100)}% of it in the ${TEAM_BY_ID[state.userTeam].name}${ownerShare(state) < 1 ? ` (your ${Math.round(ownerShare(state) * 100)}%)` : ""}.`;
}

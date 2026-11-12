// Long-term ownership: the owner ages, steps back, plans the estate and picks
// a successor from heirs the owner knows only through what people say about
// them. Families and partners can fight over it. When the owner dies, sells
// the club or hands it on, the player chooses how to go on: as the
// successor, as a buyer of another club, or by ending with a legacy review.
//
// Heirs, trustees and buyers are made up. Mortality follows a plain
// Gompertz curve, roughly an American adult's; estate tax is 40% above an
// exemption of $15M (2026), indexed to prices.

import { cause } from "./causes";
import { atomic } from "./archive";
import { billions, business, cashBalance, post, valuation } from "./business";
import { addDays, daysBetween } from "./dates";
import { debt, totalDebt } from "./debt";
import { addMemo, AREA_KEYS, setMode } from "./delegation";
import { cpiFor } from "./economy";
import { facilities, stadiumCondition, complexCondition } from "./facilities";
import { franchise, sold } from "./franchisemarket";
import { money, news, send } from "./inbox";
import { buyOut, investors, ownerShare, pctText } from "./investors";
import { leagueYear } from "./contracts";
import { TEAM_BY_ID } from "./league";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { equityAtPurchase, owner, ownerEquity, scoreWord } from "./ownership";
import { owners } from "./owners";
import { rngFor } from "./rng";
import { history } from "./seasons";
import { payFromWealth, tenure } from "./takeover";
import type { GameState, Heir, LegacyReview, Memo, OwnerSale, SuccessionState } from "./types";
import { syncHoldings, wealth } from "./wealth";

const M = 1_000_000;
const ESTATE_RATE = 0.4;
const EXEMPTION_2026 = 15 * M;
const GAINS_TAX = 0.238;

function rand(state: GameState, key: string): () => number {
  return rngFor(state.seed, key + "|" + [...key].reverse().join(""));
}
const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));

// Made-up first names for heirs, chosen so none reads as a real owner's family.
const FIRST = ["Avery", "Jordan", "Morgan", "Casey", "Riley", "Quinn", "Reese", "Rowan", "Parker", "Hayden", "Emerson", "Sawyer", "Logan", "Blair", "Drew", "Elliot"];
const TRUSTEES = ["Northgate Trust Company", "a longtime family lawyer", "the family office's chief", "Calder Fiduciary"];

function surname(state: GameState): string {
  const parts = state.ownerName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function makeHeir(state: GameState, key: string, relation: Heir["relation"], age: number): Heir {
  const r = rand(state, `heir-${key}`);
  const first = FIRST[Math.floor(r() * FIRST.length)];
  return {
    id: key, name: `${first} ${surname(state)}`.trim(), relation, age,
    interest: r(), acumen: 0.2 + r() * 0.7, football: r(), temper: r(), role: false, grudge: 0,
  };
}

function family(state: GameState, ownerAge: number, gen: number): Heir[] {
  const r = rand(state, `family-${gen}-${state.date}`);
  const n = 2 + Math.floor(r() * 3);
  const out: Heir[] = [];
  for (let i = 0; i < n; i++) {
    const age = Math.max(1, Math.round(ownerAge - 26 - i * 3 - r() * 4));
    const h = makeHeir(state, `h${gen}-${i}`, i === n - 1 && r() < 0.3 && ownerAge > 50 ? "niece or nephew" : "child", age);
    if (out.some((x) => x.name === h.name)) h.name = `${FIRST[(FIRST.indexOf(h.name.split(" ")[0]) + 5) % FIRST.length]} ${surname(state)}`.trim();
    out.push(h);
  }
  return out;
}

export function succession(state: GameState): SuccessionState {
  if (state.succession) return state.succession;
  const r = rand(state, "owner-age");
  const age = 55 + Math.floor(r() * 16);
  const s: SuccessionState = {
    born: leagueYear(state.date) - age, health: 75 + Math.floor(r() * 20), involvement: "full", heirs: [], cohesion: 60, insurance: 0, generation: 1, history: [],
  };
  state.succession = s;
  s.heirs = family(state, age, 1);
  return s;
}

export function ownerAge(state: GameState): number {
  return Number(state.date.slice(0, 4)) - succession(state).born;
}

export function healthWord(h: number): string {
  return h >= 80 ? "Good" : h >= 60 ? "Fair; the doctors want more rest" : h >= 40 ? "Declining" : "Poor";
}

// ---- Heirs, through what people say ----

/**
 * What the family office, the GM and the club president say about an heir.
 * Reads are noisy; giving an heir a role in the club sharpens them.
 */
export function heirReport(state: GameState, h: Heir): { interest: string; business: string; football: string; temper: string; ready: string } {
  const r = rand(state, `read-${h.id}-${state.date.slice(0, 4)}`);
  const noise = h.role ? 0.08 : 0.2;
  const read = (x: number) => clamp(x + (r() - 0.5) * 2 * noise, 0, 1);
  const i = read(h.interest), a = read(h.acumen), f = read(h.football), t = read(h.temper);
  return {
    interest: i > 0.66 ? "Wants to run the club day to day" : i > 0.33 ? "Would sit on the board but not run it" : "Would rather have the money",
    business: a > 0.7 ? "Sharp with numbers; the CFO is impressed" : a > 0.45 ? "Learning the business; asks good questions" : "Out of depth in budget meetings",
    football: f > 0.66 ? "Knows the game; the GM takes their calls" : f > 0.33 ? "A fan more than an evaluator" : "Little feel for the football side",
    temper: t > 0.66 ? "Steady; keeps the family together" : t > 0.33 ? "Can be stubborn" : "Quick to fight with siblings",
    ready: h.age < 25 ? "Too young for the league to approve" : a > 0.6 && i > 0.5 ? "Could take over now" : a > 0.45 ? "Ready in a few years" : "Not ready",
  };
}

/** Give an heir a job at the club: they learn, and the owner sees them more clearly. */
export function giveRole(state: GameState, id: string, on: boolean): string | null {
  const h = succession(state).heirs.find((x) => x.id === id);
  if (!h) return "No such heir.";
  if (on && h.age < 18) return `${h.name} is too young for a job at the club.`;
  h.role = on;
  note(state, on ? `Gave ${h.name} a role at the club.` : `${h.name} stepped away from the club.`);
  return null;
}

// ---- The plan ----

export const INVOLVEMENT: Record<SuccessionState["involvement"], string> = {
  full: "Running the club yourself",
  chair: "Chair: the executives run the club day to day, and you keep control and the big decisions",
  retired: "Retired from daily duties: your successor runs the club, and you keep control",
};

export function setInvolvement(state: GameState, v: SuccessionState["involvement"]): string | null {
  const s = succession(state);
  if (v === "retired" && (!s.successor || !s.approved)) return "Name a successor and get the league's approval first.";
  s.involvement = v;
  if (v !== "full") for (const a of AREA_KEYS) setMode(state, a, "delegate", true);
  note(state, `Changed your role: ${INVOLVEMENT[v].toLowerCase()}.`);
  return null;
}

/** Name the heir who takes control, and a trustee to hold it until they're ready. */
export function nameSuccessor(state: GameState, id: string | undefined, trustee?: string): string | null {
  const s = succession(state);
  const h = id ? s.heirs.find((x) => x.id === id) : undefined;
  if (id && !h) return "No such heir.";
  if (s.successor !== id) s.approved = false;
  s.successor = id;
  if (trustee) s.trustee = trustee;
  // Passing over an heir who wanted it starts a grudge.
  for (const x of s.heirs) if (h && x !== h && x.interest > 0.6) { x.grudge = clamp(x.grudge + 25); s.cohesion = clamp(s.cohesion - 8); }
  if (h) note(state, `Named ${h.name} as your successor${s.trustee ? `, with ${s.trustee} as trustee until they're ready` : ""}.`);
  return null;
}

export { TRUSTEES };

/** Ask the league's finance committee to pre-approve the successor. */
export function seekApproval(state: GameState): string | null {
  const s = succession(state);
  const h = s.heirs.find((x) => x.id === s.successor);
  if (!h) return "Name a successor first.";
  if (s.review) return "The committee is already looking at it.";
  s.review = addDays(state.date, 60);
  post(state, "legal", -1 * M, "League succession filing");
  note(state, `Asked the league to pre-approve ${h.name} as successor.`);
  return null;
}

function committeeDecides(state: GameState): void {
  const s = succession(state);
  s.review = undefined;
  const h = s.heirs.find((x) => x.id === s.successor);
  if (!h) return;
  const liq = liquidity(state);
  const ok = (h.age >= 25 || !!s.trustee) && (h.acumen > 0.4 || !!s.trustee) && liq.short < ownerEquity(state) * 0.3;
  s.approved = ok;
  send(state, "league", "NFL finance committee", ok ? "Successor approved" : "Successor not approved",
    ok ? `The committee pre-approved ${h.name} as the club's next controlling owner${s.trustee ? `, with ${s.trustee} as trustee` : ""}.`
      : `The committee won't pre-approve ${h.name} yet: ${h.age < 25 && !s.trustee ? "too young without a trustee" : liq.short > 0 ? "the estate couldn't cover its taxes without a forced sale" : "they want to see more experience or a trustee"}.`);
}

// ---- Liquidity ----

export function exemption(state: GameState): number {
  const year = leagueYear(state.date);
  return EXEMPTION_2026 * cpiFor(state, year) / cpiFor(state, 2026);
}

/** What the estate would owe if the owner died today, and the cash it could find. */
export function liquidity(state: GameState): { stake: number; outside: number; taxable: number; tax: number; buyouts: number; cash: number; insurance: number; short: number } {
  const o = owner(state);
  const w = wealth(state);
  syncHoldings(state);
  // A controlling stake in a private club is valued at a discount for being hard to sell.
  const stake = ownerEquity(state) * 0.85;
  const outside = o.liquid + o.outside - o.personalDebt;
  const taxable = Math.max(0, stake + outside - exemption(state));
  const tax = Math.round(taxable * ESTATE_RATE);
  // Partners whose terms let them leave when control changes hands.
  const buyouts = investors(state).partners.filter((p) => p.terms === "investor").reduce((t, p) => t + valuation(state, state.userTeam) * p.pct, 0);
  const cash = o.liquid + 0.99 * (w.holdings.stocks + w.holdings.bonds);
  const insurance = succession(state).insurance;
  return { stake, outside, taxable, tax, buyouts, cash, insurance, short: Math.max(0, tax + buyouts - cash - insurance) };
}

/** Yearly premium for life insurance held in a trust to pay estate taxes. */
export function premium(state: GameState, face: number): number {
  const age = ownerAge(state);
  return Math.round(face * Math.min(0.12, 0.004 * Math.exp((age - 50) * 0.07)));
}

export function setInsurance(state: GameState, face: number): string | null {
  const s = succession(state);
  if (ownerAge(state) > 85 && face > s.insurance) return "No insurer will write a new policy at your age.";
  s.insurance = Math.max(0, Math.round(face));
  note(state, face ? `Life insurance for the estate set at ${money(face)} (about ${money(premium(state, face))} a year).` : "Dropped the estate's life insurance.");
  return null;
}

// ---- Buying out partners ----

/** Offer to buy a partner out at a premium (or discount) to the club's value. They may say no. */
export function offerBuyout(state: GameState, partnerId: string, premiumPct: number): string | null {
  const p = investors(state).partners.find((x) => x.id === partnerId);
  if (!p) return "No such partner.";
  const r = rand(state, `buyout-${partnerId}-${state.date}`);
  // Happy partners want a premium to sell; unhappy ones take less.
  const want = (p.mood - 50) / 250 + (r() - 0.5) * 0.06;
  if (premiumPct < want) { p.mood = clamp(p.mood - 2); return `${p.name} wants more than that to sell.`; }
  return buyOut(state, p, -premiumPct);
}

// ---- Selling the club ----

const BUYERS = ["the Kestrel Bay group", "a group led by a private-equity founder", "the Marlow family", "a group led by a media executive", "the Ostrander partnership", "a group led by a former quarterback"];

/** Hire bankers and put the whole club up for sale. */
export function sellClub(state: GameState): string | null {
  const s = succession(state);
  if (tenure(state).role !== "control") return "Only the controlling owner can sell the club.";
  if (s.sale && !["closed", "failed"].includes(s.sale.stage)) return "The club is already for sale.";
  s.sale = { stage: "marketing", opened: state.date, due: addDays(state.date, 75), bids: [] };
  post(state, "legal", -3 * M, "Bankers' and lawyers' retainer for the sale");
  news(state, `The ${TEAM_BY_ID[state.userTeam].name} hire bankers to explore a sale`);
  note(state, "Put the club up for sale.");
  return null;
}

function takeBids(state: GameState): void {
  const s = succession(state);
  const sale = s.sale!;
  const r = rand(state, `sale-${sale.opened}`);
  const value = valuation(state, state.userTeam);
  const n = 2 + Math.floor(r() * 3);
  sale.bids = [];
  for (let i = 0; i < n; i++) {
    const name = BUYERS[Math.floor(r() * BUYERS.length)];
    if (sale.bids.some((b) => b.name === name)) continue;
    sale.bids.push({ name, price: Math.round(value * (0.93 + r() * 0.17) / (25 * M)) * 25 * M, cash: r() < 0.5 });
  }
  sale.bids.sort((a, b) => b.price - a.price);
  sale.stage = "bids";
  sale.due = addDays(state.date, 21);
  const best = sale.bids[0];
  addMemo(state, {
    kind: "general", from: "Your bankers", title: `Bids for the ${TEAM_BY_ID[state.userTeam].name}`,
    problem: `${sale.bids.length} groups bid. The best is ${best.name} at ${billions(best.price)}${best.cash ? ", all cash" : ", subject to financing"}.`,
    proposal: `Accept ${best.name}'s bid; you'd net about ${billions(saleNet(state, best.price).net)} after debt, fees, partners and tax.`, amount: best.price,
    options: [
      { label: `Accept ${billions(best.price)}`, effect: "The league's finance committee vets the buyer, then the owners vote." },
      { label: "Take the club off the market", effect: "The bankers' fees are spent." },
    ],
    risks: ["A buyer can fail the league's review or lose its lenders."], budget: "None.", recommend: 0,
    deadline: sale.due, ifLate: "The club comes off the market.", payload: { succession: "bids" },
  });
}

/** Where the money from a sale goes: debt, fees, partners and tax, and what's left for the owner. */
export function saleNet(state: GameState, price: number): NonNullable<OwnerSale["net"]> {
  const o = owner(state);
  const debtOwed = totalDebt(state);
  const cash = Math.max(0, cashBalance(state));
  const fees = Math.round(price * 0.01 + 4 * M);
  const equity = Math.max(0, price - debtOwed + cash - fees);
  const share = ownerShare(state);
  const partners = Math.round(equity * (1 - share));
  const gross = equity - partners;
  const basis = equityAtPurchase(state) + o.putIn;
  const tax = Math.round(Math.max(0, gross - basis) * GAINS_TAX);
  const net = gross - tax;
  // Total return: money in (equity at purchase and capital put in) against money out (distributions, stake sales and this).
  const paidIn = basis;
  const out = o.takenOut + investors(state).proceeds + net;
  const years = Math.max(0.25, daysBetween(o.since, state.date) / 365);
  const multiple = out / Math.max(1, paidIn);
  return { price, debt: debtOwed, cash, fees, partners, tax, net, paidIn, out, multiple, annual: Math.pow(Math.max(0.01, multiple), 1 / years) - 1, years };
}

function leagueVote(state: GameState): void {
  const s = succession(state);
  const sale = s.sale!;
  const r = rand(state, `salevote-${sale.opened}`);
  const bid = sale.bids.find((b) => b.name === sale.chosen)!;
  if (!bid.cash && r() < 0.06) { failSale(state, `${bid.name}'s lenders pulled out.`); return; }
  let yes = 0;
  for (let i = Object.keys(owners(state).relations).length; i > 0; i--) if (r() < 0.95) yes++;
  if (yes < 24) { failSale(state, `The owners voted it down, ${yes} to ${31 - yes}.`); return; }
  atomic(state, () => closeSale(state, bid.name, bid.price));
}

function failSale(state: GameState, why: string): void {
  const sale = succession(state).sale!;
  sale.stage = "failed";
  sale.failed = why;
  send(state, "business", "Your bankers", "The sale fell through", `${why} The club stays yours; the bankers can try again.`);
  note(state, `The sale of the club fell through: ${why}`);
}

/** The sale closes: the owner is paid and leaves the club, and chooses what comes next. */
function closeSale(state: GameState, buyer: string, price: number): void {
  const s = succession(state);
  const sale = s.sale!;
  const n = saleNet(state, price);
  const o = owner(state);
  sale.stage = "closed";
  sale.chosen = buyer;
  sale.net = n;
  if (state.settings.finances !== "relaxed") o.liquid += n.net;
  o.log.unshift({ date: state.date, text: `Sold the ${TEAM_BY_ID[state.userTeam].name} to ${buyer} for ${billions(price)}; netted ${billions(n.net)} after debt, fees, partners and tax.` });
  sold(state, state.userTeam, price, buyer);
  const t = tenure(state);
  const rec = t.clubs.find((c) => c.team === state.userTeam && !c.to);
  if (rec) { rec.to = state.date; rec.proceeds = n.net; }
  // The club returns to its new owner; the player watches until they choose.
  t.role = "buyer";
  t.stake = 0;
  t.controller = buyer;
  for (const a of AREA_KEYS) setMode(state, a, "delegate", true);
  cause(state, "ownership", `Sold the ${TEAM_BY_ID[state.userTeam].name} to ${buyer} for ${billions(price)}.`, [`Netted ${billions(n.net)}: ${n.multiple.toFixed(1)} times the money put in.`], { kind: "club", id: state.userTeam });
  endTenure(state, "sale", `You sold the club to ${buyer}.`);
}

// ---- Death, the estate and what comes next ----

/** The yearly chance an owner of this age and health dies. */
export function mortality(age: number, health: number): number {
  return Math.min(0.5, 0.00005 * Math.exp(0.093 * age) * (health < 40 ? 2.5 : health < 60 ? 1.6 : 1));
}

function death(state: GameState): void {
  const s = succession(state);
  const name = state.ownerName;
  const liq = liquidity(state);
  s.estate = { date: state.date, tax: liq.tax, paid: 0, short: liq.short, owner: name };
  news(state, `${name}, owner of the ${TEAM_BY_ID[state.userTeam].name}, has died at ${ownerAge(state)}`);
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [state.userTeam],
    headline: `What comes next for the ${TEAM_BY_ID[state.userTeam].name}`,
    body: `${name}'s estate plan now matters: ${s.successor ? `${s.heirs.find((h) => h.id === s.successor)?.name} was named successor${s.approved ? " and pre-approved by the league" : ", but the league never signed off"}` : "no successor was named"}. Estate taxes could run to ${billions(liq.tax)}.`,
  });
  endTenure(state, "death", `${name} died.`);
}

/** Step down now and hand control to the successor while alive (gift tax instead of estate tax). */
export function stepDown(state: GameState): string | null {
  const s = succession(state);
  if (tenure(state).role !== "control") return "Only the controlling owner can hand on the club.";
  if (!s.successor || !s.approved) return "Name a successor and get the league's approval first.";
  const liq = liquidity(state);
  s.estate = { date: state.date, tax: liq.tax, paid: 0, short: liq.short, owner: state.ownerName };
  endTenure(state, "stepdown", `${state.ownerName} handed control to the next generation.`);
  return null;
}

function endTenure(state: GameState, why: "death" | "sale" | "stepdown", text: string): void {
  const s = succession(state);
  s.pending = { date: state.date, why };
  s.history.unshift({ date: state.date, text });
  const heir = s.heirs.find((h) => h.id === s.successor) ?? [...s.heirs].sort((a, b) => b.age - a.age)[0];
  const options = why === "sale"
    ? [
        { label: "Buy another club", effect: "Keep your money and look for a club on Ownership > Deals." },
        { label: "End with a legacy review", effect: "The game ends with a review of your years in charge." },
      ]
    : [
        { label: `Go on as ${heir?.name ?? "the heir"}`, effect: "Play on as the next controlling owner, with the estate's taxes to settle." },
        { label: "Have the estate sell; buy another club", effect: "The estate sells the club; you go on as a buyer with the proceeds." },
        { label: "End with a legacy review", effect: "The game ends with a review of the years in charge." },
      ];
  addMemo(state, {
    kind: "general", from: "Your family office", title: why === "sale" ? "After the sale" : "The club passes on",
    problem: text, proposal: options[0].label, options, risks: [], budget: "None.", recommend: 0,
    deadline: addDays(state.date, 30), ifLate: "We take the first option.", payload: { succession: "tenure", why },
  });
}

/** The heir takes control: same club, same contracts and history, new owner. */
function continueAsHeir(state: GameState): void {
  const s = succession(state);
  const heir = s.heirs.find((h) => h.id === s.successor) ?? [...s.heirs].sort((a, b) => b.age - a.age)[0];
  if (!heir) return;
  const o = owner(state);
  const t = tenure(state);
  const prev = state.ownerName;
  const est = s.estate;
  // Disputes: an unapproved or contested succession can force a sale of part of the club.
  const contested = s.heirs.some((h) => h !== heir && h.grudge > 50 && h.temper < 0.4) || (!s.approved && s.cohesion < 40);
  const tax = est?.tax ?? 0;
  // Pay the estate tax from cash, insurance and liquid holdings; the rest over ten years.
  const insurance = s.insurance;
  let due = Math.max(0, tax - insurance);
  if (state.settings.finances !== "relaxed" && due > 0) {
    const w = wealth(state);
    const quick = o.liquid + 0.99 * (w.holdings.stocks + w.holdings.bonds);
    const now = Math.min(due, quick);
    payFromWealth(state, now);
    due -= now;
    if (due > 0) o.personalDebt += due; // Installments under the closely held business rules.
  }
  const rec = t.clubs.find((c) => c.team === state.userTeam && !c.to);
  if (rec) rec.to = state.date;
  state.ownerName = heir.name;
  // The heir's cost basis steps up to today's value.
  const value = valuation(state, state.userTeam);
  o.purchase = value;
  o.since = state.date;
  o.equityIn = ownerEquity(state);
  o.clubEquityIn = value - totalDebt(state) + Math.max(0, cashBalance(state));
  o.putIn = 0;
  o.takenOut = 0;
  o.log.unshift({ date: state.date, text: `${heir.name} took control of the ${TEAM_BY_ID[state.userTeam].name} from ${prev}${tax ? `; estate taxes of ${billions(tax)}${due > 0 ? `, ${money(due)} of it paid over ten years` : ""}` : ""}.` });
  t.role = "control";
  t.clubs.push({ team: state.userTeam, from: state.date, how: s.pending?.why === "stepdown" ? "Handed on" : "Inherited" });
  s.generation += 1;
  s.born = leagueYear(state.date) - heir.age;
  s.health = 85;
  s.involvement = "full";
  s.successor = undefined;
  s.approved = false;
  s.trustee = undefined;
  s.insurance = 0;
  // The rest of the family keeps a share through the trust, as partners.
  const others = s.heirs.filter((h) => h !== heir && h.age >= 18);
  const inv = investors(state);
  if (others.length) {
    const room = Math.max(0, ownerShare(state) - 0.5);
    const each = Math.min(0.08, room / others.length);
    if (each > 0.01) for (const h of others) {
      inv.partners.push({
        id: `fam-${h.id}`, name: h.name, kind: "family", pct: each, since: state.date, paid: 0, calls: 0, distributions: 0,
        mood: clamp(55 - h.grudge / 2), board: true, terms: "standard", complaints: 0, background: `${prev}'s ${h.relation}, holding through the family trust`, entryValue: value,
      });
    }
  }
  s.heirs = family(state, heir.age, s.generation);
  s.cohesion = contested ? 30 : 60;
  if (contested) {
    addMemo(state, {
      kind: "general", from: "Your family office", title: "The family is split over control",
      problem: "Relatives who wanted the club say the transfer was unfair and threaten to sue.",
      proposal: "Buy out their interest at the club's value.", amount: 0,
      options: [
        { label: "Buy them out", effect: "Costly, but it ends the fight." },
        { label: "Mediate", effect: "About $5M in fees; the family calms down, mostly." },
        { label: "Fight it", effect: "Lawyers, headlines, and a chance a court forces a partial sale." },
      ],
      risks: ["A public family fight hurts the club with sponsors and the league."], budget: "Your own money.", recommend: 1,
      deadline: addDays(state.date, 30), ifLate: "We fight it.", payload: { succession: "dispute" },
    });
  }
  s.history.unshift({ date: state.date, text: `${heir.name} became controlling owner (generation ${s.generation}).` });
  news(state, `${heir.name} takes control of the ${TEAM_BY_ID[state.userTeam].name}`);
  s.pending = undefined;
  s.estate = undefined;
}

/** The estate sells the club; the player goes on as a buyer with the heir's share of the proceeds. */
function estateSells(state: GameState): void {
  const s = succession(state);
  const value = valuation(state, state.userTeam);
  const r = rand(state, `estate-sale-${state.date}`);
  const price = Math.round(value * (0.95 + r() * 0.08) / (25 * M)) * 25 * M;
  const n = saleNet(state, price);
  const o = owner(state);
  const tax = Math.max(0, (s.estate?.tax ?? 0) - s.insurance);
  if (state.settings.finances !== "relaxed") o.liquid += Math.max(0, n.net - tax);
  const buyer = BUYERS[Math.floor(r() * BUYERS.length)];
  sold(state, state.userTeam, price, buyer);
  const t = tenure(state);
  const rec = t.clubs.find((c) => c.team === state.userTeam && !c.to);
  if (rec) { rec.to = state.date; rec.proceeds = n.net; }
  t.role = "buyer";
  t.stake = 0;
  t.controller = buyer;
  for (const a of AREA_KEYS) setMode(state, a, "delegate", true);
  const heir = s.heirs.find((h) => h.id === s.successor) ?? [...s.heirs].sort((a, b) => b.age - a.age)[0];
  if (heir && s.pending?.why !== "sale") { state.ownerName = heir.name; s.born = leagueYear(state.date) - heir.age; s.generation += 1; s.heirs = family(state, heir.age, s.generation); }
  s.history.unshift({ date: state.date, text: `The estate sold the club to ${buyer} for ${billions(price)}.` });
  s.pending = undefined;
  s.estate = undefined;
}

// ---- The legacy review ----

/** A review of the years in charge: winning, money, buildings, culture and the community. */
export function legacyReview(state: GameState): LegacyReview {
  const o = owner(state);
  const t = tenure(state);
  const rows = o.legacy;
  const avg = (k: keyof (typeof rows)[number]["scores"]) => rows.length ? rows.reduce((x, r) => x + r.scores[k], 0) / rows.length : 50;
  const seasons = history(state).seasons.filter((h) => rows.some((r) => r.season === h.season));
  let w = 0, l = 0, playoffs = 0, titles = 0;
  for (const h of seasons) {
    const team = rows.find((r) => r.season === h.season)?.team ?? state.userTeam;
    const rec = h.records[team];
    if (rec) { w += rec[0]; l += rec[1]; }
    if (h.playoffs[team]) playoffs++;
    if (h.champion === team) titles++;
  }
  const value = valuation(state, state.userTeam);
  const growth = o.purchase ? Math.pow(value / o.purchase, 1 / Math.max(1, daysBetween(o.since, state.date) / 365)) - 1 : 0;
  const fac = state.facilities ? (stadiumCondition(state) + complexCondition(state)) / 2 : 70;
  const cult = state.culture?.history.at(-1);
  const cultScore = cult ? (cult.trust + cult.stability + cult.fairness + cult.accountability + cult.communication + cult.morale) / 6 : 60;
  const sale = succession(state).sale?.net;
  const parts = [
    { area: "Winning", score: Math.round((avg("titles") + Math.min(100, 50 + (w - l) * 2 + titles * 20)) / 2), text: `${w}-${l} over ${seasons.length} season${seasons.length === 1 ? "" : "s"}, ${playoffs} playoff trip${playoffs === 1 ? "" : "s"}, ${titles} title${titles === 1 ? "" : "s"}.` },
    { area: "Money", score: Math.round((avg("profit") + avg("value")) / 2), text: sale ? `Sold for ${billions(sale.price)}: ${sale.multiple.toFixed(1)} times the money in, ${(sale.annual * 100).toFixed(1)}% a year.` : `The club's value grew ${(growth * 100).toFixed(1)}% a year to ${billions(value)}.` },
    { area: "Buildings", score: Math.round(fac), text: `The stadium and training complex are in ${fac >= 75 ? "good" : fac >= 55 ? "fair" : "poor"} shape.` },
    { area: "Culture", score: Math.round(cultScore), text: `Staff readings average ${Math.round(cultScore)} of 100.` },
    { area: "Community", score: Math.round(avg("community")), text: `The city's view of the club: ${scoreWord(avg("community")).toLowerCase()}.` },
  ];
  const overall = Math.round(parts.reduce((x, p) => x + p.score, 0) / parts.length);
  return {
    date: state.date, owner: state.ownerName, clubs: t.clubs.map((c) => TEAM_BY_ID[c.team]?.name ?? c.team), overall, parts,
    verdict: overall >= 80 ? "One of the great ownerships" : overall >= 65 ? "A successful run" : overall >= 50 ? "A mixed record" : "Years the city would rather forget",
  };
}

/** End the game with a legacy review. */
export function endGame(state: GameState): void {
  const s = succession(state);
  s.ended = legacyReview(state);
  s.pending = undefined;
  s.history.unshift({ date: state.date, text: `The game ended: ${s.ended.verdict.toLowerCase()}.` });
}

export function isOver(state: GameState): boolean {
  return !!state.succession?.ended;
}

// ---- Memos ----

export function resolveSuccessionMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  const s = succession(state);
  if (p.succession === "bids") {
    const sale = s.sale;
    if (!sale || sale.stage !== "bids") return "That sale is over.";
    if (choice !== 0) { sale.stage = "failed"; sale.failed = "You took the club off the market."; return null; }
    sale.chosen = sale.bids[0].name;
    sale.stage = "league";
    sale.due = addDays(state.date, 45);
    return null;
  }
  if (p.succession === "tenure") {
    if (!s.pending) return null;
    if (p.why === "sale") { if (choice === 1) endGame(state); else s.pending = undefined; return null; }
    if (choice === 0) atomic(state, () => continueAsHeir(state));
    else if (choice === 1) estateSells(state);
    else { endGame(state); }
    return null;
  }
  if (p.succession === "dispute") {
    const o = owner(state);
    const fam = investors(state).partners.filter((x) => x.kind === "family" && x.mood < 50);
    if (choice === 0) {
      for (const x of fam) { const err = buyOut(state, x, 0); if (err) return err; }
      s.cohesion = clamp(s.cohesion + 30);
    } else if (choice === 1) {
      if (state.settings.finances !== "relaxed") o.liquid -= 5 * M;
      s.cohesion = clamp(s.cohesion + 15);
      for (const x of fam) x.mood = clamp(x.mood + 10);
    } else {
      post(state, "legal", -8 * M, "Family control litigation");
      s.cohesion = clamp(s.cohesion - 15);
      const r = rand(state, `dispute-${state.date}`);
      if (r() < 0.3 && fam.length) {
        // A court orders the challengers' shares bought at full value.
        for (const x of fam) buyOut(state, x, -0.05);
        note(state, "A court ordered the family's challengers bought out at a premium.");
      }
    }
    return null;
  }
  if (p.succession === "health" && choice === 0) setInvolvement(state, "chair");
  return null;
}

// ---- The heir start ----

/** Start as an heir: the parent just died, the family holds part of the club, and the estate tax is due. */
export function startAsHeir(state: GameState): void {
  const s = succession(state);
  const r = rand(state, "heir-start");
  const age = 34 + Math.floor(r() * 10);
  s.born = leagueYear(state.date) - age;
  s.generation = 2;
  s.health = 90;
  s.cohesion = 45;
  s.heirs = family(state, age, 2);
  const o = owner(state);
  const value = valuation(state, state.userTeam);
  const inv = investors(state);
  const parent = `The late ${surname(state) ? `${surname(state)} family patriarch` : "owner"}`;
  const sibs = 1 + Math.floor(r() * 3);
  for (let i = 0; i < sibs; i++) {
    const h = makeHeir(state, `sib-${i}`, "child", age + Math.round((r() - 0.5) * 10));
    inv.partners.push({
      id: `fam-sib-${i}`, name: h.name, kind: "family", pct: 0.08, since: state.date, paid: 0, calls: 0, distributions: 0,
      mood: 35 + Math.floor(r() * 30), board: true, terms: "standard", complaints: 0, background: "Your sibling, holding through the family trust", entryValue: value,
    });
  }
  const liq = liquidity(state);
  // The estate tax is the heir's to settle: half is due now, the rest over ten years.
  const tax = Math.round(liq.tax * 0.5);
  o.personalDebt += tax;
  o.equityIn = ownerEquity(state);
  tenure(state).clubs = [{ team: state.userTeam, from: state.date, how: "Inherited" }];
  s.history.unshift({ date: state.date, text: `${state.ownerName} inherited control from ${parent.toLowerCase()}.` });
  o.log.unshift({ date: state.date, text: `Inherited control of the ${TEAM_BY_ID[state.userTeam].name}. Your ${sibs === 1 ? "sibling holds" : `${sibs} siblings hold`} ${pctText(0.08 * sibs)} through the family trust, and ${money(tax)} of estate tax is owed in installments.` });
  send(state, "business", "Your family office", "The estate",
    `The estate owes about ${billions(liq.tax)} in tax. Half was paid from the estate's cash; the other ${money(tax)} is yours to pay over ten years, at the market rate. Your siblings each hold 8% of the club, and not all of them think you should be the one in charge.`);
}

// ---- Daily ----

function note(state: GameState, text: string): void {
  succession(state).history.unshift({ date: state.date, text });
  succession(state).history.splice(60);
}

export function successionDaily(state: GameState): void {
  if (state.succession?.ended) return;
  const s = succession(state);
  if (s.review && state.date >= s.review) committeeDecides(state);
  const sale = s.sale;
  if (sale && sale.stage === "marketing" && state.date >= sale.due) takeBids(state);
  if (sale && sale.stage === "league" && state.date >= sale.due) leagueVote(state);
  if (s.pending || tenure(state).role !== "control") return;
  const age = ownerAge(state);
  const r = rand(state, `life-${state.date}`);
  // A birthday each January: health slips with age, faster past seventy; heirs grow up.
  if (state.date.slice(5) === "01-15") {
    s.health = clamp(s.health - Math.max(0, (age - 55) / 6) * (0.5 + r()));
    for (const h of s.heirs) {
      h.age++;
      if (h.role) h.acumen = Math.min(0.95, h.acumen + 0.02);
      h.grudge = Math.max(0, h.grudge - 3);
    }
    if (s.insurance) {
      const cost = premium(state, s.insurance);
      const o = owner(state);
      if (state.settings.finances !== "relaxed") o.liquid -= cost;
    }
    if (s.health < 55 && s.involvement === "full") {
      addMemo(state, {
        kind: "general", from: "Your doctor", title: "Slowing down",
        problem: `At ${age}, your health is ${healthWord(s.health).toLowerCase()}.`, proposal: "Step back to chair and let the executives run the club day to day.",
        options: [{ label: "Step back to chair", effect: "You keep control and the big decisions." }, { label: "Keep going", effect: "Nothing changes." }],
        risks: [], budget: "None.", recommend: 0, deadline: addDays(state.date, 30), ifLate: "Nothing changes.", payload: { succession: "health" },
      });
    }
  }
  // Family friction: a split family raises a dispute now and then.
  if (state.date.endsWith("-01") && s.cohesion < 35 && r() < 0.15 && s.heirs.some((h) => h.age >= 21)) {
    s.cohesion = clamp(s.cohesion - 3);
    addStory(state, {
      outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [state.userTeam],
      headline: `A family split over the ${TEAM_BY_ID[state.userTeam].name}'s future`,
      body: `Members of ${state.ownerName}'s family disagree over who should run the club next, people close to them say.`,
    });
  }
  if (age >= 50 && r() < mortality(age, s.health) / 365) death(state);
}

/** The owner's slice for an old save: started today at an age drawn from the seed. */
export function ensureSuccession(state: GameState): void {
  succession(state);
}

void business; void debt; void facilities; void franchise;

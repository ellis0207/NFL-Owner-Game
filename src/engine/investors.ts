// The ownership group: who owns the club besides the owner, and what they're owed.
//
// Most NFL clubs have a controlling owner and a handful of limited partners.
// The league requires the controlling owner to hold at least 30% and to have
// the final say; since 2024 approved private-equity funds may buy small
// stakes too (together at most 10% of a club, held at least six years). A new
// game starts with the owner holding the whole club, as a buyer who paid in
// full; partners arrive only when the owner sells a stake. From then on:
//
//   - distributions go to every partner pro rata, so the owner's own pocket
//     gets only their share (the club's books don't change);
//   - capital calls go to every partner, and one who can't pay is diluted;
//   - the owner pays tax only on their share of the club's income;
//   - a board with partner seats votes on reserved matters (big borrowing,
//     new equity, relocation, a new stadium, bridge loans from the owner);
//   - partners read a quarterly report, and grow happy, restless or keen to
//     leave depending on results, distributions and how well they're told.
//
// The partners, funds and bidders are made up. The controlling owners listed
// for the other clubs are the real ones, approximately, as of 2026.
import { billions, business, cashBalance, pnl, post, valuation } from "./business";
import { leagueYear } from "./contracts";
import { addDays, daysBetween } from "./dates";
import { debt, drawn, marketRate, openLoans, totalDebt } from "./debt";
import { addMemo, openMemos } from "./delegation";
import { cpiFor, inRecession } from "./economy";
import { execRole } from "./executives";
import { money, news, send } from "./inbox";
import { TEAM_BY_ID } from "./league";
import { addStory, MEDIA_BY_ID } from "./outlets";
import { equityAtPurchase, fundCapitalCall, owner, ownerEquity, ownerMoney } from "./ownership";
import { rngFor } from "./rng";
import { standings } from "./standings";
import type { GameState, InvestorsState, Memo, Partner, StakeBid, StakeSale, StakeTerms } from "./types";

const M = 1_000_000;

/** The league's ownership rules, approximately as they stand after the 2024 changes. */
export const OWNERSHIP_RULES = {
  /** The controlling owner's smallest allowed stake. */
  controlMin: 0.3,
  /** Limited partners in one group, at most. */
  maxPartners: 24,
  /** The smallest stake a limited partner may hold. */
  minStake: 0.01,
  /** Approved private-equity funds together, at most, in one club. */
  fundCap: 0.1,
  /** Years a fund must hold its stake. */
  fundHold: 6,
};

export const RULE_LINES = [
  "The controlling owner must hold at least 30% of the club and have the final say on club decisions.",
  "No more than 24 limited partners, each holding at least 1%.",
  "Approved private-equity funds may own at most 10% of a club together, and must hold at least six years. Funds get no board vote on football matters.",
  "Sovereign wealth funds, publicly traded companies and anyone with gambling interests may not own a stake.",
  "Every new partner is vetted and approved by the league's finance committee; a change of control needs 24 owners' votes.",
  "Club debt stays within the league's limit, whoever owns the club.",
];

/** Terms packages in an investor agreement, and what they do to the price. */
export const TERMS: Record<StakeTerms, { label: string; what: string; discount: number }> = {
  owner: { label: "Owner-friendly", what: "No board seat, a right of first refusal for you, and a drag-along so you can sell the whole club. Buyers pay less.", discount: 0.06 },
  standard: { label: "Standard", what: "A board seat for stakes of 10% or more, tag-along rights if you sell control, and the usual information rights.", discount: 0 },
  investor: { label: "Investor-friendly", what: "A board seat, full information rights and a put after seven years that lets them make the group buy them out. Buyers pay more.", discount: -0.04 },
};

/** Who controls the other clubs (real, approximate, 2026). */
export const CONTROL: Record<string, string> = {
  BUF: "Terry and Kim Pegula", MIA: "Stephen Ross", NE: "the Kraft family", NYJ: "the Johnson family", BAL: "Steve Bisciotti", CIN: "the Brown family",
  CLE: "the Haslam family", PIT: "the Rooney family", HOU: "the McNair family", IND: "the Irsay family", JAX: "Shad Khan", TEN: "the Adams Strunk family",
  DEN: "the Walton-Penner group", KC: "the Hunt family", LV: "Mark Davis", LAC: "the Spanos family", DAL: "the Jones family", NYG: "the Mara and Tisch families",
  PHI: "Jeffrey Lurie", WAS: "the Harris group", CHI: "the McCaskey family", DET: "the Ford family", GB: "its shareholders (publicly owned)", MIN: "the Wilf family",
  ATL: "Arthur Blank", CAR: "David Tepper", NO: "Gayle Benson", TB: "the Glazer family", ARI: "the Bidwill family", LA: "Stan Kroenke", SF: "the York family",
  SEA: "the Paul Allen estate",
};

export function investors(state: GameState): InvestorsState {
  return (state.investors ??= {
    partners: [], former: [], sales: [], disclosure: "standard", reports: [], minutes: [], reviews: [], succession: "trust",
    proceeds: 0, gainsTax: 0, calls: [], bridges: [], log: [],
  });
}

/** The owner's share of the club: everything the partners don't hold. */
export function ownerShare(state: GameState): number {
  // A buyer still looking owns none of the club in view; a minority partner owns their stake.
  const t = state.tenure;
  if (t && t.role !== "control") return t.stake ?? 0;
  const ps = state.investors?.partners;
  if (!ps?.length) return 1;
  return Math.max(0, 1 - ps.reduce((t, p) => t + p.pct, 0));
}

/**
 * This module's random numbers. Keys here differ only in their last characters
 * (dates, counters), so the key is also hashed reversed, which spreads that
 * difference through the whole seed.
 */
function rand(state: GameState, key: string) {
  return rngFor(state.seed, `${key}|${[...key].reverse().join("")}`);
}

function note(state: GameState, text: string): void {
  const s = investors(state);
  s.log.unshift({ date: state.date, text });
  s.log.splice(60);
}

function clamp(x: number): number {
  return Math.max(0, Math.min(100, x));
}

export function moodWord(m: number): string {
  return m >= 75 ? "Very happy" : m >= 58 ? "Content" : m >= 42 ? "Restless" : m >= 25 ? "Unhappy" : "Wants out";
}

// ---- The board and reserved matters ----

export type Matter = "debt" | "equity" | "relocation" | "stadium" | "relatedParty";

export const MATTERS: Record<Matter, { label: string; lean: number }> = {
  debt: { label: "New borrowing over 5% of the club's value", lean: -4 },
  equity: { label: "Issuing new shares", lean: -6 },
  relocation: { label: "Moving the club", lean: -18 },
  stadium: { label: "Committing to a new stadium", lean: 2 },
  relatedParty: { label: "Deals between the club and the owner or the owner's businesses", lean: -3 },
};

/** Reserved matters pass with two-thirds of the shares. */
export const BOARD_MAJORITY = 2 / 3;

export interface Director { name: string; role: string }

/** Who sits on the board: you as chair, the club president, partners with seats, and an independent director once there are partners. */
export function board(state: GameState): Director[] {
  const s = investors(state);
  const out: Director[] = [{ name: state.ownerName, role: `Chair, controlling owner (${pctText(ownerShare(state))})` }];
  const pres = execRole(state, "PRES");
  if (pres) out.push({ name: pres.name, role: "Club president, your appointee" });
  for (const p of s.partners.filter((x) => x.board)) out.push({ name: p.name, role: `Partner director (${pctText(p.pct)})` });
  if (s.partners.length) out.push({ name: "Margaret Ellery", role: "Independent director (made up)" });
  return out;
}

export function pctText(x: number): string {
  return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;
}

/**
 * A reserved matter goes to the board. With no partners, or with the owner
 * holding two-thirds, it passes on the owner's vote alone. Otherwise each
 * partner votes their shares by how they feel and what's being asked.
 * Returns null when it passes, or why it failed.
 */
export function reserved(state: GameState, matter: Matter, amount = 0, what = MATTERS[matter].label): string | null {
  const s = state.investors;
  if (!s?.partners.length) return null;
  if (matter === "debt" && amount < 0.05 * valuation(state, state.userTeam)) return null;
  const own = ownerShare(state);
  const r = rand(state, `board-${state.date}-${matter}-${s.minutes.length}`);
  let yes = own;
  const against: Partner[] = [];
  for (const p of s.partners) {
    const lean = p.mood + MATTERS[matter].lean + (p.kind === "fund" && matter === "relocation" ? -10 : 0) + (r() - 0.5) * 20;
    if (lean >= 45) yes += p.pct;
    else against.push(p);
  }
  const passed = own >= BOARD_MAJORITY || yes >= BOARD_MAJORITY - 1e-9;
  for (const p of s.partners) p.mood = clamp(p.mood + (against.includes(p) ? (passed ? -3 : 0) : 1));
  const text = passed
    ? `${what}: approved with ${pctText(yes)} of the shares${against.length ? `; ${against.map((p) => p.name).join(", ")} voted against` : ""}.`
    : `${what}: turned down. Only ${pctText(yes)} of the shares voted for it; two-thirds are needed.`;
  s.minutes.unshift({ date: state.date, matter, yes, passed, text });
  s.minutes.splice(40);
  if (!passed) {
    note(state, text);
    return `The board turned it down: ${pctText(yes)} of the shares voted for it, and reserved matters need two-thirds.`;
  }
  return null;
}

// ---- Money to and from the partners ----

/**
 * The club pays a distribution: every partner gets their share, and the
 * owner's pocket gets what's left. Returns the owner's part.
 */
export function shareDistribution(state: GameState, total: number): number {
  const s = state.investors;
  if (!s?.partners.length) return total;
  for (const p of s.partners) {
    const part = Math.round(total * p.pct);
    p.distributions += part;
    // Partners like money back, more so when it's a meaningful yield on their stake.
    p.mood = clamp(p.mood + Math.min(8, 300 * part / Math.max(1, p.pct * valuation(state, state.userTeam))));
  }
  return Math.round(total * ownerShare(state));
}

/**
 * A capital call: every partner owes their share. A partner who can't or won't
 * pay is diluted, as if the owner bought new shares from the club at 80% of
 * value with the money they covered. Returns how it went, in a sentence.
 */
export function callCapital(state: GameState, need: number, why: string): string {
  const s = state.investors;
  if (!s?.partners.length) return fundCapitalCall(state, need);
  const r = rand(state, `call-${state.date}-${s.calls.length}`);
  const value = valuation(state, state.userTeam);
  let ours = Math.round(need * ownerShare(state));
  const missed: string[] = [];
  for (const p of s.partners) {
    const part = Math.round(need * p.pct);
    const odds = (p.kind === "individual" || p.kind === "celebrity" ? 0.06 : 0.02) + (p.mood < 30 ? 0.12 : 0) + (inRecession(state) ? 0.05 : 0);
    if (r() < odds) {
      ours += part;
      const moved = Math.min(p.pct - 0.005, part / (value * 0.8));
      p.pct -= moved;
      p.mood = clamp(p.mood - 10);
      missed.push(`${p.name} didn't fund ${money(part)} and was diluted by ${pctText(moved)}`);
      note(state, `${p.name} missed a capital call and was diluted from ${pctText(p.pct + moved)} to ${pctText(p.pct)}.`);
    } else {
      p.calls += part;
      p.mood = clamp(p.mood - 3);
    }
  }
  s.calls.unshift({ date: state.date, amount: need, ours, why });
  s.calls.splice(30);
  const how = fundCapitalCall(state, ours);
  return `The partners put in ${money(need - ours)} of the ${money(need)}; your part was ${money(ours)}. ${missed.length ? missed.join("; ") + ". " : ""}${how}`;
}

/** The owner calls capital from every partner, to build cash before it's needed. */
export function ownerCapitalCall(state: GameState, amount: number): string | null {
  if (amount < 5 * M) return "Calls start at $5M.";
  if (!investors(state).partners.length) return "With no partners, just put money in from the Business page.";
  const real = state.settings.finances !== "relaxed";
  const o = owner(state);
  if (real && amount * ownerShare(state) > o.liquid + o.outside * 0.9) return "You can't cover your own part of that call.";
  post(state, "capital", amount, "Capital call from every partner");
  const how = callCapital(state, amount, "Called by the owner");
  send(state, "business", "Chief financial officer", "Capital call made", how);
  return null;
}

// ---- Selling a stake ----

const FIRST = ["Daniel", "Priya", "Marcus", "Elena", "Victor", "Grace", "Owen", "Nadia", "Theo", "Lauren", "Rafael", "Simone", "Graham", "Ivy", "Malcolm", "Tessa"];
const LAST = ["Halvorsen", "Achebe", "Lindqvist", "Moreau", "Castellano", "Whitcombe", "Okafor", "Brennan", "Szabo", "Delacroix", "Yamada", "Pryor", "Valdés", "Ashby"];
const FUNDS = ["Harborline Sports Partners", "Northgate Capital Sports Fund", "Meridian Stadia Partners", "Crestwater Sports Equity", "Bellhaven Growth Fund"];
const FAMILIES = ["the Ostrander family office", "the Kessler family office", "Wexford Family Holdings", "the Marchetti family office"];
const WHO: Record<Partner["kind"], string[]> = {
  individual: ["Founded a software company and sold it", "Built a regional bank", "Runs a private real-estate firm", "Made a fortune in logistics", "Started a medical-device company"],
  family: ["Old industrial money, now in property and timber", "A third-generation retail fortune", "An energy family moving into sports"],
  fund: ["An approved private-equity fund with stakes in other leagues' clubs", "A sports fund backed by pension money"],
  celebrity: ["A retired All-Pro who wants a say in the club he grew up rooting for", "A recording artist with a big following in the city"],
};

/** Who's interested in a stake right now, and what they'd pay. Made-up bidders. */
function makeBids(state: GameState, sale: StakeSale): StakeBid[] {
  const s = investors(state);
  const r = rand(state, `bids-${sale.id}`);
  const value = valuation(state, state.userTeam);
  const fundsHeld = s.partners.filter((p) => p.kind === "fund" && p.id !== sale.seller).reduce((t, p) => t + p.pct, 0);
  const kinds: Partner["kind"][] = ["individual", "family", "individual", "celebrity"];
  if (fundsHeld + sale.pct <= OWNERSHIP_RULES.fundCap + 1e-9) kinds.push("fund", "fund");
  // Smaller stakes draw more interest; recessions thin the field.
  const n = Math.max(1, Math.min(4, Math.round(1 + r() * 3 - (sale.pct > 0.2 ? 1 : 0) - (inRecession(state) ? 1 : 0))));
  const bids: StakeBid[] = [];
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(r() * kinds.length)];
    const name = kind === "fund" ? FUNDS[Math.floor(r() * FUNDS.length)] : kind === "family" ? FAMILIES[Math.floor(r() * FAMILIES.length)] : `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    if (bids.some((b) => b.name === name)) continue;
    // A minority stake sells below the club's full value; better terms and a board seat close some of the gap. Celebrities pay up.
    const discount = 0.1 + TERMS[sale.terms].discount + (sale.pct >= 0.2 ? 0.03 : 0) + (kind === "fund" ? 0.02 : 0) - (kind === "celebrity" ? 0.04 : 0);
    const lean = 0.92 + r() * 0.14;
    bids.push({
      id: `${sale.id}-b${i}`, name, kind, background: WHO[kind][Math.floor(r() * WHO[kind].length)],
      price: Math.round(value * sale.pct * (1 - discount) * lean / M) * M,
      board: sale.terms === "investor" || (sale.terms === "standard" && sale.pct >= 0.1),
    });
  }
  return bids.sort((a, b) => b.price - a.price);
}

/** Checks a proposed sale against the league's rules. */
export function checkSale(state: GameState, pct: number, kind: StakeSale["kind"]): string | null {
  const s = investors(state);
  if (s.sale && s.sale.stage !== "closed" && s.sale.stage !== "failed") return "A stake sale is already under way.";
  if (pct < OWNERSHIP_RULES.minStake) return "A stake must be at least 1%.";
  if (s.partners.length >= OWNERSHIP_RULES.maxPartners) return "The group already has the most limited partners the league allows.";
  const own = ownerShare(state);
  const after = kind === "secondary" ? own - pct : own * (1 - pct);
  if (after < OWNERSHIP_RULES.controlMin - 1e-9) return `You'd hold ${pctText(after)}; the league requires the controlling owner to keep at least 30%.`;
  return null;
}

/**
 * Put a stake on the market. Secondary: your own shares, and the money comes
 * to you. Primary: new shares, the money goes into the club, and everyone is
 * diluted. Bids come back in about three weeks as a memo.
 */
export function openSale(state: GameState, pct: number, kind: StakeSale["kind"], terms: StakeTerms, seller?: string): string | null {
  const err = seller ? null : checkSale(state, pct, kind);
  if (err) return err;
  if (kind === "primary") {
    const no = reserved(state, "equity", 0, `Issuing ${pctText(pct)} in new shares`);
    if (no) return no;
  }
  const s = investors(state);
  const sale: StakeSale = { id: `sale-${state.date}-${s.sales.length}`, opened: state.date, kind, pct, terms, seller, stage: "marketing", bidsDue: addDays(state.date, 21), bids: [] };
  s.sale = sale;
  post(state, "professional", -Math.round(Math.max(1 * M, 0.004 * valuation(state, state.userTeam) * pct)), "Bankers and lawyers for a stake sale");
  note(state, `Put ${pctText(pct)} of the club on the market (${kind === "primary" ? "new shares" : seller ? "a partner's stake" : "your shares"}, ${TERMS[terms].label.toLowerCase()} terms).`);
  return null;
}

function bidsMemo(state: GameState, sale: StakeSale): void {
  sale.bids = makeBids(state, sale);
  sale.stage = "bids";
  const whose = sale.seller ? `${investors(state).partners.find((p) => p.id === sale.seller)?.name ?? "A partner"}'s stake` : sale.kind === "primary" ? "new shares" : "your shares";
  addMemo(state, {
    kind: "general", area: undefined, from: "Chief financial officer", title: `Bids for ${pctText(sale.pct)} of the club`,
    problem: `The bankers took ${pctText(sale.pct)} (${whose}) to buyers. ${sale.bids.length} bid${sale.bids.length === 1 ? "" : "s"} came in against a club value of about ${billions(valuation(state, state.userTeam))}.`,
    proposal: `Take the best bid, from ${sale.bids[0].name}, at ${money(sale.bids[0].price)}. The league's finance committee then vets the buyer, which takes about six weeks.`,
    amount: sale.bids[0].price,
    options: [
      ...sale.bids.slice(0, 3).map((b) => ({ label: `${b.name}: ${money(b.price)}`, effect: `${b.background}.${b.board ? " Gets a board seat." : ""}`, evidence: "confirmed" as const })),
      { label: "Turn them all down", effect: "The stake stays where it is. The bankers' fees are already spent." },
    ],
    risks: ["A partner is a partner for years: they read every report and vote on reserved matters.", "The league can still turn a buyer down."],
    budget: sale.kind === "primary" ? "The money goes into the club's cash." : sale.seller ? "The money goes to the selling partner." : "The money goes to you, less capital-gains tax.",
    recommend: 0, deadline: addDays(state.date, 14), ifLate: "The bids lapse and the stake stays where it is.",
    payload: { investors: "bids", sale: sale.id },
  });
}

function closeSale(state: GameState, sale: StakeSale, vet = true): void {
  const s = investors(state);
  const bid = sale.bids.find((b) => b.id === sale.chosen);
  if (!bid) return;
  // The league's vetting fails now and then, more often for funds near their limits.
  const r = rand(state, `vet-${sale.id}`);
  if (vet && r() < (bid.kind === "fund" ? 0.08 : 0.03)) {
    sale.stage = "failed";
    note(state, `The league's finance committee didn't approve ${bid.name}; the sale fell through.`);
    send(state, "league", "League finance committee", "Stake sale not approved", `The committee declined to approve ${bid.name} as a limited partner. The stake stays where it was; you can take it back to market.`);
    return;
  }
  const value = valuation(state, state.userTeam);
  const o = owner(state);
  const real = state.settings.finances !== "relaxed";
  const p: Partner = {
    id: `lp-${sale.id}`, name: bid.name, kind: bid.kind, pct: sale.pct, since: state.date, paid: bid.price, calls: 0, distributions: 0,
    mood: 64, board: bid.board, terms: sale.terms, putFrom: sale.terms === "investor" ? addDays(state.date, 7 * 365) : undefined,
    complaints: 0, background: bid.background, entryValue: value,
  };
  if (sale.seller) {
    const old = s.partners.find((x) => x.id === sale.seller);
    if (old) {
      s.former.unshift({ name: old.name, pct: old.pct, left: state.date, how: `Sold to ${bid.name} for ${money(bid.price)}` });
      s.formerNet = (s.formerNet ?? 0) + old.calls - old.distributions;
      s.partners = s.partners.filter((x) => x !== old);
      p.pct = old.pct;
    }
  } else if (sale.kind === "primary") {
    for (const x of s.partners) x.pct *= 1 - sale.pct;
    post(state, "capital", bid.price, `New shares sold to ${bid.name}`);
  } else {
    // The owner's own shares: the money comes to the owner, less tax on the gain over what that slice cost.
    const basis = (equityAtPurchase(state) + o.putIn - o.takenOut) * sale.pct / Math.max(0.01, ownerShare(state));
    const tax = Math.max(0, Math.round((bid.price - basis) * 0.238));
    s.proceeds += bid.price;
    s.gainsTax += tax;
    o.taxesPaid += tax;
    if (real) o.liquid += bid.price - tax;
    o.log.unshift({ date: state.date, text: `Sold ${pctText(sale.pct)} of the club to ${bid.name} for ${money(bid.price)} (${money(tax)} in capital-gains tax).` });
  }
  s.partners.push(p);
  sale.stage = "closed";
  s.sales.unshift({ date: state.date, kind: sale.seller ? "partner exit" : sale.kind, pct: p.pct, price: bid.price, buyer: bid.name });
  note(state, `${bid.name} bought ${pctText(p.pct)} of the club for ${money(bid.price)}.`);
  news(state, `${TEAM_BY_ID[state.userTeam].name} sell a ${pctText(p.pct)} stake to ${bid.name}, valuing the club near ${billions(bid.price / p.pct)}`);
  addStory(state, {
    outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [state.userTeam],
    headline: `${bid.name} buys into the ${TEAM_BY_ID[state.userTeam].name}`,
    body: `League owners approved the sale of a ${pctText(p.pct)} limited-partner stake for about ${money(bid.price)}. ${state.ownerName} keeps control with ${pctText(ownerShare(state))}.`,
  });
}

// ---- Partners who complain or want out ----

/** The group buys a partner out with the owner's money, at a small discount to value. */
export function buyOut(state: GameState, p: Partner, discount: number): string | null {
  const price = Math.round(valuation(state, state.userTeam) * p.pct * (1 - discount));
  const o = owner(state);
  const real = state.settings.finances !== "relaxed";
  if (real && price > o.liquid + o.outside * 0.9) return `You'd need ${money(price)} and don't have it.`;
  if (real) {
    const fromCash = Math.min(o.liquid, price);
    o.liquid -= fromCash;
    if (price > fromCash) {
      o.outside -= (price - fromCash) / 0.9;
      o.log.unshift({ date: state.date, text: `Sold outside holdings in a hurry to buy out ${p.name}.` });
    }
  }
  const s = investors(state);
  s.formerNet = (s.formerNet ?? 0) + p.calls - p.distributions;
  s.partners = s.partners.filter((x) => x !== p);
  s.former.unshift({ name: p.name, pct: p.pct, left: state.date, how: `Bought out by you for ${money(price)}` });
  o.log.unshift({ date: state.date, text: `Bought out ${p.name}'s ${pctText(p.pct)} for ${money(price)}.` });
  note(state, `Bought out ${p.name} (${pctText(p.pct)}) for ${money(price)}.`);
  return null;
}

/** Decide an investor memo. Called from memos.ts for general memos that carry `investors` in the payload. */
export function resolveInvestorMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  const s = investors(state);
  const partner = s.partners.find((x) => x.id === p.partner);
  switch (p.investors) {
    case "bids": {
      const sale = s.sale;
      if (!sale || sale.id !== p.sale || sale.stage !== "bids") return "That sale is over.";
      const bid = sale.bids[choice];
      if (!bid || choice >= Math.min(3, sale.bids.length)) {
        sale.stage = "failed";
        note(state, `Turned down every bid for ${pctText(sale.pct)}.`);
        if (sale.seller) {
          const seller = s.partners.find((x) => x.id === sale.seller);
          if (seller) seller.mood = clamp(seller.mood - 12);
        }
        return null;
      }
      sale.chosen = bid.id;
      sale.stage = "league";
      sale.closes = addDays(state.date, 45);
      note(state, `Accepted ${bid.name}'s bid of ${money(bid.price)}; the league is vetting the buyer.`);
      return null;
    }
    case "complaint": {
      if (!partner) return null;
      if (choice === 0) partner.mood = clamp(partner.mood + 10);
      if (choice === 1) {
        const total = p.special as number;
        if (cashBalance(state) - total < 0) return "The club doesn't have the cash for that distribution.";
        post(state, "distribution", -total, "Special distribution to every partner");
        ownerMoney(state, shareDistribution(state, total), state.settings.finances !== "relaxed");
      }
      if (choice === 2) partner.mood = clamp(partner.mood - 4);
      return null;
    }
    case "exit": {
      if (!partner) return null;
      if (choice === 0) return buyOut(state, partner, 0.08);
      if (choice === 1) {
        if (s.sale && s.sale.stage !== "closed" && s.sale.stage !== "failed") return "Another sale is already under way.";
        partner.mood = clamp(partner.mood + 6);
        return openSale(state, partner.pct, "secondary", partner.terms, partner.id);
      }
      // Refusing: a partner with a put can force it through arbitration; others go away angry and talk.
      if (partner.putFrom && partner.putFrom <= state.date) {
        post(state, "legal", -3 * M, `Arbitration: ${partner.name}'s put right`);
        const err = buyOut(state, partner, 0);
        if (err) {
          // The owner can't pay: the club funds it with new borrowing pressure and the story gets out.
          partner.mood = 0;
          return err;
        }
        note(state, `${partner.name} exercised a put through arbitration; the group had to buy them out at full value.`);
        return null;
      }
      partner.mood = clamp(partner.mood - 10);
      partner.complaints++;
      addStory(state, {
        outlet: "ledger", by: MEDIA_BY_ID.ledger.insider, kind: "owner", teams: [state.userTeam],
        headline: `Friction in the ${TEAM_BY_ID[state.userTeam].name} ownership group`,
        body: `A limited partner has been trying to sell out, people familiar with the group say, and ${state.ownerName} has refused to help. Minority partners have little leverage under most NFL agreements.`,
      });
      return null;
    }
    case "bridge": {
      if (choice !== 0) return null;
      return bridgeLoan(state, p.amount as number, p.rate as number);
    }
    default:
      return null;
  }
}

// ---- Contingency financing and related-party deals ----

/**
 * A short bridge loan from the owner to the club, at a rate set by the owner.
 * It's a related-party deal: with partners, the board reviews whether the rate
 * is fair (no more than two points over the market).
 */
export function bridgeLoan(state: GameState, amount: number, rate: number): string | null {
  const o = owner(state);
  const real = state.settings.finances !== "relaxed";
  if (amount < 10 * M) return "Bridge loans start at $10M.";
  if (real && amount > o.liquid) return "You don't have that much cash on hand.";
  const s = investors(state);
  const fair = marketRate(state) + 0.02;
  if (s.partners.length) {
    const excess = rate > fair + 1e-9;
    const no = reserved(state, "relatedParty", amount, `A ${money(amount)} bridge loan from the owner at ${(rate * 100).toFixed(1)}%`);
    s.reviews.unshift({ date: state.date, what: `Bridge loan from the owner, ${money(amount)} at ${(rate * 100).toFixed(1)}%`, amount, outcome: no ? "Turned down by the board" : excess ? "Approved, but the rate is above the fair-rate test" : "Approved: the rate passes the fair-rate test" });
    if (excess) for (const p of s.partners) p.mood = clamp(p.mood - 6);
    if (no) return no;
  } else {
    s.reviews.unshift({ date: state.date, what: `Bridge loan from the owner, ${money(amount)} at ${(rate * 100).toFixed(1)}%`, amount, outcome: "Disclosed to the league" });
  }
  s.reviews.splice(30);
  const d = debt(state);
  const id = `L${d.loans.length + 1}-${state.date}-owner`;
  d.loans.push({
    id, lender: "Owner (related party)", amount, years: 1, kind: "fixed", rate, amort: "bullet", fee: 0, minCoverage: 0, maxLeverage: 999,
    security: "Unsecured, behind the club's lenders", start: state.date, maturity: addDays(state.date, 365), balance: amount, stepUp: 0, breaches: 0, purpose: "bridge",
  });
  post(state, "loanIn", amount, "Bridge loan from the owner");
  if (real) o.liquid -= amount;
  s.bridges.push({ id });
  note(state, `Lent the club ${money(amount)} for a year at ${(rate * 100).toFixed(1)}%.`);
  return null;
}

/** Interest and repayment on the owner's bridge loans land in the owner's pocket. */
function settleBridges(state: GameState, monthStart: boolean): void {
  const s = investors(state);
  if (!s.bridges.length) return;
  const real = state.settings.finances !== "relaxed";
  const o = owner(state);
  for (const b of s.bridges) {
    if (b.settled) continue;
    const l = debt(state).loans.find((x) => x.id === b.id);
    if (!l) { b.settled = true; continue; }
    if (monthStart && !l.repaid && real) o.liquid += Math.round(l.balance * l.rate / 12);
    if (l.repaid || l.balance <= 0) {
      if (real) o.liquid += l.amount;
      b.settled = true;
      note(state, `The club repaid your ${money(l.amount)} bridge loan.`);
    }
  }
}

/** Where money could come from if the club ran short, and how much. */
export function contingency(state: GameState): { source: string; amount: number; how: string }[] {
  const d = debt(state);
  const o = owner(state);
  const value = valuation(state, state.userTeam);
  const room = Math.max(0, OWNERSHIP_RULES.controlMin < ownerShare(state) ? ownerShare(state) - OWNERSHIP_RULES.controlMin : 0);
  const budget = Object.values(business(state).budget).reduce((t, v) => t + Math.max(0, v), 0);
  return [
    { source: "Credit line", amount: Math.max(0, d.facility.limit - drawn(state)), how: "Draws automatically when cash runs out (Business > Financing)." },
    { source: "Bridge loan from you", amount: o.liquid, how: "A one-year loan from your own cash; a related-party deal the board reviews." },
    { source: "Capital call", amount: Math.round((o.liquid + o.outside * 0.9) / Math.max(0.3, ownerShare(state))), how: "Every partner pays their share; one who can't is diluted." },
    { source: "Selling a stake", amount: Math.round(value * room * 0.9), how: "New shares or yours, down to the league's 30% control minimum. Takes about ten weeks." },
    { source: "Cutting budgets", amount: Math.round(budget * 4 * M), how: "Department budgets back to the league average (Business > Budgets)." },
  ];
}

// ---- Value and returns ----

/**
 * The club's value against the owner's own equity, in today's dollars and in
 * the dollars of the purchase year, and against a hurdle that charges for
 * debt and for money locked up in one illiquid asset.
 */
export function returns(state: GameState): {
  enterprise: number; netDebt: number; clubEquity: number; ours: number; share: number; years: number;
  evGrowth: number; nominal: number; real: number; hurdle: number; excess: number; inflation: number;
} {
  const o = owner(state);
  const s = investors(state);
  const ev = valuation(state, state.userTeam);
  const netDebt = totalDebt(state) - Math.max(0, cashBalance(state));
  const years = Math.max(0.25, daysBetween(o.since, state.date) / 365);
  const evGrowth = Math.pow(ev / Math.max(1, o.purchase), 1 / years) - 1;
  const start = equityAtPurchase(state) + o.putIn;
  const end = ownerEquity(state) + o.takenOut + s.proceeds;
  const nominal = start > 0 && end > 0 ? Math.pow(end / start, 1 / years) - 1 : -1;
  const sinceYear = leagueYear(o.since);
  const inflation = Math.pow(cpiFor(state, leagueYear(state.date)) / cpiFor(state, sinceYear), 1 / years) - 1;
  const real = (1 + nominal) / (1 + inflation) - 1;
  // The hurdle: a safe rate, a stock-market premium, a premium for being unable to sell quickly, and more for debt.
  const leverage = totalDebt(state) / Math.max(1, ev);
  const hurdle = marketRate(state) + 0.05 + 0.02 + 0.06 * leverage;
  return { enterprise: ev, netDebt, clubEquity: ev - netDebt, ours: ownerEquity(state), share: ownerShare(state), years, evGrowth, nominal, real, hurdle, excess: nominal - hurdle, inflation };
}

/** What the partners put into the club (new shares and capital calls) less what it paid them: their part of contributed capital. */
export function partnersContributed(state: GameState): number {
  const s = state.investors;
  if (!s) return 0;
  const primary = s.sales.filter((x) => x.kind === "primary").reduce((t, x) => t + x.price, 0);
  return primary + s.partners.reduce((t, p) => t + p.calls - p.distributions, 0) + (s.formerNet ?? 0);
}

/** Each partner's money in, money out and the value of their stake today. */
export function partnerReturn(state: GameState, p: Partner): { value: number; multiple: number } {
  const value = Math.round((valuation(state, state.userTeam) - totalDebt(state) + Math.max(0, cashBalance(state))) * p.pct);
  return { value, multiple: (value + p.distributions) / Math.max(1, p.paid + p.calls) };
}

// ---- The quarterly report and partner moods ----

function quarterlyReport(state: GameState): void {
  const s = investors(state);
  const year = leagueYear(state.date);
  const pl = pnl(state, year);
  const q = `Q${Math.floor((Number(state.date.slice(5, 7)) - 1) / 3) || 4} ${state.date.slice(0, 4)}`;
  const row = standings(state)[state.userTeam];
  const lines = [
    `Club value about ${billions(valuation(state, state.userTeam))}; debt ${money(totalDebt(state))}; cash ${money(cashBalance(state))}.`,
    `League year ${year} so far: revenue ${money(pl.totalRevenue)}, operating income ${money(pl.operating)}.`,
  ];
  if (s.disclosure !== "minimal") lines.push(row && row.w + row.l + row.t ? `On the field: ${row.w}-${row.l}${row.t ? `-${row.t}` : ""}.` : "No games played yet this season.");
  if (s.disclosure === "full") {
    lines.push(`Open decisions on the owner's desk: ${openMemos(state).length}. Loans: ${openLoans(state).map((l) => `${l.lender} ${money(l.balance)}`).join(", ") || "none"}.`);
    lines.push(`Capital calls in the last year: ${money(s.calls.filter((c) => c.date >= addDays(state.date, -365)).reduce((t, c) => t + c.amount, 0))}.`);
  }
  s.reports.unshift({ date: state.date, period: q, lines });
  s.reports.splice(12);
  // Partners like being told more. Investor-friendly terms promise full information.
  for (const p of s.partners) {
    const d = { full: 1.5, standard: 0.5, minimal: -2 }[s.disclosure] + (p.terms === "investor" && s.disclosure === "minimal" ? -3 : 0);
    p.mood = clamp(p.mood + d);
  }
}

/** Once a month: moods drift with results, value and money, and unhappy partners speak up. */
function monthly(state: GameState): void {
  const s = investors(state);
  if (!s.partners.length) return;
  const r = rand(state, `lp-month-${state.date}`);
  const row = standings(state)[state.userTeam];
  const games = row ? row.w + row.l + row.t : 0;
  const winPct = games ? (row.w + row.t / 2) / games : 0.5;
  for (const p of s.partners) {
    const growth = valuation(state, state.userTeam) / Math.max(1, p.entryValue) - 1;
    const pull = 60 + Math.max(-12, Math.min(12, growth * 30)) + (winPct - 0.5) * 16 + (inRecession(state) ? -4 : 0);
    p.mood = clamp(p.mood + (pull - p.mood) * 0.08 + (r() - 0.5) * 3);
  }
  const open = openMemos(state).filter((m) => m.payload?.investors);
  for (const p of s.partners) {
    if (open.some((m) => m.payload?.partner === p.id)) continue;
    if (s.sale?.seller === p.id && s.sale.stage !== "closed" && s.sale.stage !== "failed") continue;
    const putOpen = !!p.putFrom && p.putFrom <= state.date && p.mood < 50;
    if (p.mood < 22 || putOpen) {
      addMemo(state, {
        kind: "general", from: p.name, title: `${p.name} wants out`,
        problem: `${p.name} (${pctText(p.pct)}) has told the chief financial officer they want to sell their stake.${putOpen ? " Their agreement gives them a put: refused, they can force the group to buy them out at full value." : ""}`,
        proposal: "Find them a buyer, so the stake changes hands without your money.",
        amount: Math.round(valuation(state, state.userTeam) * p.pct),
        options: [
          { label: "Buy them out yourself", effect: `About ${money(valuation(state, state.userTeam) * p.pct * 0.92)} of your own money, at an 8% discount; your share goes up.` },
          { label: "Find them a buyer", effect: "The bankers market the stake; bids come back as a memo in about three weeks." },
          { label: "Refuse", effect: putOpen ? "They go to arbitration and the group buys them out at full value, plus legal costs." : "They stay, angrier, and the story gets out." },
        ],
        risks: ["An unhappy partner votes against reserved matters.", "Disputes inside ownership groups make the news."],
        budget: "Your own money, or none if a buyer is found.", recommend: 1, deadline: addDays(state.date, 21),
        ifLate: "Treated as a refusal.", payload: { investors: "exit", partner: p.id },
      });
    } else if (p.mood < 38 && r() < 0.35) {
      p.complaints++;
      const special = Math.round(valuation(state, state.userTeam) * 0.005 / M) * M;
      addMemo(state, {
        kind: "general", from: p.name, title: `A complaint from ${p.name}`,
        problem: `${p.name} (${pctText(p.pct)}) is unhappy with ${winPct < 0.45 ? "the results" : "the return on their money"} and wants to hear the plan.`,
        proposal: "Meet with them and walk through the plan.",
        options: [
          { label: "Meet with them", effect: "An afternoon of your time; they feel heard." },
          { label: `Pay a special distribution of ${money(special)}`, effect: "Every partner gets their share; the club's cash pays it." },
          { label: "Hear them out, change nothing", effect: "They stay unhappy." },
        ],
        risks: ["Complaints that go unanswered become exit requests."], budget: "None, unless you pay the distribution.",
        recommend: 0, deadline: addDays(state.date, 14), ifLate: "They take the silence badly.",
        payload: { investors: "complaint", partner: p.id, special },
      });
    }
  }
}

/** A memo the owner left unanswered: bids lapse, complaints sour, exit requests count as refusals. */
export function lapseInvestorMemo(state: GameState, m: Memo): void {
  const p = m.payload ?? {};
  if (p.investors === "bids") resolveInvestorMemo(state, m, 99);
  if (p.investors === "complaint") resolveInvestorMemo(state, m, 2);
  if (p.investors === "exit") resolveInvestorMemo(state, m, 2);
}

export function setDisclosure(state: GameState, level: InvestorsState["disclosure"]): void {
  investors(state).disclosure = level;
}

export function setSuccession(state: GameState, plan: InvestorsState["succession"]): void {
  const s = investors(state);
  if (s.succession === plan) return;
  s.succession = plan;
  // Funds like a clear exit; families like continuity.
  for (const p of s.partners) p.mood = clamp(p.mood + (plan === "sale" ? (p.kind === "fund" ? 3 : -1) : plan === "trust" ? (p.kind === "family" ? 2 : 0) : 1));
  note(state, `Set the succession plan: ${SUCCESSION[plan]}.`);
}

export const SUCCESSION: Record<InvestorsState["succession"], string> = {
  trust: "control passes to your family through a trust, with a trustee the league pre-approves",
  named: "control passes to a successor you name from the group, subject to the league's approval",
  sale: "the group sells the club, with partners tagging along on the same terms",
};

/** The covenants that can stop the club doing something, and where each stands. */
export function covenants(state: GameState): { what: string; status: string; ok: boolean }[] {
  const out: { what: string; status: string; ok: boolean }[] = [];
  for (const l of openLoans(state).filter((x) => x.minCoverage > 0)) {
    out.push({ what: `${l.lender}: debt-service coverage at least ${l.minCoverage}, debt at most ${l.maxLeverage} times earnings`, status: l.breaches ? `Broken (${l.breaches} test${l.breaches > 1 ? "s" : ""}); no distributions until it's fixed` : "Met", ok: !l.breaches });
  }
  const own = ownerShare(state);
  out.push({ what: "League: the controlling owner holds at least 30%", status: pctText(own), ok: own >= OWNERSHIP_RULES.controlMin });
  const funds = investors(state).partners.filter((p) => p.kind === "fund").reduce((t, p) => t + p.pct, 0);
  out.push({ what: "League: private-equity funds hold at most 10%", status: pctText(funds), ok: funds <= OWNERSHIP_RULES.fundCap + 1e-9 });
  if (investors(state).partners.length) {
    out.push({ what: "Investor agreement: reserved matters need two-thirds of the shares", status: own >= BOARD_MAJORITY ? "You hold enough to carry them alone" : "You need partners' votes", ok: true });
    const promised = investors(state).partners.some((p) => p.terms === "investor");
    out.push({ what: "Investor agreement: quarterly information rights", status: `${investors(state).disclosure} reports`, ok: !(promised && investors(state).disclosure === "minimal") });
  }
  return out;
}

export function investorsDaily(state: GameState): void {
  const s = state.investors;
  const day = state.date.slice(8, 10);
  const month = Number(state.date.slice(5, 7));
  // The quarterly report is written for the owner's files even with no partners.
  if (day === "15" && month % 3 === 1) quarterlyReport(state);
  if (!s) return;
  if (day === "01") monthly(state);
  settleBridges(state, day === "01");
  const sale = s.sale;
  if (sale?.stage === "marketing" && state.date >= sale.bidsDue) bidsMemo(state, sale);
  if (sale?.stage === "league" && sale.closes && state.date >= sale.closes) closeSale(state, sale);
}

/** Tests and the stake-sale save fixture: sell a stake straight to the best made-up bidder, skipping the wait and the vetting. */
export function forceSale(state: GameState, pct: number, kind: StakeSale["kind"] = "secondary", terms: StakeTerms = "standard"): Partner {
  const err = openSale(state, pct, kind, terms);
  if (err) throw new Error(err);
  const sale = investors(state).sale!;
  sale.bids = makeBids(state, sale);
  sale.chosen = sale.bids[0].id;
  sale.stage = "league";
  closeSale(state, sale, false);
  return investors(state).partners[investors(state).partners.length - 1];
}

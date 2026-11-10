// The club's legal side: which club company holds each agreement, how
// agreements end and renew, counsel's review of major transactions and who
// must sign off, how privileged material is kept and how long records are
// kept, and disputes that move from negotiation to mediation to arbitration
// or court, with an exposure report on everything unresolved. The disputes
// and their counterparties are made up.
import { liabilityShare } from "./shocks";
import { post } from "./business";
import { salaryCap } from "./contracts";
import { addDays } from "./dates";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { rngFor } from "./rng";
import { standingState } from "./standing";
import type { GameState, LegalMatter, LegalState } from "./types";

export function legal(state: GameState): LegalState {
  const l = (state.legal ??= { matters: [], review: true, access: "strict", retention: "full", reviews: [], amendments: [], breaches: [] });
  l.reviews ??= [];
  l.amendments ??= [];
  l.breaches ??= [];
  return l;
}

// ---- Club companies and agreement terms ----

/** The companies the club does business through. */
export function entities(state: GameState): { name: string; holds: string }[] {
  const t = TEAM_BY_ID[state.userTeam];
  const base = `${t.city} ${t.name}`;
  return [
    { name: `${base} Football Club, LLC`, holds: "The league membership, player, coach and executive contracts, and loans" },
    { name: `${base} Stadium Company, LLC`, holds: "The stadium lease or ownership, naming rights, events and suites" },
    { name: `${base} Media and Marketing, LLC`, holds: "Sponsorships, local radio and TV, the team store and licensing" },
    { name: `${base} Foundation`, holds: "Charitable grants and community programs (a separate nonprofit)" },
  ];
}

const ENTITY_BY_KIND: Record<string, number> = { Player: 0, Coach: 0, Executive: 0, Loan: 0, "Sponsor or media": 2, Stadium: 1, Foundation: 3 };

export function entityFor(state: GameState, kind: string): string {
  return entities(state)[ENTITY_BY_KIND[kind] ?? 0].name;
}

/** How each kind of agreement ends, renews and settles disputes. */
export const TERMS: Record<string, { exit: string; renewal: string; dispute: string }> = {
  Player: { exit: "Release at any time; guaranteed pay is still owed", renewal: "Extension by mutual agreement; tags and tenders are the club's option", dispute: "Grievance to an arbitrator under the CBA" },
  Coach: { exit: "Firing at any time; the guaranteed share is still owed", renewal: "Extension by mutual agreement", dispute: "Arbitration by the commissioner" },
  Executive: { exit: "At will, or for cause when guaranteed", renewal: "Mutual, with 90 days' notice", dispute: "Mediation, then arbitration" },
  "Sponsor or media": { exit: "For cause after a 60-day cure period; make-goods for missed deliverables", renewal: "Mutual; the partner has first negotiation 120 days before the end", dispute: "Negotiation, mediation, then arbitration" },
  Loan: { exit: "Prepay with a fee; default after a missed payment and a 30-day cure", renewal: "Refinance by agreement with the lender", dispute: "Court in the lender's state" },
};

/** Who must approve a commitment of this size or kind. */
export function authorization(state: GameState, amount: number, kind = "contract"): string[] {
  const cap = salaryCap(state, RULES.season);
  const chain = ["Counsel's review"];
  if (amount >= cap * 0.01) chain.push("The executive over the area");
  if (amount >= cap * 0.05 || kind === "settlement") chain.push("The owner");
  if (kind === "debt" || kind === "stadium" || kind === "ownership") chain.push("League finance committee", "Owners' vote over the league's limits");
  return chain;
}

// ---- Counsel's review and amendments ----

function reviewTransactions(state: GameState): void {
  const l = legal(state);
  const cap = salaryCap(state, RULES.season);
  for (const s of state.signings) {
    if (s.date !== state.date || s.team !== state.userTeam) continue;
    const name = PLAYER_BY_ID[s.player]?.name ?? s.player;
    if (s.kind === "extension") {
      l.amendments.unshift({ date: state.date, party: name, what: `Extended through ${RULES.season + s.years}; the earlier terms and bonus proration carry over` });
      l.amendments.length = Math.min(l.amendments.length, 60);
    }
    if (!l.review || s.apy < cap * 0.03) continue;
    const checks = ["League rules: the cap, the CBA's minimums and the deal's structure", "Labor: guarantees and bonuses as the CBA defines them", "Conflicts: nothing clashes with a sponsor or another agreement"];
    l.reviews.unshift({ date: state.date, what: `${name}: ${s.years} years, ${money(s.apy)} a year (${authorization(state, s.apy * s.years).join(", then ")})`, checks });
    l.reviews.length = Math.min(l.reviews.length, 40);
    post(state, "professional", -15_000, `Counsel's review: ${name}`);
  }
}

// ---- Disputes ----

const STAGE_COST: Record<string, number> = { negotiation: 15_000, mediation: 45_000, arbitration: 120_000, litigation: 220_000 };
const STAGE_DAYS: Record<string, number> = { negotiation: 30, mediation: 45, arbitration: 120, litigation: 210 };
const ARBITRATE = new Set(["player grievance", "sponsor contract dispute", "vendor contract dispute"]);
const INSURED: Record<string, number> = { "fan injury claims": 0.8, "employment claims": 0.5, "data breach class action": 0.6 };

const RANDOM: { kind: string; party: string; claim: [number, number]; text: string }[] = [
  { kind: "vendor contract dispute", party: "A concessions equipment supplier", claim: [0.3, 1.5], text: "says we ended its contract without the notice it required" },
  { kind: "sponsor contract dispute", party: "A regional sponsor", claim: [0.5, 3], text: "wants money back for signage and appearances it says it never got" },
  { kind: "employment claims", party: "A former employee", claim: [0.2, 2], text: "claims wrongful termination" },
  { kind: "player grievance", party: "The players' union for a released player", claim: [0.5, 4], text: "says the club owed him his injury guarantee" },
  { kind: "fan injury claims", party: "A fan hurt in the parking lot", claim: [0.2, 1.5], text: "sues over a fall on unlit stairs" },
  { kind: "trademark dispute", party: "A clothing company", claim: [0.3, 2], text: "says our new merchandise line copies its marks" },
];

/** Open a dispute (crises and the random events below call this). */
export function openMatter(state: GameState, kind: string, party: string, claim: number, strength?: number, text?: string): LegalMatter {
  const l = legal(state);
  const rng = rngFor(state.seed, `matter:${kind}:${state.date}`);
  const s = strength ?? Math.round((0.2 + rng() * 0.6) * 100) / 100;
  const m: LegalMatter = {
    id: `${state.date}:${kind}`, kind, party, entity: entityFor(state, kind.includes("sponsor") || kind.includes("trademark") ? "Sponsor or media" : kind.includes("fan") ? "Stadium" : "Player"),
    opened: state.date, stage: "negotiation", claim: Math.round(claim / 10_000) * 10_000, strength: s, spent: 0, insured: kind === "fan injury claims" ? liabilityShare(state) : INSURED[kind] ?? 0,
    demand: Math.round((claim * (0.6 + 0.3 * s)) / 10_000) * 10_000, next: addDays(state.date, STAGE_DAYS.negotiation), text: text ?? kind,
  };
  l.matters.unshift(m);
  l.matters.length = Math.min(l.matters.length, 40);
  send(state, "league", "General Counsel", `New legal matter: ${kind}`,
    `${party} ${text ?? `brings ${kind}`}. They claim ${money(m.claim)} and would settle now for ${money(m.demand)}. ` +
    "The agreement calls for negotiation first, then mediation; see the exposure report on the Legal page.");
  return m;
}

export function openMatters(state: GameState): LegalMatter[] {
  return legal(state).matters.filter((m) => !["settled", "won", "lost"].includes(m.stage));
}

/** Pay their current demand and end it. */
export function settleMatter(state: GameState, id: string): string | null {
  const m = legal(state).matters.find((x) => x.id === id);
  if (!m || !openMatters(state).includes(m)) return "Nothing to settle.";
  const pay = Math.round(m.demand * (1 - m.insured));
  post(state, "legal", -pay, `Settlement: ${m.kind}${m.insured ? " (after insurance)" : ""}`);
  m.stage = "settled";
  m.result = `Settled for ${money(m.demand)}${m.insured ? `, ${money(pay)} after insurance` : ""}`;
  return null;
}

function step(state: GameState, m: LegalMatter): void {
  const l = legal(state);
  const rng = rngFor(state.seed, `matterStep:${m.id}:${m.stage}`);
  if (m.stage === "negotiation") {
    m.stage = "mediation";
    m.demand = Math.round((m.demand * (0.8 + 0.2 * m.strength)) / 10_000) * 10_000;
  } else if (m.stage === "mediation") {
    // A mediator often gets it done.
    if (rng() < 0.45) {
      m.demand = Math.round((m.demand * 0.85) / 10_000) * 10_000;
      settleMatter(state, m.id);
      m.result = `Settled in mediation: ${m.result}`;
      return;
    }
    m.stage = ARBITRATE.has(m.kind) ? "arbitration" : "litigation";
    m.demand = Math.round((m.claim * (0.5 + 0.4 * m.strength)) / 10_000) * 10_000;
  } else {
    const records = l.retention === "minimal" ? 0.1 : 0;
    if (rng() < m.strength + records) {
      const award = Math.round((m.claim * (0.5 + rng() * 0.5)) / 10_000) * 10_000;
      post(state, "legal", -Math.round(award * (1 - m.insured)), `Judgment: ${m.kind}`);
      m.stage = "lost";
      m.result = `Lost: ${money(award)} awarded${m.insured ? `, ${Math.round(m.insured * 100)}% insured` : ""}`;
      if (m.kind.includes("fan") || m.kind.includes("employment") || m.kind.includes("breach")) standingState(state).league -= 1;
    } else {
      m.stage = "won";
      m.result = "Won";
    }
    send(state, "league", "General Counsel", `Decision: ${m.kind}`, `${m.result}. Defense costs came to ${money(m.spent)}.`);
    return;
  }
  m.next = addDays(state.date, STAGE_DAYS[m.stage]);
  send(state, "league", "General Counsel", `${m.kind}: now in ${m.stage}`, `${m.party} now asks ${money(m.demand)} to settle. Going on costs about ${money(STAGE_COST[m.stage])} a month in defense.`);
}

/** Expected losses on everything unresolved, with a range and the defense cost so far. */
export function exposure(state: GameState): { id: string; kind: string; stage: string; low: number; mid: number; high: number; spent: number; insured: number; demand: number }[] {
  return openMatters(state).map((m) => {
    const net = m.claim * (1 - m.insured);
    return { id: m.id, kind: m.kind, stage: m.stage, low: Math.round(net * Math.max(0, m.strength - 0.25) * 0.5), mid: Math.round(net * m.strength * 0.75), high: Math.round(net * Math.min(1, m.strength + 0.25)), spent: m.spent, insured: m.insured, demand: m.demand };
  });
}

// ---- Policies ----

export function setLegalPolicy(state: GameState, p: Partial<Pick<LegalState, "review" | "access" | "retention">>): void {
  Object.assign(legal(state), p);
}

export function legalDaily(state: GameState): void {
  if (!state.business) return;
  const l = legal(state);
  reviewTransactions(state);
  for (const m of openMatters(state)) if (state.date >= m.next) step(state, m);
  if (state.date.endsWith("-01")) {
    const rng = rngFor(state.seed, `legalMonth:${state.date}`);
    for (const m of openMatters(state)) {
      const cost = Math.round(STAGE_COST[m.stage] * Math.max(0.5, Math.min(3, m.claim / 2_000_000)));
      m.spent += cost;
      post(state, "legal", -cost, `Defense costs: ${m.kind}`);
    }
    if (l.access === "strict") post(state, "professional", -12_500, "Privileged-records controls");
    if (l.retention === "full") post(state, "professional", -10_000, "Records retention and litigation holds");
    // Leaks of privileged material: more likely with broad access, and only matter when something is open.
    const sensitive = openMatters(state).length + (state.crisis?.crises.filter((c) => c.stage !== "resolved").length ?? 0);
    if (sensitive && rng() < (l.access === "strict" ? 0.01 : 0.05) * sensitive) {
      const m = openMatters(state)[0];
      if (m) m.strength = Math.min(0.95, m.strength + 0.08);
      l.breaches.unshift({ date: state.date, text: m ? `Privileged notes on the ${m.kind} reached the other side.` : "Internal crisis notes leaked to a reporter." });
      l.breaches.length = Math.min(l.breaches.length, 20);
      standingState(state).league -= 1;
      news(state, `Leaked documents from the ${TEAM_BY_ID[state.userTeam].city} ${TEAM_BY_ID[state.userTeam].name} front office are making the rounds`);
    }
    // New disputes: about two a year.
    if (rng() < 2 / 12) {
      const r = RANDOM[Math.floor(rng() * RANDOM.length)];
      openMatter(state, r.kind, r.party, (r.claim[0] + rng() * (r.claim[1] - r.claim[0])) * 1_000_000, undefined, r.text);
    }
  }
}

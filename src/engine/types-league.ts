import type { Position } from "./types";
// Offseason program, camp, discipline, owners and the league meeting. Re-exported from types.ts; import from there.

// ---- Offseason program, training camp and discipline ----

/** How a player handles the voluntary spring program, and whether he came to the mandatory minicamp. */
export interface SpringPlan {
  plan: "full" | "most" | "away";
  /** Why he isn't there every day. */
  reason?: "contract" | "training" | "personal";
  minicamp?: "present" | "absent" | "excused" | "fined";
}

/** Two players competing for a starting spot in camp. */
export interface PositionBattle {
  team: string;
  pos: Position;
  ids: string[];
  opened: string;
  winner?: string;
  decided?: string;
}

export type IncidentKind = "ped" | "substance" | "gambling" | "comments" | "conduct" | "minicamp";

/** A discipline matter: a failed drug test, something said in public, a missed meeting. */
export interface Incident {
  date: string;
  team: string;
  player: string;
  kind: IncidentKind;
  /** Regular-season games suspended. */
  games?: number;
  fine?: number;
  text: string;
}

/** A call the owner gets to make; the staff's default stands if the owner doesn't answer in time. */
export interface OwnerDecision {
  id: string;
  date: string;
  expires: string;
  player: string;
  kind: "minicamp" | "comments";
  title: string;
  body: string;
  options: { key: string; label: string }[];
  /** The option taken if the owner says nothing. */
  fallback: string;
  answer?: string;
  outcome?: string;
}

export interface ProgramState {
  season: number;
  /** Spring attendance, by player: only the ones not planning to be there every day. */
  spring: Record<string, SpringPlan>;
  /** The attendance plans have been made for this spring. */
  springSet?: boolean;
  /** Practice reps the coaches have watched this season, by "team:player" (engine only). */
  reps: Record<string, number>;
  battles: PositionBattle[];
  decisions: OwnerDecision[];
  incidents: Incident[];
}

// ---- Owners and the league meeting ----

/** How one of the other owners feels about ours. */
export interface OwnerRelation {
  /** -100 to 100. Shown to the owner only in words. */
  rapport: number;
  ally?: boolean;
  rival?: boolean;
  /** How much this owner dislikes changing the game, 0-1 (engine only). */
  tradition: number;
  /** How many votes follow this owner's lead, 0-1 (engine only). */
  influence: number;
}

export interface RuleProposal {
  id: string;
  rule: string;
  /** A team id, or "committee" for the Competition Committee. */
  sponsor: string;
  /** The Competition Committee's recommendation. */
  committee: "for" | "against" | "neutral";
  /** Our vote, if the owner has decided. */
  ourVote?: boolean;
  /** Lobbying pressure on each owner: positive toward yes (engine only). */
  lobby: Record<string, number>;
  /** Narrowed to a one-season trial to win votes. */
  amended?: boolean;
  /** Back after failing in an earlier year, revised. */
  revised?: boolean;
  /** The league office's briefing, once asked for. */
  briefing?: string;
  /** Our owner made the case in committee. */
  argued?: boolean;
  /** Brought in our committee's name. */
  viaUs?: boolean;
  votes?: Record<string, boolean>;
  yes?: number;
  passed?: boolean;
}

export interface LeagueMeeting {
  /** The league year the changes would start in. */
  year: number;
  published: string;
  /** Last day to submit our own proposal. */
  deadline: string;
  voteDate: string;
  proposals: RuleProposal[];
  /** Lobbying calls made so far (there's only so much goodwill to spend). */
  calls: number;
  done?: boolean;
}

/** League money (leaguemoney.ts): media renewals, settled years and an open dispute. */
export interface LeagueMoneyState {
  tv: { optOut?: "out" | "stay"; renewals: { from: number; factor: number; text: string }[] };
  /** League years whose audited true-up has been paid, and when. */
  settled: Record<number, string>;
  dispute?: { year: number; amount: number; opened: string; contested?: boolean; resolves?: string; outcome?: string };
  log: { date: string; text: string }[];
}

export type Committee = "competition" | "finance" | "media" | "stadium" | "international" | "labor";

/** The league office (leagueoffice.ts): the commissioner, committees, coalitions, technology trials and schedule moves. */
export interface LeagueOfficeState {
  commissioner: { name: string; since: number; through: number; approval: number; renewal?: { year: number; ourVote?: boolean; yes?: number; passed?: boolean } };
  committees: Record<Committee, string[]>;
  /** A seat our owner asked for, decided at the next reshuffle. */
  seatAsk?: Committee;
  /** One coalition per issue our owner leads, with the clubs in it. */
  coalitions: { issue: string; members: string[]; formed: string }[];
  /** Technology trials run, by the season they ran in. */
  trials: Record<string, number>;
  moves: { game: string; date: string; kind: "flex" | "weather" | "facility"; text: string }[];
  log: { date: string; text: string }[];
}

/** League discipline cases (compliance.ts): kept short here so the league's health can read them. */
/** A league investigation of a club (ours or another): see engine/compliance.ts. */
export interface LeagueCase {
  id: string;
  team: string;
  year: number;
  kind: string;
  opened: string;
  /** inquiry (documents asked for), interviews, findings (the club may respond), sanctioned, appeal, closed. */
  stage: "inquiry" | "interviews" | "findings" | "sanctioned" | "appeal" | "closed";
  /** Engine only: how strong the league's evidence is, 0-1. */
  evidence?: number;
  /** Engine only: how serious the conduct was, 1-3. */
  severity?: number;
  /** Our answer when the league asked for documents and interviews. */
  response?: "cooperate" | "limited" | "contest";
  /** The day the case moves to its next stage. */
  next?: string;
  sanction?: string;
  fine?: number;
  picks?: string[];
  appealed?: boolean;
  outcome?: string;
  text: string;
}

/** Our compliance office and the league's oversight of the club (engine/compliance.ts). */
export interface ComplianceState {
  leagueCases: LeagueCase[];
  /** 0: the GM's assistant handles filings; 1: a compliance officer; 2: a department; 3: a department with outside counsel on call. */
  staff: number;
  officer?: string;
  /** The last compliance training for coaches and staff. */
  trained?: string;
  filings: { id: string; kind: string; due: string; filed?: string; late?: boolean; fine?: number }[];
  /** The last roster we filed, to see what changed. */
  roster?: string[];
  /** League years whose policy acknowledgments and conflict disclosures are certified. */
  certified: number[];
  /** Guaranteed money funded with the league: cash in escrow or a letter of credit. */
  funding: "cash" | "letter";
  escrow: number;
  audits: { year: number; date: string; findings: string[]; fine: number; capCharge: number }[];
  /** Draft picks the league took away. */
  forfeited: string[];
  /** Documented violations, which raise scrutiny and penalties; one falls off every two years. */
  strikes: number;
  physicals: { trade: string; player: string; team: string; passed: boolean; date: string; note: string }[];
  log: { date: string; text: string }[];
}

/** A crisis and the club's handling of it (engine/crisis.ts). */
export interface Crisis {
  id: string;
  kind: string;
  date: string;
  title: string;
  text: string;
  /** Engine only: whether the club is actually at fault, and how badly (0-1). */
  fault: number;
  severity: number;
  stage: "open" | "review" | "resolved";
  /** The owner's choices, by step: response, review, spokesperson, timing, disclosure, sponsors, staff, league. */
  plan: Record<string, string>;
  /** When the fact-finding reports back. */
  reviewDue?: string;
  findings?: string;
  remediation?: number;
  outcome?: string;
}

export interface CrisisState {
  crises: Crisis[];
  /** Who handles crises: the roles on the team and whether an outside firm is on retainer. */
  team: string[];
  firm: boolean;
  /** Engine only: lasting reputational damage that heals with clean conduct, not marketing. */
  scar: number;
  log: { date: string; text: string }[];
}

/** A legal matter: a dispute moving from negotiation to mediation to arbitration or court (engine/legal.ts). */
export interface LegalMatter {
  id: string;
  kind: string;
  party: string;
  entity: string;
  opened: string;
  stage: "negotiation" | "mediation" | "arbitration" | "litigation" | "settled" | "won" | "lost";
  /** What the other side claims, and the engine-only chance they win at the end. */
  claim: number;
  strength: number;
  /** Defense costs so far. */
  spent: number;
  /** The share insurance covers. */
  insured: number;
  /** Their latest settlement demand. */
  demand: number;
  next: string;
  result?: string;
  text: string;
}

export interface LegalState {
  matters: LegalMatter[];
  /** Major transactions go to counsel before they're signed. */
  review: boolean;
  /** Who can see privileged material: strict (need to know) or broad. */
  access: "strict" | "broad";
  /** How long records are kept: full (seven years and litigation holds) or minimal. */
  retention: "full" | "minimal";
  /** Transactions counsel reviewed, with what the checks found. */
  reviews: { date: string; what: string; checks: string[] }[];
  /** Changes to agreements, kept with the original terms. */
  amendments: { date: string; party: string; what: string }[];
  breaches: { date: string; text: string }[];
}

export interface AdoptedRule {
  rule: string;
  /** The first season it's in force. */
  year: number;
  /** A trial adopted as an amendment: the last season it's in force unless made permanent. */
  until?: number;
  yes: number;
  sponsor: string;
}

/** A Super Bowl or draft the owners awarded in this save (see engine/hosting.ts). */
export interface HostAward {
  team: string;
  city: string;
  /** Every team that bid, best bid first. */
  bidders: string[];
  votes: number;
  ballots: number;
  /** We were in the running. */
  ours?: boolean;
}

export interface HostingState {
  /** Super Bowls by the season they end. */
  sb: Record<number, HostAward>;
  /** Drafts by year. */
  draft: Record<number, HostAward>;
  /** Our bids for this spring's votes: the package level and the day it went in. */
  bids: { sb?: { level: number; date: string }; draft?: { level: number; date: string } };
}

export interface OwnersState {
  relations: Record<string, OwnerRelation>;
  rules: AdoptedRule[];
  meeting?: LeagueMeeting;
  /** Every proposal voted on, newest last. */
  history: { year: number; rule: string; sponsor: string; yes: number; passed: boolean; ours?: boolean }[];
}

/** A player's ask to redo his contract early: when, how hard his camp pushes, and the answer. */
export interface RedoAsk {
  /** The league year it was asked in. */
  year: number;
  asked: string;
  /** Patient; skipping the voluntary spring program; or threatening to stay off the field at camp. */
  stance: "patient" | "spring" | "camp";
  /** The average per year his camp is after. */
  apy: number;
  answer?: "promised" | "refused";
  /** The day a new deal settled it. */
  settled?: string;
}

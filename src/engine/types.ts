// Shapes of the generated league data (data/league-2026) and of a saved game.

export type Position =
  | "QB" | "RB" | "FB" | "WR" | "TE" | "OT" | "OG" | "C"
  | "EDGE" | "IDL" | "LB" | "CB" | "S" | "K" | "P" | "LS";

export interface ContractSeason {
  year: number;
  team: string | null;
  baseSalary: number;
  proratedBonus: number;
  rosterBonus: number;
  optionBonus: number;
  workoutBonus: number;
  otherBonus: number;
  guaranteedSalary: number;
  capHit: number;
}

export interface Contract {
  source: "overthecap" | "estimated-from-apy" | "estimated-minimum" | "free-agent";
  signedYear: number | null;
  years: number | null;
  totalValue: number | null;
  apy: number | null;
  guaranteed: number | null;
  apyCapPct: number | null;
  type: string | null;
  otcTeam: string | null;
  seasons: ContractSeason[];
}

/** One season of public stats. Keys are short names; absent means zero. */
export interface SeasonStats {
  season: number;
  team: string;
  [stat: string]: number | string;
}

export interface SnapSeason {
  games: number;
  offense: number;
  defense: number;
  st: number;
  offShare: number;
  defShare: number;
  stShare: number;
}

export interface PlayerData {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  /** The camp roster the player starts on; null for the free agent pool. */
  team: string | null;
  /** For the free agent pool: the player's last NFL team. */
  lastTeam?: string | null;
  position: Position;
  depthChartPosition: string | null;
  jersey: number | null;
  birthDate: string | null;
  heightIn: number | null;
  weightLb: number | null;
  college: string | null;
  yearsExp: number;
  rookieYear: number | null;
  draft: { team: string | null; round: number | null; overall: number | null };
  contract: Contract;
  ids: { pfr: string | null; espn: number | null; sleeper: string | number | null };
  headshotUrl: string | null;
  stats: SeasonStats[];
  snaps: Record<string, SnapSeason>;
}

export interface HiddenRating {
  overall: number;
  potential: number;
  durability: number;
  /** Position skills and athletic traits on the same scale as overall. */
  traits: Record<string, number>;
}

export type StaffRole = "HC" | "OC" | "DC" | "STC" | "GM" | "TRN" | "PRO" | "COL";
export type OffenseScheme = "wideZone" | "mcvay" | "westCoast" | "erhardtPerkins" | "spread" | "vertical" | "gapMotion";
export type DefenseScheme = "fangio" | "cover3" | "pressure" | "multiple" | "macdonald";

export interface StaffPerson {
  id: string;
  name: string;
  team: string;
  role: StaffRole;
  birthYear: number;
  birthYearEstimated: boolean;
  hiredYear: number;
  background: string | null;
  side: "offense" | "defense" | null;
  callsPlays: ("offense" | "defense")[];
  scheme: OffenseScheme | DefenseScheme | null;
  generated?: boolean;
}

export interface StaffData {
  people: StaffPerson[];
  teamSchemes: Record<string, { offense: OffenseScheme; defense: DefenseScheme }>;
  schemeNames: { offense: Record<OffenseScheme, string>; defense: Record<DefenseScheme, string> };
}

/** Hidden staff attributes, 0-100. Which keys exist depends on the role. */
export type StaffHidden = Partial<Record<
  "playCalling" | "development" | "gameManagement" | "leadership" | "evaluation" | "specialTeams" |
  "negotiation" | "capManagement" | "prevention" | "recovery", number>>;

export interface TeamData {
  id: string;
  city: string;
  name: string;
  conference: "AFC" | "NFC";
  division: "East" | "North" | "South" | "West";
  stadiumId: string;
  stadium: string;
  roof: string;
  surface: string;
  cap2026: { adjustedCap: number; deadMoney: number };
}

export type GameType = "PRE" | "REG" | "POST";
export type PlayoffRound = "WC" | "DIV" | "CONF" | "SB";

export interface ScheduledGame {
  id: string;
  type: GameType;
  week?: number;
  round?: PlayoffRound;
  conference?: "AFC" | "NFC";
  date: string;
  weekday: string;
  timeET: string;
  away: string | null;
  home: string | null;
  neutral: boolean;
  stadium?: string;
  city?: string;
  label?: string;
  divisionGame?: boolean;
}

export interface Rules {
  season: number;
  salaryCap: number;
  minimumSalary: Record<string, number>;
  minimumSalaryNextYear: Record<string, number>;
  practiceSquadWeekly: { standard: number; veteranMin: number; veteranMax: number };
  rosterLimits: { offseason: number; regularSeason: number; practiceSquad: number; gameDayActive: number };
  /** Waiver priority before the standings take over: the 2026 draft order, first claim first. */
  waiverOrder: string[];
  veteranReportDaysBeforeOpener: number;
  veteranReportDaysBeforeMondayOpener: number;
  rookieEarlyReportDays: number;
  keyDates: Record<string, string>;
}

// ---- Saved game ----

/**
 * camp: on the offseason (90-man) roster. active: on the 53. ps: practice squad. ir: injured reserve.
 * future: signed to a reserve/future deal that starts next league year. fa: free agent (or on waivers).
 */
export type RosterStatus = "camp" | "active" | "ps" | "ir" | "future" | "fa";

export interface Injury {
  type: string;
  /** Day the injury happened. */
  date: string;
  /** First day the player is expected to be able to play again. */
  returnDate: string;
  seasonEnding: boolean;
}

export interface PlayerState {
  team: string | null;
  status: RosterStatus;
  injury?: Injury;
  /** In-season development: change to true ability since the season began. */
  dev?: number;
  /** Date placed on injured reserve (eligible to return after four games). */
  irDate?: string;
  /** 0-100, how the player feels about the team; absent means content (70). Never shown as a number. */
  morale?: number;
  /** The team that last held the player's rights, for a free agent. */
  lastTeam?: string;
  /** Staying away from camp, or showing up and not practicing, until a new deal is done. */
  holdout?: { kind: "holdout" | "holdin"; since: string };
  /** Practice squad: times elevated to the game-day roster this season (three is the limit). */
  elevations?: number;
  /** Practice squad: the game day the player is elevated for. */
  elevatedFor?: string;
  /** Signed off another team's practice squad: has to stay on the 53 until this date. */
  keepUntil?: string;
}

export type DealKind =
  | "rookie" | "veteran" | "extension" | "franchise" | "transition" | "rfa" | "erfa" | "minimum" | "practice";

/** One league year of a contract, the way the cap sees it. */
export interface DealYear {
  year: number;
  /** Paragraph 5 base salary, paid weekly over the 18 regular-season weeks. */
  base: number;
  /** Signing and option bonus spread onto this year. */
  proration: number;
  /** Roster, workout and other bonuses counted this year (not prorated). */
  bonus: number;
  /** Fully guaranteed salary and bonus this year. */
  guaranteed: number;
  /** Salary guaranteed only for injury until it vests. */
  injuryGuaranteed: number;
  /** Day the injury guarantee becomes fully guaranteed. */
  vests?: string;
  /** A dummy year that exists only to spread the bonus; it voids before it is played. */
  void?: boolean;
  /** Regular-season weeks of base salary owed, when signed mid-season (default all 18). */
  weeks?: number;
}

/** A player contract. Original contracts come from the data; the game writes new ones. */
export interface Deal {
  team: string;
  /** Signing date (the data only has the year for original contracts: yyyy-03-15). */
  signed: string;
  kind: DealKind;
  signingBonus: number;
  /** Headline numbers as reported: new money over the real (non-void) years. */
  total: number;
  apy: number;
  /** Fully guaranteed at signing, signing bonus included. */
  guaranteedAtSigning: number;
  years: DealYear[];
  /** First-round rookie deals: the team may pick up a fifth year. */
  fifthYearOption?: { year: number; amount: number; exercised?: boolean; declined?: boolean };
}

/** @deprecated version 2 saves stored this shape; migrated to Deal. */
export interface SignedContract {
  team: string;
  date: string;
  seasons: { year: number; capHit: number; guaranteed: number }[];
}

export interface GameResult {
  away: string;
  home: string;
  awayScore: number;
  homeScore: number;
  overtime: boolean;
}

/** Team totals for one game. */
export interface TeamBox {
  firstDowns: number;
  plays: number;
  yards: number;
  passYds: number;
  rushYds: number;
  rushAtt: number;
  passAtt: number;
  cmp: number;
  sacked: number;
  sackYds: number;
  thirdConv: number;
  thirdAtt: number;
  fourthConv: number;
  fourthAtt: number;
  turnovers: number;
  penalties: number;
  penYds: number;
  top: number;
  redZoneTd: number;
  redZoneAtt: number;
}

export interface ScoringPlay {
  q: number;
  /** Game clock left in the quarter, seconds. */
  clock: number;
  team: string;
  text: string;
  away: number;
  home: number;
}

export interface BoxScore {
  quarters: { away: number[]; home: number[] };
  team: { away: TeamBox; home: TeamBox };
  /** Per-player stat lines, packed in STAT_KEYS order (see engine/stats.ts). */
  players: { away: Record<string, number[]>; home: Record<string, number[]> };
  scoring: ScoringPlay[];
  inactives: { away: string[]; home: string[] };
  injuries: { player: string; team: string; type: string }[];
}

export type InboxKind = "staff" | "league" | "game" | "media" | "transaction" | "system";

export interface InboxItem {
  id: string;
  date: string;
  kind: InboxKind;
  from: string;
  title: string;
  body: string;
  read: boolean;
  /** A game this message is about, for a box score link. */
  gameId?: string;
}

export interface Settings {
  /** "real": the cap is enforced like the NFL does. "off": no cap at all. */
  capRules: "real" | "off";
}

export type AgentStyle = "hardball" | "leaker" | "relationship" | "deadline" | "guarantees" | "creative" | "steady";

export interface Agent {
  id: string;
  name: string;
  agency: string;
  style: AgentStyle;
  /** Years certified, for the agent's profile. */
  since: number;
}

/** The terms of an offer or counter (see engine/contracts.ts Terms). */
export interface OfferTerms {
  years: number;
  total: number;
  signingBonus: number;
  guaranteed: number;
  injuryGuaranteed: number;
  voidYears: number;
  shape: "flat" | "rising" | "front";
}

export interface NegotiationRound {
  date: string;
  from: "team" | "agent";
  terms: OfferTerms;
  /** What was said with it, in words. */
  note: string;
}

export type NegotiationKind = "extension" | "free-agent";

export interface Mandate {
  /** sign: get it done; value: only at a fair price; walk: let the player test the market. */
  goal: "sign" | "value" | "walk";
  maxApy?: number;
  maxGuaranteed?: number;
  maxYears?: number;
}

export interface Negotiation {
  player: string;
  team: string;
  kind: NegotiationKind;
  opened: string;
  status: "open" | "agreed" | "ended";
  /** Who is at the table for the team. */
  handler: "owner" | "gm";
  mandate?: Mandate;
  rounds: NegotiationRound[];
  /** The team's latest offer, waiting on an answer due on replyOn. */
  pending?: OfferTerms;
  replyOn?: string;
  /** The agent won't take calls until this date (after a lowball or a breakdown). */
  coolingUntil?: string;
  /** The GM's running notes, newest first. */
  notes: { date: string; text: string }[];
  // Hidden: never shown to the owner.
  /** The market price when the numbers below were set; they move with it. */
  base: number;
  /** Lowest APY-equivalent the player will take from this team right now. */
  floor: number;
  /** What the agent is asking now (APY), and wants in years and guarantee share. */
  ask: number;
  askYears: number;
  askGuarantee: number;
  /** Rounds of patience left before the agent ends talks. */
  patience: number;
  /** For a free agent: how far market prices had fallen when the numbers above were last set. */
  marketScale?: number;
}

/** A contract signed anywhere in the league during the game, for the transaction log and grades. */
export interface Signing {
  id: string;
  player: string;
  team: string;
  date: string;
  kind: NegotiationKind | "tag" | "tender" | "minimum";
  years: number;
  total: number;
  apy: number;
  guaranteed: number;
  /** Media grades at signing, by outlet. */
  grades: { outlet: string; grade: string; take: string }[];
  /** True value to the team at signing, kept for grading the deal later (engine only). */
  valueAtSigning: number;
}

/** An offer to a free agent from a team (the owner's offers go through talks instead). */
export interface FaOffer {
  team: string;
  terms: OfferTerms;
  apy: number;
  /** First-year cap hit, for the team's budget. */
  hit: number;
  date: string;
  /** An offer sheet to a restricted free agent or transition-tagged player. */
  sheet?: boolean;
}

/** A player on the open market. Everything here but the offers' existence is hidden. */
export interface FreeAgent {
  player: string;
  /** The league year the prices below are for: this season's remaining weeks, or next year's. Absent: next year. */
  year?: number;
  /** The team that last held the player's rights. */
  from: string | null;
  since: string;
  status: "open" | "agreed" | "signed";
  base: number;
  ask: number;
  floor: number;
  /** The floor on the first day, to scale talks as the price comes down. */
  floor0: number;
  askYears: number;
  askGuarantee: number;
  offers: FaOffer[];
  /** Terms agreed during the negotiating window, signed when the league year opens. */
  agreed?: { team: string; terms: OfferTerms; date: string };
  /** The owner's team gets a day to beat another team's offer. */
  lastLook?: { until: string; apy: number; team: string };
}

/** An offer sheet a restricted player signed: the old team can match. */
export interface OfferSheet {
  player: string;
  from: string;
  to: string;
  terms: OfferTerms;
  date: string;
  decideBy: string;
  /** Draft pick the signing team owes if the old team doesn't match. */
  compensation?: string;
}

export interface OffseasonState {
  /** The draft order, first pick first, set after the Super Bowl. */
  draftOrder?: string[];
  /** Franchise or transition tag used this year, by team. */
  tags: Record<string, { player: string; kind: "franchise" | "transition"; exclusive?: boolean }>;
  /** RFA and ERFA tenders by player. */
  tenders: Record<string, { team: string; level: "first" | "second" | "original" | "erfa"; amount: number }>;
  /** Fifth-year option decisions by player. */
  options: Record<string, "exercised" | "declined">;
  sheets: OfferSheet[];
  /** Draft picks owed for offer sheets that weren't matched (the draft is a later step). */
  picksOwed: { from: string; to: string; pick: string; player: string }[];
}

/** A released player on the waiver wire: other teams can claim the contract until the deadline. */
export interface WaiverEntry {
  player: string;
  /** The team that released the player. */
  from: string;
  placed: string;
  /** Claims are awarded at 4 PM ET on this day. */
  clears: string;
  /** The contract a claiming team takes on (bonus proration stays with the old team). */
  deal: Deal | null;
  /** Dead money the old team is relieved of if someone claims the player. */
  relief: { thisYear: number; nextYear: number };
  /** Teams that put in a claim; the owner can name who to release to make room. */
  claims: { team: string; drop?: string }[];
  /** The old team plans to sign the player to its practice squad if no one claims him. */
  psIntent?: boolean;
}

/** One line in the league's transaction wire. */
export interface Transaction {
  date: string;
  team: string;
  player: string;
  kind: "signed" | "released" | "waived" | "claimed" | "ps" | "promoted" | "poached" | "future" | "elevated" | "ir";
  text: string;
}

export interface TeamFinance {
  /** Cash paid to players, by league year. */
  paid: Record<number, number>;
}

export interface GameState {
  version: 3;
  id: string;
  createdAt: string;
  ownerName: string;
  userTeam: string;
  settings: Settings;
  date: string;
  seed: number;
  players: Record<string, PlayerState>;
  /** League-wide numbers that change as the game goes: the cap once each league year's is set. */
  league?: { caps: Record<number, number>; rollover?: Record<string, Record<number, number>> };
  /** Dead money a team carries, by team then season. */
  deadMoney: Record<string, Record<string, number>>;
  results: Record<string, GameResult>;
  /** Box scores by game id. */
  box: Record<string, BoxScore>;
  /** Contracts signed in this save, by player (null: released, no contract). Overrides the original contract. */
  contracts: Record<string, Deal | null>;
  /** Contract talks by player id: open ones and the history of finished ones. */
  negotiations: Record<string, Negotiation>;
  /** Each agent's trust in each front office, -100 to 100; absent means neutral. Hidden. */
  trust: Record<string, Record<string, number>>;
  signings: Signing[];
  finance: Record<string, TeamFinance>;
  /** The offseason: tags, tenders and options; created after the Super Bowl. */
  offseason?: OffseasonState;
  /** The free-agent market by player: every unsigned player, all year. */
  fa?: Record<string, FreeAgent>;
  /** Players on waivers, by player. */
  waivers?: Record<string, WaiverEntry>;
  /** Players a team released at cutdown and plans to bring back on its practice squad. */
  psPlans?: Record<string, string>;
  /** Practice squad players each team protects from other teams this week (up to four). */
  psProtect?: Record<string, string[]>;
  /**
   * Termination pay: vested veterans on a roster for Week 1, by player, with
   * the league year. Their salary for that season is owed even if released.
   */
  termPay?: Record<string, number>;
  /** The league's transaction wire, newest first. */
  transactions?: Transaction[];
  /** Fan and media mood toward the owner's team, 0-100 (50 neutral). */
  pressure: { fans: number; media: number };
  /** Teams filled into postseason slots as the bracket is decided. */
  playoffTeams: Record<string, { away: string; home: string }>;
  /** Seeds 1-7 per conference, set the day after the regular season ends. */
  seeds?: Record<"AFC" | "NFC", string[]>;
  champion?: string;
  /** The owner's edited cutdown plan: the full list of players to keep on the 53. */
  cutPlan?: string[];
  inbox: InboxItem[];
  /** Short league news feed, newest first. */
  news: { date: string; text: string }[];
}

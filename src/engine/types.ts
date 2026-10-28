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
  source: "overthecap" | "estimated-from-apy" | "estimated-minimum";
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
  team: string;
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
  veteranReportDaysBeforeOpener: number;
  veteranReportDaysBeforeMondayOpener: number;
  rookieEarlyReportDays: number;
  keyDates: Record<string, string>;
}

// ---- Saved game ----

/** camp: on the offseason (90-man) roster. active: on the 53. ps: practice squad. ir: injured reserve. fa: free agent. */
export type RosterStatus = "camp" | "active" | "ps" | "ir" | "fa";

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
  league?: { caps: Record<number, number> };
  /** Dead money a team carries, by team then season. */
  deadMoney: Record<string, Record<string, number>>;
  results: Record<string, GameResult>;
  /** Box scores by game id. */
  box: Record<string, BoxScore>;
  /** Contracts signed in this save, by player (null: released, no contract). Overrides the original contract. */
  contracts: Record<string, Deal | null>;
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

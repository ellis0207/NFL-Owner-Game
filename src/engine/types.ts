import type { Adv } from "./analytics";
import type { AnalyticsState } from "./strategy";
import type { ClubhouseState } from "./clubhouse";
import type { GameWeekState } from "./gameweek";
import type { ScoutStaffState } from "./scouts";
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

/** What kind of job a person does: coaches can rise to head coach, executives run front offices. */
export type StaffTrack = "coach" | "st" | "exec" | "trainer" | "scout";

/** One season of a person's career, as the public sees it. */
export interface CoachSeason {
  season: number;
  team: string;
  role: StaffRole;
  w: number;
  l: number;
  t: number;
  /** Coordinators: where the unit ranked in points (1 best). */
  rank?: number;
  /** Playoff games won; -1 when the team missed the playoffs. */
  playoffs: number;
}

/**
 * A coach or executive the game tracks: on an NFL staff, an NFL assistant,
 * at a college, or out of work. The hidden numbers are engine only.
 */
export interface Coach {
  id: string;
  name: string;
  birthYear: number;
  birthYearEstimated?: boolean;
  track: StaffTrack;
  side: "offense" | "defense" | null;
  scheme: OffenseScheme | DefenseScheme | null;
  background: string | null;
  /** The NFL staff job this person holds, if any. */
  team: string | null;
  role: StaffRole | null;
  /** Any other job: an NFL assistant job, a college job, or a front-office job under the GM. */
  job?: { kind: "assistant" | "college" | "front"; title: string; team: string; room?: CoachRoom; lead?: boolean };
  /** The position room this coach teaches, kept between jobs. */
  room?: CoachRoom;
  /** NFL teams the person played for, by today's team id. */
  playedFor?: string[];
  retired?: number;
  hiredYear: number;
  callsPlays: ("offense" | "defense")[];
  /** The last season the contract covers, and the salary per year. */
  contract?: { through: number; salary: number };
  /** The head coach or GM this person worked under longest: a coaching tree. */
  mentor?: string;
  agent?: string;
  generated?: boolean;
  /** Engine only. */
  hidden: StaffHidden;
  /** Engine only: how much the person still grows (or slips) each year. */
  growth: number;
  record: CoachSeason[];
  /** The season this person was last fired, if ever. */
  fired?: number;
  /** An interim head coach's regular job, to go back to. */
  interimFrom?: StaffRole;
}

/** What the owner learns in an interview: impressions, not numbers. */
export interface InterviewReport {
  date: string;
  /** Short impressions, good and bad. */
  notes: string[];
  /** The coordinators a head coach candidate would bring, or the staff a GM would keep. */
  plan: string[];
  /** How the candidate came across overall, 1 (poorly) to 5 (excellent). */
  impression: number;
  rounds: number;
}

export interface StaffOffer {
  team: string;
  role: StaffRole;
  id: string;
  years: number;
  salary: number;
  date: string;
}

/** A team looking to fill a job. */
export interface StaffSearch {
  team: string;
  role: StaffRole;
  opened: string;
  /** Who held the job last, and why it opened. */
  previous?: string;
  reason: "fired" | "left" | "retired" | "promoted" | "expired";
  /** Interviews held or scheduled, by candidate. */
  interviews: Record<string, { date: string; report?: InterviewReport; declined?: boolean }>;
  /** The pick, once agreed: official when the candidate's team is done playing. */
  agreed?: { id: string; date: string };
  /** Someone filling in until the job is filled. */
  interim?: string;
  /** The agreed contract. */
  terms?: { years: number; salary: number };
  /** The owner handed the search to the GM (or a search firm). */
  delegated?: boolean;
}

/** A head coach (or GM) asking the owner to approve a hire for his staff. */
/** A position coach's room: the players he teaches. ST is the assistant special teams coach. */
export type CoachRoom = "QB" | "RB" | "WR" | "TE" | "OL" | "DL" | "LB" | "DB" | "ST";

/** The head coach's pick for a position coach job, waiting on the owner. */
export interface RoomProposal {
  id: string;
  team: string;
  room: CoachRoom;
  candidate: string;
  date: string;
  reason: string;
  status: "open" | "approved" | "rejected" | "withdrawn";
  /** The lead coach the hire would replace. */
  replaces?: string;
}

export interface StaffProposal {
  id: string;
  team: string;
  role: StaffRole;
  candidate: string;
  by: string;
  date: string;
  reason: string;
  status: "open" | "approved" | "rejected" | "withdrawn";
  /** The coordinator the hire would replace. */
  replaces?: string;
}

export interface StaffState {
  people: Record<string, Coach>;
  schemes: Record<string, { offense: OffenseScheme; defense: DefenseScheme }>;
  /** How far along each team is in learning a new scheme, 0-1 (1 once it's second nature). */
  install: Record<string, { offense: number; defense: number }>;
  /** Fired staff still being paid, by the team that fired them. */
  owed: { id: string; team: string; salary: number; through: number }[];
  searches: StaffSearch[];
  offers: StaffOffer[];
  proposals: StaffProposal[];
  /** What each team was expected to win at kickoff (0-1), for judging the season. */
  expect: Record<string, number>;
  /** Hires, firings and retirements, newest first. */
  log: { date: string; team: string; text: string }[];
  /** The season each team's year ended, once its staff decisions are made. */
  ended?: Record<string, number>;
  /** Position coach hires waiting on the owner. */
  roomProposals?: RoomProposal[];
  /** The head coach each team's position rooms were last set under. */
  roomsBy?: Record<string, string>;
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

// ---- College football (see engine/college.ts, prospects.ts, scouting.ts) ----

export type CollegeConference = "SEC" | "B1G" | "B12" | "ACC" | "P12" | "AAC" | "MW" | "SBC" | "CUSA" | "MAC" | "IND";
export type CollegeOffense = "airRaid" | "spreadRpo" | "proStyle" | "spreadOption" | "flexbone";
export type CollegeDefense = "43" | "34" | "425" | "335" | "multiple";
export type Region = "West" | "Southwest" | "Midwest" | "Southeast" | "Northeast";

export interface CollegeTeam {
  id: string;
  school: string;
  nickname: string;
  conference: CollegeConference;
  coach: string;
  coachSince: number;
  city: string;
  state: string;
  lat: number;
  lon: number;
  region: Region;
  /** Engine only: how good the program is going into 2026. */
  strength: number;
  offense: CollegeOffense;
  defense: CollegeDefense;
}

export interface CollegeGame {
  id: string;
  /** Regular-season week (0-13), 14 for conference title games, 15 for Army-Navy, 16+ for the postseason. */
  week: number;
  date: string;
  away: string;
  home: string;
  conference: boolean;
  site?: string;
  city?: string;
  name?: string;
  kind?: "ccg" | "bowl" | "cfp1" | "cfpQF" | "cfpSF" | "cfpF";
  /** Playoff games: the seeds of the two teams. */
  seeds?: [number, number];
}

/** A poll or ranking release: the 25 teams in order. */
export interface CollegePoll {
  date: string;
  /** Week label, e.g. "Preseason", "Week 5", "Final". */
  label: string;
  ranks: string[];
}

/** How the owner points the college scouts for a week. */
export interface ScoutFilter {
  region?: Region;
  conference?: CollegeConference;
  school?: string;
  positions?: Position[];
  /** A college system: an offense or a defense label. */
  scheme?: CollegeOffense | CollegeDefense;
  /** Specific prospects; overrides the rest. */
  players?: string[];
}

export type ScoutDepth = "film" | "campus" | "deep";

export interface ScoutAssignment {
  id: string;
  filter: ScoutFilter;
  depth: ScoutDepth;
}

export interface ScoutWeek {
  date: string;
  cost: number;
  /** One line per assignment that ran. */
  lines: string[];
  /** Prospects we learned the most about this week. */
  learned: string[];
}

export interface ScoutingState {
  /** Total college scouting budget from camp to the draft. */
  budget: number;
  spent: number;
  plan: ScoutAssignment[];
  /** How well our scouts know each prospect, 0-100. */
  know: Record<string, number>;
  weeks: ScoutWeek[];
  /** Other teams' knowledge, by team, in prospect order (engine only). */
  cpu: Record<string, number[]>;
}

export interface CollegeInjury {
  type: string;
  date: string;
  returnDate: string;
  seasonEnding: boolean;
}

export interface CollegeAward {
  semifinalists?: string[];
  finalists?: string[];
  winner?: string;
}

export interface CollegeState {
  season: number;
  /** Final scores by game id: [away, home, overtime 0/1]. */
  results: Record<string, [number, number, number]>;
  /** Games made during the season: title games, bowls and the playoff. */
  post: CollegeGame[];
  /** Playoff field, seeds 1-12. */
  cfpField?: string[];
  ap: CollegePoll[];
  cfp: CollegePoll[];
  /** Public perception of each team, the basis for the polls (rating points). */
  rating: Record<string, number>;
  /** Prospect game logs: player, then game id, packed in the position's stat order. */
  logs: Record<string, Record<string, number[]>>;
  injuries: Record<string, CollegeInjury>;
  /** Media buzz around each prospect (public), drives the big boards and watch lists. */
  hype: Record<string, number>;
  awards: Record<string, CollegeAward>;
  champion?: string;
  scouting: ScoutingState;
}

// ---- Saved game ----

/**
 * camp: on the offseason (90-man) roster. active: on the 53. ps: practice squad. ir: injured reserve.
 * future: signed to a reserve/future deal that starts next league year. fa: free agent (or on waivers).
 * retired: done playing.
 */
export type RosterStatus = "camp" | "active" | "ps" | "ir" | "future" | "fa" | "retired";

export interface Injury {
  type: string;
  /** Day the injury happened. */
  date: string;
  /** First day the player is expected to be able to play again. */
  returnDate: string;
  seasonEnding: boolean;
  /** Hurt away from football (working out on his own): reserve/non-football injury if it lingers into the season. */
  nonFootball?: boolean;
  /** The first estimate of the return date, shown until the follow-up tests come back (medical.ts). */
  est?: string;
  /** The day further tests firm up the timeline. */
  testsOn?: string;
  /** A long rehab's midpoint, where it can hit a setback or run ahead of schedule. */
  mid?: string;
  /** The owner already asked the doctors about an early return. */
  asked?: boolean;
}

export interface PlayerState {
  team: string | null;
  status: RosterStatus;
  injury?: Injury;
  /** Development: change to true ability since the save began (in-season growth and offseason progression or decline). */
  dev?: number;
  /** Change to the player's ceiling since the save began (engine only). */
  pot?: number;
  /** Credited seasons before the current season, once the save has moved past 2026 (else the data's count). */
  exp?: number;
  /** Date placed on injured reserve (eligible to return after four games). */
  irDate?: string;
  /** On reserve/physically unable to perform or reserve/non-football injury rather than IR (returns don't use a designation). */
  reserve?: "pup" | "nfi";
  /** Designated to return: the day his 21-day practice window opened. */
  irWindow?: string;
  /** The window closed without an activation: he stays on reserve for the season. */
  irDone?: boolean;
  /** Back from an injury and not yet himself: plays below his level until `until`, fading (engine only). */
  rust?: { until: string; days: number; amount: number };
  /** 0-100, how the player feels about the team; absent means content (70). Never shown as a number. */
  morale?: number;
  /** The team that last held the player's rights, for a free agent. */
  lastTeam?: string;
  /** Staying away from camp, or showing up and not practicing, until a new deal is done. */
  holdout?: { kind: "holdout" | "holdin"; since: string };
  /** An ask to redo his contract with years still left (see engine/redo.ts). */
  redo?: RedoAsk;
  /** Practice squad: times elevated to the game-day roster this season (three is the limit). */
  elevations?: number;
  /** Practice squad: the game day the player is elevated for. */
  elevatedFor?: string;
  /** Signed off another team's practice squad: has to stay on the 53 until this date. */
  keepUntil?: string;
  /** Suspended by the league: regular-season games still to sit out, without pay and off the 53. */
  suspended?: { games: number; reason: string };
  /** Moved to another position by the coaches: plays there until moved back (training.ts). */
  pos?: Position;
  /** Learning a new position: `drag` (engine only) fades as he learns it; `fit` is how well he suits it for good. */
  retrain?: { from: Position; since: string; drag: number; fit: number };
  /** Cleared early from an injury: more likely to get hurt again until this date. */
  fragile?: string;
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
  /** Playing-time, statistical and playoff incentives for this year (see engine/incentives.ts). */
  incentives?: Incentive[];
  /** Per-game roster bonus: paid for each game on the game-day roster (bonuses.ts). */
  perGame?: number;
  /** Games the cap counts as likely this year (last year's games). */
  perGameLikely?: number;
  /** Games actually earned, once the season is settled. */
  perGameSettled?: number;
  /** Workout bonus for taking part in the offseason program, and whether he earned it. */
  workout?: number;
  workoutEarned?: boolean;
  /** Escalator: next year's salary rises by the amount if he plays the share of snaps this year (bonuses.ts). */
  escalator?: { amount: number; share: number; met?: boolean };
}

export type IncentiveKind =
  | "snaps" | "passYds" | "passTd" | "rushYds" | "rushTd" | "rec" | "recYds" | "recTd" | "sacks" | "tackles" | "defInt" | "playoffs";

export interface Incentive {
  kind: IncentiveKind;
  /** The number to reach; a snap share for playing time and playoff incentives. */
  threshold: number;
  amount: number;
  /** Likely to be earned (he reached it last season): counts on this year's cap. */
  likely: boolean;
  /** Set once the season is over. */
  earned?: boolean;
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
  /** The league year the deal was last restructured. */
  restructured?: number;
  /** Rookie deals, rounds 3-7: qualifying seasons toward the proven performance escalator (bonuses.ts). */
  ppe?: { seasons: number; counted?: number; done?: boolean };
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

/**
 * One snap or kick in a game's play-by-play:
 * [quarter (5+ is overtime), seconds left, offense (0 away, 1 home), down (0 for a kick), distance,
 *  yards from the offense's own goal line, drive number, description, flags (PLAY_FLAGS), away score, home score, formation and look,
 *  EPA for the offense (scrimmage plays), the home team's win probability after the play].
 */
export type PlayRow = [number, number, 0 | 1, number, number, number, number, string, number, number, number, string, number?, number?];

/** One drive: [offense (0 away, 1 home), quarter, clock, start yard line, plays, yards, seconds of possession, how it ended]. */
export type DriveRow = [0 | 1, number, number, number, number, number, number, string];

export interface GameLog {
  date: string;
  plays: PlayRow[];
  drives: DriveRow[];
}

/** A call the officials got wrong, or one a team disputed. Whether it was wrong is known only to the league office. */
export interface DisputedCall {
  q: number;
  clock: number;
  /** The team the call went against. */
  team: string;
  text: string;
  /** Hidden: the league's later finding. */
  wrong: boolean;
}

export interface GameOpsCheck {
  gameId: string;
  date: string;
  /** Each area of the game-day check: area, "ready" / "minor" / "problem", and the staff's note. */
  areas: [string, "ready" | "minor" | "problem", string][];
  incidents: string[];
  cost: number;
}

export interface OfficiatingInquiry {
  gameId: string;
  call: number;
  asked: string;
  answer?: string;
  answered?: string;
}

export interface GameOpsState {
  checks: GameOpsCheck[];
  inquiries: OfficiatingInquiry[];
}

export interface BoxScore {
  quarters: { away: number[]; home: number[] };
  team: { away: TeamBox; home: TeamBox };
  /** Per-player stat lines, packed in STAT_KEYS order (see engine/stats.ts). */
  players: { away: Record<string, number[]>; home: Record<string, number[]> };
  scoring: ScoringPlay[];
  inactives: { away: string[]; home: string[] };
  injuries: { player: string; team: string; type: string }[];
  /** Play value by team (offense) and by player, from the play-by-play (engine/analytics.ts). */
  adv?: { away: Adv; home: Adv };
  /** Per-player [plays, EPA, successes], keyed "q:" passer, "r:" rusher, "t:" target, then the player id. */
  pe?: Record<string, [number, number, number]>;
  /** Calls disputed or missed during the game (engine/officials.ts). */
  calls?: DisputedCall[];
  /** Conditions at an open-air game (see engine/gameday.ts). */
  weather?: { indoor: boolean; temp: number; wind: number; precip: "none" | "rain" | "snow" };
}

export type InboxKind = "staff" | "league" | "game" | "media" | "transaction" | "system" | "business";

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
  /** How urgent: 3 needs a decision soon, 2 is worth reading today, 1 or absent is routine. */
  priority?: number;
}

export interface Settings {
  /** "real": the cap is enforced like the NFL does. "off": no cap at all. */
  capRules: "real" | "off";
  /** "real": the team can run short of cash and the owner has to cover it. "relaxed": the owner's pockets are bottomless. */
  finances?: "real" | "relaxed";
  /** How sharp the owner's scouting and staff reads are. The truth is never shown; "foggy" widens every read, "sharp" narrows it. */
  scouting?: "sharp" | "real" | "foggy";
  /** One continuing save: no manual slots or loading an earlier save from inside the game. */
  ironman?: boolean;
  /** Multi-day sims stop when something lands on the owner's desk: never, or when an urgent decision arrives. */
  pause?: "never" | "urgent";
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
  /** Most per year in incentives offered on top (the owner's offers); left out, the front office decides. */
  incentives?: number;
  /** Share of each year's salary paid as per-game roster bonuses (0 to 0.25); left out, the front office decides. */
  perGame?: number;
  /** Workout bonus each year; left out, the front office decides. */
  workout?: number;
  /** Raise to the next year's salary when he plays 65% of the snaps, each year but the last. */
  escalator?: number;
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
  /** The agent's read of the share of games his client might miss, which prices per-game money (bonuses.ts). */
  missRisk?: number;
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
  /** Visits to teams' facilities, scheduled or done. */
  visits?: { team: string; date: string; done?: boolean }[];
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
  kind: "signed" | "released" | "waived" | "claimed" | "ps" | "promoted" | "poached" | "future" | "elevated" | "ir" | "traded" | "drafted" | "retired";
  text: string;
}

/** Something a team can put in a trade: a player under contract, or a draft pick (by pick id, see engine/trades.ts). */
export type TradeAsset = { kind: "player"; id: string } | { kind: "pick"; pick: string; cond?: PickCondition };

/** A condition on a traded pick (see engine/conditions.ts). */
export interface PickCondition {
  kind: "snaps" | "passYds" | "rushYds" | "recYds" | "sacks" | "playoffs" | "extend" | "protect";
  /** The player it turns on, for playing time, stats and extensions. */
  player?: string;
  /** Share of snaps, a stat total, or (for protection) the top-N slots protected. */
  threshold: number;
}

/** A conditional pick still to be settled, or settled. */
export interface ConditionalPick {
  pick: string;
  from: string;
  to: string;
  cond: PickCondition;
  /** The season the condition turns on. */
  season: number;
  traded: string;
  status: "open" | "met" | "missed";
  settled?: string;
  note?: string;
}

/** A trade between two teams: what each one sends. */
export interface TradeDeal {
  teams: [string, string];
  /** Assets sent by teams[0] and by teams[1]. */
  send: [TradeAsset[], TradeAsset[]];
}

/** A completed (or agreed) trade, for the league's trade log. */
export interface TradeRecord extends TradeDeal {
  id: string;
  date: string;
  /** Agreed after the season; it becomes official when the new league year opens. */
  status: "done" | "agreed" | "voided";
  /** Every first-round pick and star in it makes the headlines. */
  blockbuster?: boolean;
  /** What the press says about each side, by team. */
  grades?: Record<string, { outlet: string; grade: string; take: string }[]>;
  /** True value each team got minus what it gave at the time, kept for grading later (engine only). */
  edge?: Record<string, number>;
}

/** A trade a CPU team put to the owner, open until it expires. */
export interface TradeOffer extends TradeDeal {
  id: string;
  date: string;
  expires: string;
  /** teams[0] is the CPU team that called, teams[1] is the owner's team. */
  note: string;
  status: "open" | "accepted" | "declined" | "expired" | "withdrawn";
}

export interface TradeState {
  /** Draft pick ownership where it differs from the original team, by pick id. */
  picks: Record<string, string>;
  log: TradeRecord[];
  offers: TradeOffer[];
  /** Our players we've told other teams are available. */
  block: string[];
  /** Players who have asked their team for a trade, with the date. */
  requests: Record<string, string>;
  /** How each CPU front office feels about our calls: lowballs wear on them. */
  talks: Record<string, { strikes: number; coolingUntil?: string }>;
  /** A matched offer sheet: the player can't be traded to the team that made it until the date. */
  noTradeTo?: Record<string, { team: string; until: string }>;
  /** Picks traded with conditions, open and settled. */
  conditional?: ConditionalPick[];
}

// ---- The draft (see engine/draft.ts) ----

/** One selection in the draft. */
export interface DraftSelection {
  /** Pick id (see engine/trades.ts). */
  pick: string;
  overall: number;
  team: string;
  player: string;
  /** Who made it: the owner, our GM on the owner's behalf, or a CPU front office. */
  by: "owner" | "gm" | "cpu";
  /** Our GM's letter grade, given when the day ends, and a line on it. */
  grade?: string;
  note?: string;
  /** Engine only: the team's need at the position when it picked (for the grade). */
  need?: number;
}

/** A media mock draft: the projected pick for each slot. */
export interface MockDraft {
  date: string;
  outlet: string;
  analyst: string;
  /** "Mock draft 3.0" counts by outlet. */
  version: number;
  rounds: number;
  /** Pick ids in projected order, the team projected to hold each, and the prospect. */
  slots: string[];
  teams: string[];
  players: string[];
}

/** Public results from the scouting combine. */
export interface CombineResult {
  heightIn: number;
  weightLb: number;
  /** Absent when the player didn't run (or do the drill). */
  forty?: number;
  vertical?: number;
  bench?: number;
}

/** Who goes to a pro day: an area scout, the scouting director, or the GM and head coach. */
export type ProDayCrew = "scout" | "director" | "brass";

/** Our pre-draft work beyond scouting: combine interviews, top-30 visits and private workouts. */
export interface PreDraft {
  /** Prospects on our combine interview list (45 at most). */
  interviews: string[];
  /** The notes from each interview. */
  interviewed: Record<string, string[]>;
  visits: Record<string, { date: string; notes: string[] }>;
  workouts: Record<string, { date: string; by: string; notes: string[] }>;
  /** The combine interviews have been held. */
  ran?: boolean;
}

export interface DraftState {
  /** Every pick in the draft in order (pick ids), once the order is set after the Super Bowl. */
  order?: string[];
  /** Compensatory picks, once the league announces them: pick id, the free agent lost and where he went. */
  comp?: { pick: string; player: string; to: string }[];
  made: DraftSelection[];
  mocks: MockDraft[];
  nextMock?: string;
  /** Underclassmen who decided to go back to school. */
  returned?: string[];
  /** Underclassmen who declared (set at the deadline). */
  declared?: boolean;
  combine?: Record<string, CombineResult>;
  /** Pro day workouts: prospects the combine didn't invite, and invitees making up drills they skipped. */
  proDay?: Record<string, CombineResult & { date: string }>;
  pre?: PreDraft;
  /** Who we're sending to each school's pro day. */
  proDayCrews?: Record<string, ProDayCrew>;
  /** Undrafted free agents: prospect id to team. */
  udfa?: Record<string, string>;
  /** Overall pick the draft-day calls to the owner were made for. */
  callsFor?: number;
  /** Draft days finished (1-3). */
  daysDone: number[];
  /** From this round on, the GM makes our picks without waiting for the owner. */
  gmFrom?: number;
}

// ---- Media (see engine/outlets.ts, media.ts, press.ts) ----

export type StoryKind =
  | "recap" | "injury" | "signing" | "release" | "trade" | "rumor" | "leak" | "interview" | "trend"
  | "rankings" | "preview" | "college" | "draft" | "owner" | "league";

/** A piece of coverage from one of the made-up outlets. */
export interface Story {
  id: string;
  date: string;
  /** Outlet id (see engine/outlets.ts). */
  outlet: string;
  by: string;
  kind: StoryKind;
  headline: string;
  body: string;
  /** NFL teams, players and college prospects it's about. */
  teams?: string[];
  players?: string[];
  prospects?: string[];
  gameId?: string;
  college?: boolean;
}

/** One answer the owner can give. Its effects are worked out by the engine and never shown. */
export interface PressOption {
  key: string;
  text: string;
}

export interface PressQuestion {
  id: string;
  date: string;
  /** Last day to answer; after that the team "declined to comment". */
  expires: string;
  outlet: string;
  by: string;
  topic: string;
  /** The development the question is about, in a line. */
  context: string;
  question: string;
  options: PressOption[];
  player?: string;
  team?: string;
  prospect?: string;
  /** What the owner said: an option index, or -1 for no answer in time. */
  answer?: number;
  answeredOn?: string;
}

/** Something the owner said in public that can come back later. */
export interface Stance {
  kind: "untouchable" | "playoffs" | "willPay" | "noSell";
  date: string;
  player?: string;
  resolved?: boolean;
}

/** A consequence of something the owner said that surfaces on a later day. */
export interface Echo {
  date: string;
  kind: string;
  question: string;
  player?: string;
  amount?: number;
}

export interface MediaState {
  stories: Story[];
  questions: PressQuestion[];
  /** Engine only: each outlet's attitude toward the owner, -50 to 50. */
  rel: Record<string, number>;
  /** Engine only: the head coach's faith in the owner, 0-100. */
  coach: number;
  stances: Stance[];
  echoes: Echo[];
  /** Owner fines from the league office. */
  fines: { date: string; amount: number; reason: string }[];
  /** Engine only: how much the owner's words have helped a player's agent, as a share of the price. */
  leverage: Record<string, number>;
  /** Last power rankings, best first, for the movement. */
  ranks?: string[];
  /** Prospect buzz at the last stock report. */
  hypeSnap?: Record<string, number>;
  /** Topics already asked about, so the same development isn't asked twice. */
  asked: Record<string, string>;
}

export interface TeamFinance {
  /** Cash paid to players, by league year. */
  paid: Record<number, number>;
}

export type Dept = "marketing" | "gameday" | "community" | "medical" | "facilities" | "scouts";
export type ConcessionTier = "value" | "standard" | "premium";

/** Where a ledger line goes on the profit and loss statement. */
export type LedgerCat =
  | "national" | "tickets" | "premium" | "concessions" | "parking" | "merch" | "sponsorship" | "localMedia" | "naming" | "events"
  | "gatePool" | "gateShare" | "intl" | "deposits" | "capital"
  | "players" | "staff" | "staffOwed" | "businessOps" | "marketing" | "gameday" | "community" | "medical" | "facilities" | "scouts" | "scouting"
  | "stadium" | "projects" | "rent" | "debt" | "travel" | "benefits" | "league" | "fines" | "interest" | "distribution"
  | "hosting" | "bids" | "loanIn" | "principal" | "loanFees" | "professional" | "seatLicenses" | "research";

export interface LedgerEntry {
  date: string;
  /** League year the money belongs to. */
  year: number;
  cat: LedgerCat;
  /** Positive is money in. */
  amount: number;
  note?: string;
}

/** One of our home games at the gate. */
export interface GateRecord {
  game: string;
  date: string;
  opp: string;
  type: "PRE" | "REG" | "POST";
  capacity: number;
  /** Tickets sold: season tickets, single games and premium seats. */
  sold: number;
  seasonHolders: number;
  singleSeats: number;
  singleSold: number;
  /** Average single-game price. */
  price: number;
  /** Single-game demand at that price over the seats we had: above 1 means the resale market is hot. */
  heat: number;
  revenue: number;
  /** Batch I: the turnstile and the resale market, the game's price tier and premium seats in use. */
  attendance?: number;
  noShows?: number;
  comps?: number;
  resale?: { listed: number; sold: number; price: number };
  groups?: number;
  promo?: number;
  tier?: GameTier;
  dynamic?: number;
  premiumUse?: number;
  zones?: { sold: number; seats: number; price: number }[];
}

export type GameTier = "marquee" | "standard" | "value";
export type FanSegment = "casual" | "subscribers" | "families" | "corporate" | "premium";
export type SurveyItem = "parking" | "lines" | "concessions" | "cleanliness" | "service" | "value";

/** One home game's post-game survey, 1-10 a question. */
export interface Survey {
  game: string;
  date: string;
  scores: Record<SurveyItem, number>;
  overall: number;
}

/** The fan base: the market, who buys, how they feel about the club. */
export interface FanState {
  /** League-wide economy, 1 is normal. */
  economy: number;
  /** This year's pull of everything else to do in our market, 1 is normal. */
  competition: number;
  /** Confidence in the club's leadership, fairness and service, 0-100, and the part of the damage that lasts. */
  trust: number;
  scar: number;
  /** Generational loyalty, built over decades of winning and losing, and where it started. */
  core: number;
  core0: number;
  sat: Record<FanSegment, number>;
  /** Followers by where they live, and the national number when the owner took over. */
  reach: { local: number; region: number; national: number; intl: number };
  national0: number;
  surveys: Survey[];
  /** Customer records: complaints, upgrades and contacts this season. */
  crm: { season: number; complaints: number; upgrades: number; contacts: number; newSubs: number; newBuyers: number };
  /** Seasons already rolled into core loyalty. */
  seasons: number[];
  log: { date: string; text: string }[];
}

export type Zone = "lowerSide" | "lowerEnd" | "upperSide" | "upperEnd";
export type Promo = "none" | "family" | "young";

export interface TicketingState {
  /** Owner's price for each zone against the default spread. */
  zones: Record<Zone, number>;
  /** Variable pricing by game: the multiplier for each tier (all 1 means one price for every game). */
  tiers: Record<GameTier, number>;
  dynamic: boolean;
  groups: boolean;
  promo: Promo;
  /** Resale: "open" lets fans use any site; "official" routes transfers through the team's exchange. */
  transfers: "open" | "official";
  /** Unused suites sold as corporate hospitality packages. */
  hospitality: boolean;
  waitlist: number;
  /** Season-ticket holders by how long they've held them. */
  tenure: { long: number; mid: number; recent: number };
  psl?: { season: number; price: number; holders: number; revenue: number };
  /** Share of suites and club seats under lease, 1 is the 2026 book. */
  premiumBook: number;
  research?: { season: number; date: string };
  /** Renewal history by segment. */
  renewals: { season: number; long: number; mid: number; recent: number; premium: number; waitlist: number; added: number }[];
  /** Spending on finding new ticket buyers this season and how many came in. */
  acquisition: { season: number; spend: number; added: number }[];
}

export type EventKind = "concert" | "college" | "soccer" | "motorsports" | "hockey" | "combat" | "highschool" | "private" | "bowl" | "tenant";

export interface StadiumEvent {
  id: string;
  date: string;
  kind: EventKind;
  name: string;
  /** Who brought it in: an offer to us, the landlord or co-owner, or the stadium's standing calendar. */
  by: "offer" | "landlord" | "partner" | "fixed" | "tenant";
  status: "offered" | "booked" | "declined" | "expired" | "refused" | "held";
  /** The promoter's estimate of the stadium's net, before our share. */
  low: number;
  high: number;
  /** Last day to answer an offer. */
  expires?: string;
  promoter?: string;
  /** What came of it: the stadium's net and our share. */
  net?: number;
  ours?: number;
  note?: string;
}

/** A lease offer from the public side: the length, the yearly rent and upkeep, and public money for renovations. */
export interface LeaseOffer {
  years: number;
  rent: number;
  upkeep: number;
  publicMoney: number;
  eventShare: number;
}

export interface LeaseState {
  /** Last season the lease covers. */
  through: number;
  rent: number;
  upkeep: number;
  eventShare: number;
  /** Public renovation money from the lease, not yet spent. */
  fund: number;
  /** Playing year to year after the lease ran out. */
  holdover?: boolean;
  signed?: string;
  talks?: { opened: string; round: number; offer: LeaseOffer; patience: number; waiting?: { ask: "money" | "rent"; date: string } };
  log: { date: string; text: string }[];
}

export interface BusinessState {
  /** Cash in the bank when the owner took over. */
  opening: number;
  ledger: LedgerEntry[];
  /** Single-game ticket price and game-day pricing, as multiples of the market price. */
  prices: { single: number; concessions: ConcessionTier; parking: number };
  /** Season-ticket and premium price changes for next season, set in the offseason. */
  next?: { season: number; premium: number; announced?: string };
  /** Season-ticket holders this season, and next season's renewals once they're in. */
  holders: number;
  renewal?: { rate: number; holders: number; date: string };
  budget: Record<Dept, number>;
  gates: GateRecord[];
  events: StadiumEvent[];
  /** The league's visiting-team gate pool, not yet paid out. */
  pool: number;
  /** Months whose monthly items are posted, "2026-08". */
  months: string[];
  /** What the ledger has already picked up from other systems. */
  seen: { paid: Record<number, number>; scouting: number; fines: number };
  sellouts: number;
  /** Something the press will ask the owner about. */
  ask?: { kind: "tickets" | "attendance"; date: string; context: string };
  /** The owner's price changes, newest first. */
  priceLog: { date: string; text: string }[];
  /** Season-ticket and premium prices against the 2026 market prices, as the years' increases add up. */
  index?: { season: number; premium: number };
  /** Named local sponsors and radio/TV partners, and the offers on the table in the renewal window. */
  local?: LocalDeals;
  /** Stadium and facility projects, built or under way. */
  projects?: Project[];
  /** Season-ticket deposits collected for a season not yet played: they count toward the tickets as the home games are played. */
  deferred?: { season: number; amount: number; applied: number };
  /** Price zones, variable and dynamic pricing, resale, seat licenses and the waiting list (ticketing.ts). */
  tix?: TicketingState;
}

/** A local partner's deal: the value is the first year's fee, and it rises 3% a year. */
export interface LocalDeal {
  cat: string;
  partner: string;
  /** First league year of the deal. */
  start: number;
  years: number;
  value: number;
  /** Batch I: exclusive in its category, the partner's relationship with the club (0-100), its yearly chance of failing to pay, a scandal, and how much it delivered. */
  exclusive?: boolean;
  rel?: number;
  risk?: number;
  scandal?: string;
  delivered?: Record<number, number>;
  /** Fees owed and not yet paid. */
  overdue?: number;
  ended?: string;
}

export interface LocalOffer {
  id: string;
  cat: string;
  partner: string;
  years: number;
  value: number;
  incumbent?: boolean;
  exclusive?: boolean;
}

export interface LocalDeals {
  deals: LocalDeal[];
  offers: LocalOffer[];
  /** The league year whose expiring deals are being shopped, and when the window closes. */
  window?: { year: number; closes: string };
  /** Categories the owner chose to leave empty for a year. */
  vacant: string[];
  /** Expiring deals each year: how many and how much the incumbents kept. */
  retention?: { year: number; up: number; renewed: number; before: number; after: number }[];
}

export interface Project {
  id: string;
  started: string;
  opens: string;
  /** Our share of the cost, and what's been paid. */
  cost: number;
  paid: number;
  opened?: boolean;
}

/** One question the media keeps asking about our team this season. */
export interface Storyline {
  id: string;
  kind: string;
  season: number;
  outlet: string;
  title: string;
  player?: string;
  status: "open" | "answered" | "unanswered";
  /** What the coverage said when it was settled. */
  verdict?: string;
}

/** How the offseason went, and what fans expect from the season ahead. */
export interface ReviewState {
  /** The season being looked ahead to. */
  season: number;
  /** How every team looked to the league the day after the Super Bowl (engine only), and our starters then. */
  before?: { date: string; wp: Record<string, number>; pos: Record<string, number>; hc?: string; qb?: string };
  /** Each team's average draft-day grade, in grade points. */
  draft?: Record<string, number>;
  /** Our picks in that draft: player and overall pick. */
  picks?: [string, number][];
  /** Offseason grades by outlet, then team. */
  grades?: Record<string, Record<string, string>>;
  /** Our GM's grade of the offseason the front office just ran. */
  gm?: string;
  expect?: { wins: number; date: string };
  storylines: Storyline[];
  /** Last season's storylines, once settled. */
  past?: Storyline[];
  settled?: boolean;
}

/** A free agent who left in the spring, for the compensatory pick formula. */
export interface CompMove {
  player: string;
  from: string;
  to: string;
  apy: number;
}

export interface LeagueState {
  caps: Record<number, number>;
  rollover?: Record<string, Record<number, number>>;
  /** Unrestricted free agents heading to the market this spring, with the team they'd leave (until they sign). */
  expiring?: Record<string, string>;
  /** The draft their departures count for. */
  cfaYear?: number;
  /** Players who will announce their retirement this offseason, with the day (engine only). */
  retiring?: Record<string, string>;
  /** Departures that count toward compensatory picks, by draft year. */
  cfa?: Record<number, CompMove[]>;
  /** Post-June 1 releases: the cap hit held on the books until June 2. */
  june1?: June1Release[];
  /** Teams the press has linked to upcoming free agents before the market opens. */
  linked?: Record<string, string[]>;
  /** Pay cuts asked for this year, with the player's answer. */
  payCuts?: Record<string, PayCutAsk>;
  /** Incentive settlements by team and the league year they adjust: credits less charges. */
  incentiveAdj?: Record<string, Record<number, number>>;
}

export interface June1Release {
  team: string;
  player: string;
  year: number;
  /** Cap charge held until June 2, then taken off. */
  held: number;
  /** Dead money this year and next once the split takes effect. */
  dead: number;
  deadNext: number;
  done?: boolean;
}

export interface PayCutAsk {
  team: string;
  year: number;
  date: string;
  /** What we asked for, as this year's base salary. */
  asked: number;
  /** The base salary the player would take instead, if any. */
  counter?: number;
  answer: "accepted" | "countered" | "refused";
}

/** One finished season, as the record books keep it. */
export interface SeasonRecord {
  season: number;
  champion?: string;
  runnerUp?: string;
  /** Regular-season record by team: wins, losses, ties, points for and against. */
  records: Record<string, [number, number, number, number, number]>;
  /** Finish within the division, 1-4. */
  place: Record<string, number>;
  seeds?: Record<"AFC" | "NFC", string[]>;
  /** How far each playoff team went: WC, DIV, CONF, SB (lost the Super Bowl) or CHAMP. */
  playoffs: Record<string, string>;
  /** League leaders: stat key to [player, team, value]. */
  leaders: Record<string, [string, string, number]>;
}

/** One draft, kept so its players can be rebuilt when a save loads. */
export interface DraftArchive {
  year: number;
  /** player, team, round, overall pick, height and weight from the combine. */
  picks: [string, string, number, number, number, number][];
  udfa: [string, string][];
  /** Underclassmen who went back to school (they join the next class). */
  returned: string[];
  /** The pick id of each selection, in the same order (drafts archived since the history batch), for trade outcomes. */
  pickIds?: string[];
}

export interface History {
  seasons: SeasonRecord[];
  drafts: DraftArchive[];
  /** Regular-season stats from the seasons played in this save, by player. */
  stats: Record<string, SeasonStats[]>;
  snaps: Record<string, Record<string, SnapSeason>>;
  /** Players who retired, with the season they last played. */
  retired: Record<string, number>;
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
  league?: LeagueState;
  /** The season the league is in (2026 when absent): it moves forward the day after each draft. */
  season?: number;
  /** This season's schedule, for seasons after 2026 (2026 is the real one from the data). */
  schedule?: ScheduledGame[];
  /** Waiver priority until the standings take over: the last draft's order. */
  waiverOrder?: string[];
  /** Super Bowl and draft hosting: awards made in this save and our open bids. */
  hosting?: HostingState;
  /** Return designations from injured reserve used this season, by team (eight allowed). */
  irReturns?: Record<string, number>;
  /** Players on a 53 or injured reserve when the regular season ended: they earn a credited season. */
  credited?: string[];
  /** Seasons gone by: final standings, champions, drafts, and every player's stats. */
  history?: History;
  /** Pro Bowls, All-Pro teams, awards and the Hall of Fame (honors.ts). */
  honors?: HonorsState;
  /** League records, rivalries, anniversaries and yearly valuations (records.ts). */
  records?: RecordsState;
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
  /** Trades, draft pick ownership, offers to the owner and the trade block. */
  trades?: TradeState;
  /** Fan and media mood toward the owner's team, 0-100 (50 neutral). */
  pressure: { fans: number; media: number };
  /** Teams filled into postseason slots as the bracket is decided. */
  playoffTeams: Record<string, { away: string; home: string }>;
  /** Seeds 1-7 per conference, set the day after the regular season ends. */
  seeds?: Record<"AFC" | "NFC", string[]>;
  champion?: string;
  /** The owner's edited cutdown plan: the full list of players to keep on the 53. */
  cutPlan?: string[];
  /** Today's events the owner has already handled, by agenda id, with what came of each. */
  day?: { date: string; done: Record<string, string> };
  /** The college football season and our draft scouting. */
  college?: CollegeState;
  /** The 2027 draft: order, compensatory picks, mock drafts and the selections. */
  draft?: DraftState;
  /** Media coverage, press questions and how the press feels about the owner. */
  media?: MediaState;
  /** Everyone who coaches or runs a front office, and the hiring carousel. */
  staff?: StaffState;
  /** The business side: the team's books, ticket prices, the stadium calendar and budgets. */
  business?: BusinessState;
  /** The fan base and the market (fans.ts). */
  fans?: FanState;
  /** Stadium leases with the city or stadium authority, by team (publicly owned buildings only). */
  leases?: Record<string, LeaseState>;
  /** This season's offseason program, training camp and discipline (spring.ts, camp.ts, discipline.ts). */
  program?: ProgramState;
  /** The other owners, the league meeting and the rule changes adopted (owners.ts, rules.ts). */
  owners?: OwnersState;
  /** Offseason grades, fan expectations and the season's storylines. */
  review?: ReviewState;
  /** The club's accounting: approved budgets, closed years and the reserve policy (books.ts). */
  books?: BooksState;
  /** The club's borrowing: the credit facility, term loans, offers and market rates (debt.ts). */
  debt?: DebtState;
  /** Who the owner is: wealth, style, goals and the scorecard of each season (ownership.ts). */
  owner?: OwnerState;
  /** The business executives, their searches and the reporting chart (executives.ts). */
  execs?: ExecState;
  /** Who decides what: decision rights, limits, alerts and the record of decisions (delegation.ts). */
  office?: OfficeState;
  culture?: CultureState;
  /** Play-by-play and drive charts by game id, kept through the week after each game (playlog.ts). */
  pbp?: Record<string, GameLog>;
  /** The analytics department, game plans and league strategy trends (strategy.ts). */
  analytics?: AnalyticsState;
  /** The locker room, player development programs, the medical side and injury insurance (clubhouse.ts). */
  clubhouse?: ClubhouseState;
  /** Practice reports for each team's next game (gameweek.ts). */
  gameWeek?: GameWeekState;
  /** Our college scouts and the department's emphasis (scouts.ts). */
  scouts?: ScoutStaffState;
  /** Game-day operations checks at the owner's home games, and officiating questions put to the league (gameops.ts). */
  gameOps?: GameOpsState;
  inbox: InboxItem[];
  /** Short league news feed, newest first. */
  news: { date: string; text: string }[];
}

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

export type IncidentKind = "ped" | "substance" | "comments" | "conduct" | "minicamp";

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

export interface AdoptedRule {
  rule: string;
  /** The first season it's in force. */
  year: number;
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

// ---- Club books, borrowing and the owner (books.ts, debt.ts, ownership.ts) ----

/** A league year once it is over: what was planned and what happened. */
export interface YearClose {
  year: number;
  revenue: number;
  /** Operating income before depreciation, interest and owner taxes (cash basis by category). */
  operating: number;
  depreciation: number;
  interest: number;
  /** Net income on the accrual basis. */
  net: number;
  cashEnd: number;
  debtEnd: number;
  /** What the budget approved at the start of the year expected. */
  planRevenue: number;
  planOperating: number;
  /** The outside auditors' opinion. */
  audit: "clean" | "qualified";
}

export interface BooksState {
  /** The league year the books are open for. */
  year: number;
  /** Approved budgets by league year: each ledger category's planned amount (signed like the ledger). */
  plan: Record<number, Partial<Record<LedgerCat, number>>>;
  closed: YearClose[];
  /** Months of operating costs and debt service the club keeps on hand before paying the owner anything. */
  reserveMonths: number;
}

export type LoanKind = "fixed" | "floating";

export interface LoanTerms {
  lender: string;
  amount: number;
  years: number;
  kind: LoanKind;
  /** Fixed loans: the all-in rate. Floating loans: the margin over the market rate. */
  rate: number;
  /** Paid down monthly over the term, or all at the end. */
  amort: "amortizing" | "bullet";
  /** Arrangement fee, a share of the amount. */
  fee: number;
  /** Lowest allowed debt-service coverage (trailing operating income over debt service). */
  minCoverage: number;
  /** Most debt allowed against trailing operating income. */
  maxLeverage: number;
  security: string;
}

export interface LoanOffer extends LoanTerms {
  id: string;
  date: string;
  expires: string;
  purpose: "general" | "refinance" | "projects";
  /** The loan this offer would pay off. */
  refinances?: string;
  /** The owner already pushed this lender once. */
  pushed?: boolean;
}

export interface Loan extends LoanTerms {
  id: string;
  start: string;
  maturity: string;
  balance: number;
  /** Extra margin after a covenant waiver. */
  stepUp: number;
  /** Covenant tests failed in a row. */
  breaches: number;
  /** The lender demanded repayment by this date. */
  accelerated?: string;
  repaid?: string;
  purpose: string;
}

export interface CreditFacility {
  lender: string;
  limit: number;
  /** Margin over the market rate on what's drawn. */
  spread: number;
  /** Yearly fee on the unused part. */
  commitment: number;
  matures: string;
}

export interface DebtState {
  /** The market's base lending rate by month, "2026-08". */
  rates: Record<string, number>;
  facility: CreditFacility;
  loans: Loan[];
  offers: LoanOffer[];
  /** How lenders see the club and its owner, 0-100 (engine only; shown in words). */
  trust: number;
  /** Covenant tests: the date, the loan, the coverage and leverage seen, and whether it passed. */
  tests: { date: string; loan: string; coverage: number; leverage: number; ok: boolean }[];
  /** Lenders' warnings and actions, newest first. */
  log: { date: string; text: string }[];
}

export type OwnerGoal = "titles" | "profit" | "value" | "community" | "reputation" | "stability";
export type OwnerBackground = "finance" | "realEstate" | "industry" | "family" | "exPlayer";

export interface ScoreSeason {
  season: number;
  record: string;
  playoffs?: string;
  revenue: number;
  operating: number;
  value: number;
  equity: number;
  scores: Record<OwnerGoal, number>;
  overall: number;
  coachTarget?: { goal: string; met: boolean };
}

export interface OwnerState {
  background: OwnerBackground;
  /** The owner's money outside the team: cash on hand, other holdings and personal debt. */
  liquid: number;
  outside: number;
  personalDebt: number;
  style: "handsOff" | "collaborative" | "handsOn";
  spending: "aggressive" | "moderate" | "conservative";
  /** Seasons the owner gives a rebuild before expecting to contend. */
  patience: number;
  weights: Record<OwnerGoal, number>;
  /** What the owner paid for the team and when. */
  purchase: number;
  since: string;
  /** Capital put in and distributions taken since the purchase. */
  putIn: number;
  takenOut: number;
  /** Pass-through taxes the owner paid on the club's income, and losses carried forward. */
  taxesPaid: number;
  carryforward: number;
  coachTarget?: { season: number; goal: "playoffs" | "winning" | "develop" | "none"; set: string };
  legacy: ScoreSeason[];
  /** New priorities suggested by how things have gone, for the owner to take or leave. */
  suggestion?: { weights: Record<OwnerGoal, number>; why: string; date: string };
  log: { date: string; text: string }[];
}

// ---- Executives, delegation and decision memos (executives.ts, delegation.ts, memos.ts) ----

export type ExecRole = "PRES" | "FOPS" | "CFO" | "CRO" | "COO" | "GC" | "SOD" | "MKT" | "CTO";

/** A business or football-operations executive (made-up people). */
export interface Exec {
  id: string;
  name: string;
  born: number;
  background: "sports" | "finance" | "consulting" | "tech" | "media" | "law" | "hospitality";
  /** Earlier jobs, newest first, as a resume reads. */
  resume: string[];
  /** Years in senior jobs. */
  years: number;
  style: "cautious" | "steady" | "bold";
  role: ExecRole | null;
  /** The number two in a department, ready to step in. */
  deputyOf?: ExecRole;
  hired?: string;
  contract?: { through: number; salary: number; guaranteed: boolean };
  /** Engine only: ability, leadership and ambition, 0-100, and yearly growth. */
  hidden: { skill: number; leadership: number; ambition: number; growth: number };
  /** Engine only: how happy they are in the job, 0-100. */
  satisfaction: number;
  /** Season-by-season reviews, newest first. */
  reviews: { year: number; score: number; text: string }[];
}

export interface ExecSearch {
  role: ExecRole;
  opened: string;
  firm: string;
  pool: string[];
  /** What the owner learned in interviews, by candidate: the topics asked and the answers. */
  asked: Record<string, { topic: string; answer: string }[]>;
  /** The search firm's read on each candidate, 0-100. */
  read: Record<string, number>;
  /** Candidates who turned the job down. */
  declined: string[];
}

export interface ExecState {
  people: Record<string, Exec>;
  chart: Partial<Record<ExecRole, string>>;
  reportsTo: Record<ExecRole, ExecRole | "owner">;
  searches: ExecSearch[];
  /** Fired executives still being paid. */
  owed: { id: string; salary: number; through: number }[];
  /** How the job market sees the club as an employer, 0-100 (engine only; shown in words). */
  reputation: number;
  log: { date: string; text: string }[];
  /** Departures and their cost: fees and severance. */
  departures: { date: string; role: ExecRole; why: "fired" | "left" | "retired"; cost: number }[];
  reorgs: number;
}

export type DecisionArea = "signings" | "trades" | "coaching" | "pricing" | "events" | "sponsors" | "financing";
export type DecisionMode = "owner" | "approve" | "delegate";

export interface MemoOption {
  label: string;
  effect: string;
  evidence?: "confirmed" | "estimate" | "opinion";
}

/** A decision memo: the proposal, who's responsible, the case, the money and the deadline. */
export interface Memo {
  id: string;
  kind: "signing" | "street" | "trade" | "pricing" | "retain" | "overrun" | "refinance" | "coachReview" | "execReview" | "complaint" | "dispute" | "general";
  date: string;
  area?: DecisionArea;
  from: string;
  title: string;
  problem: string;
  proposal: string;
  amount?: number;
  /** When the money actually goes out. */
  cash?: { when: string; amount: number }[];
  cap?: string;
  comparables?: string[];
  options: MemoOption[];
  risks: string[];
  budget: string;
  /** The option the executive recommends, and the conditions on it. */
  recommend: number;
  conditions?: string;
  deadline: string;
  ifLate: string;
  status: "open" | "researching" | "decided" | "lapsed";
  /** Back on the desk on this date after more research. */
  until?: string;
  choice?: number;
  decided?: string;
  notes: string[];
  payload?: Record<string, unknown>;
}

export interface OfficeTask {
  id: string;
  title: string;
  kind: string;
  who: ExecRole | "GM";
  set: string;
  due: string;
  status: "open" | "done";
  result?: string;
}

export interface OfficeState {
  modes: Record<DecisionArea, DecisionMode>;
  /** Deals above these need the owner's sign-off even when delegated. */
  limits: { contractApy: number; debt: number };
  /** How each area reports what it did: every action, a weekly summary, or only exceptions. */
  alerts: Record<DecisionArea, "every" | "weekly" | "exceptions">;
  /** Every consequential decision: who proposed it, who approved it and why. */
  trail: { date: string; area: string; what: string; by: string; approved: "owner" | "delegated" | "policy"; amount?: number; why?: string }[];
  /** Delegated actions waiting for the weekly summary. */
  digest: { date: string; area: DecisionArea; text: string }[];
  memos: Memo[];
  meetings: { date: string; topics: string[]; minutes: string[]; tasks: string[] }[];
  tasks: OfficeTask[];
  /** Compliance and operations incidents. */
  incidents: { date: string; kind: "compliance" | "operations" | "systems"; text: string; cost: number }[];
  /** Month by month: fans, press, head coach and staff confidence. */
  trends: { month: string; fans: number; media: number; coach: number; staff: number }[];
  /** A cost-savings drive running to the end of the league year. */
  savings?: { year: number; rate: number };
  /** Extra stadium bookings the operations staff is chasing, until a date. */
  bookingPush?: string;
  /** A compliance review that lowers the chance of trouble, until a date. */
  compliance?: string;
  /** The league year the office last closed out (reviews run when it changes). */
  year?: number;
  /** Trade offers the GM has already written up. */
  seen?: string[];
}

// ---- Culture and relationships (culture.ts) ----

export type CultureIndicator = "trust" | "stability" | "fairness" | "accountability" | "communication" | "morale";

export interface CultureState {
  /** Engine only: how much the GM trusts the owner, 0-100. */
  gmTrust: number;
  /** Engine only: how well the GM and the head coach work together, 0-100, and the pair it was measured for. */
  cooperation: number;
  pair: string;
  /** Engine only: how fairly the staff thinks it is treated, 0-100 (moves with how complaints are handled). */
  fairness: number;
  /** The staff development budget, 0 (none) to 3 (top of the league). */
  development: number;
  /** Engine only: relationships outside the building, 0-100: reporters' sources inside the club, sponsors' confidence, the community. */
  rel: { sources: number; sponsors: number; community: number };
  /** Month by month readings of the six culture indicators. */
  history: ({ month: string } & Record<CultureIndicator, number>)[];
  leaks: { date: string; text: string }[];
  log: { date: string; text: string }[];
  /** Authority the owner took back from someone who wants it, waiting to be raised. */
  disputes?: { who: ExecRole; area: DecisionArea; from: DecisionMode; date: string }[];
}

// ---- Honors and records (see engine/honors.ts, engine/records.ts) ----

export type Award = "MVP" | "OPOY" | "DPOY" | "OROY" | "DROY" | "CPOY" | "COY";

export interface AwardResult { award: Award; winner: string; team: string; name: string; finalists: string[] }

export interface HonorsState {
  /** Pro Bowl selections by season (the original ballot, which is what the CBA counts). */
  proBowl: Record<number, string[]>;
  allPro: Record<number, { first: string[]; second: string[] }>;
  awards: Record<number, AwardResult[]>;
  /** Hall of Fame: inducted players by class year, and each year's finalists. */
  hof: { classes: Record<number, string[]>; finalists: Record<number, string[]> };
}

/** A best mark: who, for whom, how much, and when. */
export interface Mark { player: string; team: string; value: number; season: number; date: string }

export interface RecordsState {
  /** The best single-game and single-season marks set in this save, by stat. */
  game: Record<string, Mark>;
  season: Record<string, Mark>;
  /** NFL records broken in this save, newest first. */
  broken: { date: string; text: string }[];
  /** Every meeting between two teams in this save, by pair ("ARI-ATL", sorted). */
  h2h: Record<string, { games: number; wins: Record<string, number>; close: number; playoff: number; last: string }>;
  /** Each club's valuation at the end of each league year. */
  values: Record<number, Record<string, number>>;
}

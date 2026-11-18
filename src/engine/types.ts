import type { Adv } from "./analytics";
import type { AnalyticsState } from "./strategy";
import type { ClubhouseState } from "./clubhouse";
import type { GameWeekState } from "./gameweek";
import type { ScoutStaffState } from "./scouts";
import type { CoachRoomState } from "./coachroom";
import type { ScoutOpsState } from "./scoutops";
import type { HindsightState } from "./hindsight";
import type { CareState } from "./playercare";
import type { AnalystsState } from "./analysts";
import type { TreasuryState } from "./treasury";
import type { PeopleState } from "./people";
import type { StandingState } from "./standing";

import type { BusinessState, CommunityState, DepartmentsState, DraftArchive, FacilitiesState, LeagueState, LeaseState, MerchState, ReviewState, SeasonRecord, TeamMediaState, VenueState } from "./types-business";
import type { CfbWorld, CollegeState } from "./types-college";
import type { ComplianceState, CrisisState, HostingState, LeagueMoneyState, LeagueOfficeState, LegalState, OwnersState, ProgramState, RedoAsk } from "./types-league";
import type { FanState, MediaState, TeamFinance } from "./types-media";
import type { BooksState, CauseEntry, CrossroadsState, BoardroomState, CultureState, DebtState, ExecState, FranchiseMarketState, HonorsState, InvestorsState, OfficeState, OwnerState, RecordsState, RivalsState, SuccessionState, TenureState, WealthState, YearRecord } from "./types-owner";
export type * from "./types-college";
export type * from "./types-media";
export type * from "./types-business";
export type * from "./types-league";
export type * from "./types-owner";
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
  /** The player id of a former player who went into coaching (formerplayers.ts). */
  formerPlayer?: string;
  retired?: number;
  hiredYear: number;
  callsPlays: ("offense" | "defense")[];
  /** The last season the contract covers, and the salary per year. */
  /** The last season the contract covers and the salary per year; the share owed if fired (1 when left out) and a playoff incentive. */
  contract?: { through: number; salary: number; guaranteed?: number; incentive?: number };
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
  /** Each trait's offset from `dev`: speed fades with age while hands and reads can keep improving (aging.ts; engine only). */
  tdev?: Record<string, number>;
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
  /** On the practice squad through the International Player Pathway: an extra spot that does not count against the limit (global.ts). */
  ipp?: boolean;
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
  /** Salary owed on a release for football reasons (skill) or to save cap room (cap), on top of the full guarantee. */
  skillGuaranteed?: number;
  capGuaranteed?: number;
  /** The part of `bonus` that is a roster bonus, due on the third day of the league year. */
  roster?: number;
}

export type IncentiveKind =
  | "snaps" | "passYds" | "passTd" | "rushYds" | "rushTd" | "rec" | "recYds" | "recTd" | "sacks" | "tackles" | "defInt" | "playoffs"
  | "proBowl" | "allPro";

export interface Incentive {
  kind: IncentiveKind;
  /** The number to reach; a snap share for playing time and playoff incentives; for All-Pro, 1 is first team only and 0 either team. */
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
  /** An option bonus: exercised by the date it is paid and prorated over the years left; declined, the years from `year` void. */
  option?: { year: number; amount: number; by: string; exercised?: boolean; declined?: boolean };
  /** A no-trade clause written into this deal. */
  noTrade?: boolean;
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
 *  EPA for the offense (scrimmage plays), the home team's win probability after the play,
 *  timeouts left after the play as away * 4 + home (absent in logs written before the field view),
 *  for scrimmage snaps, what the field view's animation needs: "offense.defense.call", the two numbers pointing
 *  into `GameLog.who.sets` and the call a few letters (see `Recorder.stage`); absent in older logs].
 */
export type PlayRow = [number, number, 0 | 1, number, number, number, number, string, number, number, number, string, number?, number?, number?, string?];

/** One drive: [offense (0 away, 1 home), quarter, clock, start yard line, plays, yards, seconds of possession, how it ended]. */
export type DriveRow = [0 | 1, number, number, number, number, number, number, string];

/**
 * What one row of the play-by-play changed in the box score, or 0 for nothing:
 * [team totals as (side, TEAM_BOX_KEYS index, change) triples,
 *  player stats as (side, index into GameLog.ids for that side, STAT_KEYS index, amount) quads].
 * A longest-play stat carries the new length instead of a change.
 */
export type RowStats = [number[], number[]] | 0;

export interface GameLog {
  date: string;
  plays: PlayRow[];
  drives: DriveRow[];
  /** The running box score, one entry per row of `plays` (absent in logs written before it was kept). */
  ids?: [string[], string[]];
  box?: RowStats[];
  /**
   * Who was on the field, for the animation: every lineup either side used, written once.
   * A set is "side:group|group|..." with players as numbers into `ids` for that side (0 away, 1 home);
   * the offense's groups are quarterback, backs, fullback, receivers, tight ends, line, and the
   * defense's are edge, interior, linebackers, corners, safeties.
   */
  who?: { ids: [string[], string[]]; sets: string[] };
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

/** A rename-and-repaint league pack: new city, name and colors for some or all clubs. */
export interface CustomLeague {
  name: string;
  version: 1;
  teams: Record<string, { city?: string; name?: string; colors?: [string, string] }>;
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
  /** How the owner plays: the whole club, football with the business delegated, or the business with football delegated. */
  mode?: "owner" | "football" | "business";
  /** How much reaches the owner's decision queue (queue.ts): major calls only, everything, or everything plus department readings. */
  involvement?: "handsOff" | "standard" | "handsOn";
  /** How much estimated and private information the owner sees: every staff estimate, the usual, or confirmed facts only. */
  info?: "full" | "real" | "limited";
  /** How volatile the economy is: calm, normal or volatile (engine/economy.ts). */
  economy?: "calm" | "normal" | "volatile";
  /** A historical start: false follows the real timeline after the start; true leaves it to the save (engine/eras.ts). */
  altHistory?: boolean;
  /** How hard the world pushes back: what agents and other GMs ask of us and how fast patience runs out (engine/difficulty.ts). */
  difficulty?: "rookie" | "standard" | "veteran" | "legend";
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
  /** Roster bonus each year after the first, due on the third day of the league year (contractextras.ts). */
  rosterBonus?: number;
  /** Option bonus the club can exercise before the second league year; prorated from then on, or the later years void. */
  optionBonus?: number;
  /** Salary guaranteed against a release for football reasons, and against a release to save cap room. */
  skillGuaranteed?: number;
  capGuaranteed?: number;
  /** A no-trade clause: he has to agree to any trade. */
  noTrade?: boolean;
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

export interface History {
  seasons: SeasonRecord[];
  drafts: DraftArchive[];
  /** Regular-season stats from the seasons played in this save, by player. */
  stats: Record<string, SeasonStats[]>;
  snaps: Record<string, Record<string, SnapSeason>>;
  /** Players who retired, with the season they last played. */
  retired: Record<string, number>;
}

/** What the owner has changed: garages built, lots leased, seats converted to premium. */
export interface GroundsState {
  /** `paid`: paid so far (a deposit, then monthly until it opens; absent in older saves, which paid it all up front). `at`: the stadium it was built at. */
  garages: { id: string; spaces: number; acres: number; cost: number; started: string; opens: string; paid?: number; at?: string }[];
  leases: { id: string; name: string; spaces: number; rent: number; through: number; at?: string }[];
  premium: { id: string; seats: number; cost: number; started: string; opens: string; phased: boolean; paid?: number; at?: string }[];
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
  /** The first draft class whose players' NFL outcomes are drawn apart from what scouts can see (outcomes.ts); set on load for older saves. */
  draftModelFrom?: number;
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
  /** The college world that carries across seasons: programs, recruiting, coaching changes (cfbworld.ts). */
  cfb?: CfbWorld;
  /** The 2027 draft: order, compensatory picks, mock drafts and the selections. */
  draft?: DraftState;
  /** Media coverage, press questions and how the press feels about the owner. */
  media?: MediaState;
  /** Everyone who coaches or runs a front office, and the hiring carousel. */
  staff?: StaffState;
  /** The business side: the team's books, ticket prices, the stadium calendar and budgets. */
  business?: BusinessState;
  /** What the owner changed around the stadium: garages, leased lots, seats rebuilt as clubs (grounds.ts). */
  grounds?: GroundsState;
  /** The fan base and the market (fans.ts). */
  fans?: FanState;
  /** Batch J: the store and the brand (merch.ts), team media (teammedia.ts) and the venue (venue.ts). */
  merch?: MerchState;
  teamMedia?: TeamMediaState;
  venue?: VenueState;
  facilities?: FacilitiesState;
  community?: CommunityState;
  departments?: DepartmentsState;
  /** Stadium leases with the city or stadium authority, by team (publicly owned buildings only). */
  leases?: Record<string, LeaseState>;
  /** This season's offseason program, training camp and discipline (spring.ts, camp.ts, discipline.ts). */
  program?: ProgramState;
  /** The other owners, the league meeting and the rule changes adopted (owners.ts, rules.ts). */
  owners?: OwnersState;
  leagueMoney?: LeagueMoneyState;
  leagueOffice?: LeagueOfficeState;
  compliance?: ComplianceState;
  crisis?: CrisisState;
  economy?: import("./economy").EconomyState;
  shocks?: import("./shocks").ShockState;
  labor?: import("./labor").LaborState;
  construction?: import("./construction").ConstructionState;
  politics?: import("./politics").PoliticsState;
  relocation?: import("./relocation").RelocationState;
  global?: import("./global").GlobalState;
  legal?: LegalState;
  /** Offseason grades, fan expectations and the season's storylines. */
  review?: ReviewState;
  /** The club's accounting: approved budgets, closed years and the reserve policy (books.ts). */
  books?: BooksState;
  /** The club's borrowing: the credit facility, term loans, offers and market rates (debt.ts). */
  debt?: DebtState;
  /** Who the owner is: wealth, style, goals and the scorecard of each season (ownership.ts). */
  owner?: OwnerState;
  investors?: InvestorsState;
  wealth?: WealthState;
  tenure?: TenureState;
  succession?: SuccessionState;
  rivals?: RivalsState;
  causes?: CauseEntry[];
  /** Counter behind every id from ids.ts; only goes up. */
  idSeq?: number;
  archive?: Record<string, YearRecord>;
  /** A historical start (engine/eras.ts): the season it began and whether history is left to the save. */
  era?: { start: number; alt: boolean; altFrom?: number };
  /** A custom league pack's names and colors, laid over the clubs (engine/custompack.ts). */
  customLeague?: CustomLeague;
  franchise?: FranchiseMarketState;
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
  /** The league wire; `topic` (engine/inbox.ts NewsTopic) is absent on lines from older saves. */
  news: { date: string; text: string; topic?: string }[];
  /** The owner's say in the coach's room: preseason snaps, the bubble meeting, contingency lineups, special teams (coachroom.ts). */
  coachRoom?: CoachRoomState;
  /** The scouting operation: budget split, national and pro scouts, advance reports, undrafted offers (scoutops.ts). */
  scoutOps?: ScoutOpsState;
  /** Drafts and signings re-graded after two and four seasons, the scouts' record, coaching grades (hindsight.ts). */
  hindsight?: HindsightState;
  /** Playbook learning, snap load and the named medical staff (playercare.ts). */
  care?: CareState;
  /** Analysts by name, data feeds and experiments (analysts.ts). */
  analysts?: AnalystsState;
  /** Payment terms, collections, audit findings, the capital pool, consultants and cuts (treasury.ts). */
  treasury?: TreasuryState;
  /** Succession, promotions, quality-control coaches, memory, mandates and the owner's calendar (people.ts). */
  people?: PeopleState;
  /** Credibility, public stances, officials and scandals (standing.ts). */
  standing?: StandingState;
  /** A sandbox game: set once and never cleared, so its results stay apart from realism games. */
  sandbox?: boolean;
  /** The big calls where the club's people disagree (crossroads.ts). */
  crossroads?: CrossroadsState;
  /** Quarterly board meetings, pledges to the partners and their goals (boardroom.ts). */
  boardroom?: BoardroomState;
  /** When each open problem was first seen (problems.ts). */
  problems?: { seen: Record<string, string> };
}

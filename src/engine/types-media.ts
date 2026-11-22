import type { OpinionState, OwnerDesk, SocialState } from "./types-business";
// Media and the press. Re-exported from types.ts; import from there.

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
  /** Composed stories (engine/media): the story type "fact/angle/format", and its format and angle. */
  type?: string;
  format?: string;
  angle?: string;
  /** The reporter who wrote it (engine/media/corps.ts), for composed stories. */
  reporter?: string;
}

export type ReporterRole = "insider" | "columnist" | "analyst" | "draft" | "reporter" | "beat" | "host" | "anchor";

/** A made-up member of the press corps (engine/media/corps.ts). */
export interface Reporter {
  id: string;
  name: string;
  /** Outlet id: a national outlet, or "local:TEAM", "radio:TEAM", "tv:TEAM". */
  outlet: string;
  role: ReporterRole;
  /** The club a local reporter covers. */
  team?: string;
  born: number;
  /** Season they joined their current outlet. */
  since: number;
  /** Leans to hot takes (1) or straight reporting (0). */
  heat: number;
  style: "stats" | "oldschool" | "balanced";
  /** Engine only: how often what they hear is right, 0-1. */
  accuracy: number;
  /** Engine only: how well sourced they are inside each club, 0-100. */
  sources: Record<string, number>;
  /** Engine only: how they feel about our owner, -50 to 50. */
  rel: number;
  /** Their public record: reports that panned out and reports that didn't. */
  hits: number;
  misses: number;
  awards: { season: number; name: string }[];
  history: { season: number; outlet: string; role: ReporterRole }[];
  retired?: number;
}

/** A sourced report about something that may or may not happen (engine/media/rumors.ts). */
export interface Rumor {
  id: string;
  date: string;
  reporter: string;
  kind: string;
  team: string;
  player?: string;
  /** Other clubs named: a destination, bidders. */
  teams?: string[];
  coach?: string;
  /** Engine only: whether the report matched what was really going on. */
  truth: boolean;
  /** When the report is judged if nothing settles it first. */
  until: string;
  outcome?: "hit" | "miss" | "quiet";
  headline?: string;
}

/** A storyline that runs for weeks (engine/media/arcs.ts). */
export interface Arc {
  id: string;
  kind: string;
  /** What makes it unique among open arcs of its kind: a club, a player, a pair of clubs. */
  key: string;
  team: string;
  player?: string;
  coach?: string;
  /** Another club in the story: a rival, a destination. */
  other?: string;
  title?: string;
  data?: Record<string, string | number | boolean>;
  opened: string;
  phase: string;
  beats: { date: string; beat: string }[];
  ending?: string;
  ended?: string;
}

/** What the season narratives desk remembers: last week's award ladders, marks already written up, careers to pay tribute to. */
export interface NarrState {
  ladder: Record<string, string[]>;
  marks: Record<string, string>;
  retired: string[];
}

export interface ArcState {
  list: Arc[];
  next: number;
  /** Each club's starting quarterback at the last weekly look, to spot a switch. */
  qb1?: Record<string, string>;
  /** Steps other systems settled since the last day's writing. */
  pending?: { id: string; beat: string; ending: boolean }[];
}

export interface PressCorps {
  people: Reporter[];
  next: number;
  rumors: Rumor[];
}

/** Something from inside a building that reaches a reporter: a leak, an agent's account of contract talks. */
export interface PressTip {
  kind: "leak" | "talks";
  team: string;
  player?: string;
  headline: string;
  text: string;
}

/** A fact another system hands the media (engine/media/facts.ts `emit`), written up at the end of the day. */
export interface MediaFactInput {
  type: string;
  text: string;
  kind?: StoryKind;
  teams?: string[];
  players?: string[];
  value?: number;
  data?: Record<string, string | number | boolean>;
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

/** The question desk's memory: when each bank line and topic was last used, and fingerprints of recent wordings. */
export interface QuestionMemory {
  used: Record<string, string>;
  seen: number[];
  /** The same for questions to other clubs' people; absent in saves from before it was split. */
  cseen?: number[];
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
  /** Facts handed over today by other systems, written up by the media at the end of the day. */
  queue?: MediaFactInput[];
  /** College football news for the story engine's college desk (cfbmedia.ts), written up at the end of the day. */
  cfbq?: { kind: string; value: number; slots: Record<string, unknown>; tags: Record<string, boolean> }[];
  /** The people who cover the league and their reports. */
  corps?: PressCorps;
  /** Leaks and agents' accounts waiting for a reporter. */
  tips?: PressTip[];
  /** The storylines running around the league. */
  arcs?: ArcState;
  /** What the question desk asked and when (media/questions.ts); absent in older saves. */
  qmem?: QuestionMemory;
  /** The season narratives desk (media/narratives.ts). */
  narr?: NarrState;
  social?: SocialState;
  /** The opinion desk (media/opinion.ts). */
  opinion?: OpinionState;
  /** The owner's own dealings with the press (media/ownerdesk.ts). */
  desk?: OwnerDesk;
  /** Engine only: the tone of recent coverage (media/coverage.ts). */
  climate?: PressClimate;
}

/** Engine only: how the coverage has read lately, kept day to day. */
export interface PressClimate {
  /** Each club's tone, -50 to 50. */
  tone: Record<string, number>;
  /** Players written about lately, -50 to 50 (small values drop off). */
  players: Record<string, number>;
  /** The league office's attention to our owner's public words, 0-100. */
  league: number;
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
  | "hosting" | "bids" | "loanIn" | "principal" | "loanFees" | "professional" | "seatLicenses" | "research" | "content" | "brand" | "venue" | "security" | "technology" | "revenueShare" | "legal" | "escrow" | "insurance" | "relocation" | "global" | "expansion";

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
  /** This week's home game priced on its own by the owner's call (ownercalls.ts), with the staff's forecast for it. */
  game?: { id: string; mult: number; forecast: number; memo?: string };
  /** Home-game price calls against what the gate actually brought in, newest first. */
  calls?: { game: string; date: string; mult: number; forecast: number; actual: number }[];
}

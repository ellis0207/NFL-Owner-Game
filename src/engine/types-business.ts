import type { ConcessionTier, Dept, GateRecord, LedgerEntry, TicketingState } from "./types-media";
// The business side: selling, the show, the buildings, finance systems. Re-exported from types.ts; import from there.

// ---- Batch J: merchandise, team media, the venue ----

export type MerchChannel = "inHouse" | "partner";
export type RebrandKind = "uniform" | "logo" | "name";

export interface MerchStock {
  /** Units ordered for the season, sold so far, and the cost of one. */
  ordered: number;
  sold: number;
  cost: number;
  name: string;
  /** The staff's forecast of the season's sales, and (engine only) how far real demand runs from it. */
  demand: number;
  luck?: number;
}

export interface MerchSeason {
  season: number;
  gross: number;
  cogs: number;
  markdowns: number;
  writeoffs: number;
  returns: number;
  discounts: number;
  operatorShare: number;
  counterfeit: number;
  lostSales: number;
  online: number;
  stands: number;
  /** Units sold by player id ("team" for the rest of the line). */
  units: Record<string, number>;
}

export interface MerchState {
  /** The club's marks: what the league licenses and what a rebrand changes. */
  brand: { name: string; logo: number; uniform: number; since: number; lift?: { kind: RebrandKind; season: number } };
  rebrand?: { kind: RebrandKind; name?: string; asked: string; decided?: string; approved?: boolean; launches?: number; cost: number; paid: number };
  price: number;
  /** How deep the preseason order runs against the staff forecast. */
  depth: number;
  stores: MerchChannel;
  online: MerchChannel;
  enforcement: boolean;
  retro?: number;
  /** Jerseys by player id ("team" for the rest), for the current season. */
  stock: Record<string, MerchStock>;
  orderedFor?: number;
  seasons: MerchSeason[];
}

export interface TvDeal {
  partner: string;
  package: string;
  /** Average yearly rights fee, in dollars. */
  annual: number;
  through: number;
}

export interface SocialPost {
  date: string;
  who: string;
  text: string;
  /** The Huddle (media/social.ts): post id, who posted (fan, player, reporter, club), the club and player it's about, the topic it counts toward in trending, the fan's mood. */
  id?: number;
  kind?: "fan" | "player" | "press" | "club" | "owner";
  team?: string;
  player?: string;
  by?: string;
  topic?: string;
  mood?: number;
}

/** A columnist's running argument about one club, kept until the season settles it. */
export interface Thesis {
  id: string;
  reporter: string;
  team: string;
  stance: "real" | "fraud";
  opened: string;
  /** The club's winning share when the column first ran. */
  from: number;
  end?: "right" | "wrong";
}

export interface OpinionState {
  theses: Thesis[];
}

/** How the owner answers a question: straight, with a promise, with nothing, or at the critics. */
export type OwnerTone = "candid" | "confident" | "deflect" | "defiant" | "gracious" | "playful";

/** One question at a press conference or interview, with the ways to answer it (four in older saves, six now). */
export interface PresserQuestion {
  /** The reporter asking (a press corps id). */
  by: string;
  topic: string;
  text: string;
  /** Engine only: how much the answer matters, 10-30. */
  value: number;
  player?: string;
  /** The storyline the question comes from. */
  arc?: string;
  options: { tone: OwnerTone; text: string }[];
  answer?: number;
}

/** A press conference the owner is called to, or an interview the owner asked for. */
export interface Presser {
  id: string;
  kind: "presser" | "interview" | "offrecord";
  occasion: string;
  title: string;
  date: string;
  expires: string;
  /** The reporter of a one-on-one interview. */
  reporter?: string;
  questions: PresserQuestion[];
  /** When it was held, or skipped (no answers). */
  held?: string;
  skipped?: boolean;
}

export interface OwnerDesk {
  next: number;
  pressers: Presser[];
  /** Reporters with special access, or banned from the building. */
  access: Record<string, "favored" | "banned">;
  /** How the owner answered reports about the club; judged once the report is. */
  responses: { rumor: string; how: "confirm" | "deny" | "ignore"; date: string; judged?: boolean }[];
  /** Engine only: how far the press and fans believe the owner's word, 0-100. */
  cred: number;
  /** Engine only: promises made at the podium, checked against the record a month later. */
  claims: { date: string; due: string; w: number; l: number }[];
  /** The last time the owner did each thing: interview, exclusive, oped, post, presser. */
  last: Record<string, string>;
  /** The head coach at the last look, to call a press conference when that changes. */
  hc?: string;
  opeds: { date: string; outlet: string; topic: string }[];
  exclusives: { date: string; reporter: string; topic: string }[];
  /** Engine only: off-the-record remarks a reporter will print. */
  burns?: { date: string; reporter: string; quote: string }[];
}

/** The Huddle: the feed, and each club's fan sentiment (0-100). */
export interface SocialState {
  posts: SocialPost[];
  next: number;
  mood: Record<string, number>;
}

export interface TeamMediaState {
  /** Content staff by role, and the shows the club makes. */
  staff: Record<string, number>;
  shows: Record<string, boolean>;
  followers: number;
  followers0: number;
  /** Streaming's pull on the next round of TV deals: 1 is the trend everyone expects. */
  streaming: number;
  access: "open" | "standard" | "closed";
  spokesperson: "owner" | "president" | "gm" | "coach";
  feed: SocialPost[];
  /** Headlines about our club across seasons. */
  archive: { date: string; outlet: string; headline: string }[];
  /** Stories that come back year after year. */
  sagas: { key: string; title: string; start: string; until: number; told: number[] }[];
  prime: string[];
}

export type VenueStaffing = 0 | 1 | 2 | 3;

export interface VenuePlan {
  staffing: VenueStaffing;
  security: VenueStaffing;
  show: "basic" | "standard" | "premium";
  alcohol: "standard" | "thirdQuarter" | "strict";
  transit: "none" | "shuttles" | "rideshare";
  menu: "standard" | "local" | "wide";
  weather: boolean;
  backups: boolean;
  medics: VenueStaffing;
}

export interface VenueReport {
  game: string;
  date: string;
  attendance: number;
  scanned: number;
  sold: number;
  distributed: number;
  /** Minutes from parking to seat, and the worst gate and concession lines. */
  arrival: number;
  gateWait: number;
  foodWait: number;
  restroomWait: number;
  foodWaste: number;
  foodShort: number;
  merchShort: number;
  delay?: number;
  faults: string[];
  incidents: string[];
  complaints: Record<string, number>;
  perCap: { food: number; merch: number; parking: number };
  revenue: number;
  costs: { labor: number; vendors: number; cleaning: number; security: number; show: number; other: number };
  profit: number;
  experiment?: string;
  inspection?: string;
}

export interface FacilityPart {
  /** Engine only: wear since the last replacement, 0 new to 100 worn out. The owner sees a read, or a study's numbers. */
  wear: number;
  replaced: number;
}
export interface FacilitiesState {
  parts: Record<string, FacilityPart>;
  /** How the stadium's maintenance budget is spent: put off, as scheduled, or ahead of schedule. */
  plan: "defer" | "standard" | "ahead";
  surface: "grass" | "turf";
  /** League year of the last engineering study. */
  study?: number;
  surveys: { year: number; scores: Record<string, number>; notes: string[] }[];
  log: { date: string; key: string; cost: number; auto: boolean }[];
}
export interface Grant {
  id: string;
  date: string;
  org: string;
  area: string;
  amount: number;
  status: "pending" | "approved" | "declined";
  /** Engine only: how well the group will use the money. */
  quality: number;
  outcome?: string;
}
export interface CommunityState {
  focus: string[];
  foundation: { balance: number; clubGift: number; given: number; raised: number; ownerGiven: number };
  /** Foundation staff and board review: 0 thin, 1 standard, 2 thorough. */
  oversight: 0 | 1 | 2;
  /** Grants approved by the staff without the owner, up to this amount. */
  autoLimit: number;
  programs: Record<string, boolean>;
  services: Record<string, boolean>;
  /** The season each program started, for long commitments. */
  since: Record<string, number>;
  grants: Grant[];
  appearances: { season: number; count: number; players: Record<string, number> };
  alumni: { events: number; last?: string; names: string[] };
  partnership: boolean;
  reports: { year: number; spent: number; grants: number; participants: number; text: string }[];
}
export interface DeptState {
  director: string;
  budget: 0 | 1 | 2 | 3;
  policy: Record<string, string>;
  metrics: { quarter: string; values: Record<string, number> }[];
}
export interface TripReport {
  game: string;
  date: string;
  where: string;
  miles: number;
  people: number;
  costs: { charter: number; hotel: number; ground: number; meals: number; equipment: number; security: number };
  delay?: number;
  note?: string;
}
export interface DepartmentsState {
  travel: DeptState;
  security: DeptState;
  it: DeptState;
  trips: TripReport[];
  /** Core systems: the year each went in, and a replacement under way. */
  systems: Record<string, { since: number; until?: string }>;
  incidents: { date: string; dept: "travel" | "security" | "it"; text: string; cost?: number }[];
}

export interface VenueState {
  plan: VenuePlan;
  reports: VenueReport[];
  experiment?: { kind: string; label: string; start: string; games: number; effect: number; done?: boolean };
  experiments: { kind: string; label: string; before: number; after: number; date: string }[];
  /** Recurring problems the operations director flagged, by complaint category. */
  flags: { cat: string; date: string }[];
  investigations: { date: string; game: string; text: string; finding: string }[];
  backupsBuilt?: string;
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
  /** Batch O: renewal option years the team can call at the same rent. */
  option?: number;
}

/** What the owner can push for in lease talks: public money, rent, the city taking on more upkeep, a bigger share of events, or renewal options. */
export type LeaseAsk = "money" | "rent" | "upkeep" | "events" | "option";

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
  talks?: { opened: string; round: number; offer: LeaseOffer; patience: number; waiting?: { ask: LeaseAsk; date: string } };
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
  /** League passing yards per team game, for comparing eras. */
  passPerGame?: number;
  /** The owner of the user's club that season, for eras by owner. */
  owner?: string;
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

/** A Stadium Lab design (src/lab): structure, experience, parking and land fields, kept as the Lab writes them. */
export type LabDesign = Record<string, string | number | boolean>;

/** What a stadium renovation from the Stadium page does once it opens (stadiumlab.ts). */
export interface LabRenovation {
  id: string;
  team: string;
  /** The building it was done to: it stays with the building if the club moves. */
  at: string;
  title: string;
  /** "new": the fit-out of a new stadium designed on a blank site (construction.ts), opened with the building. */
  kind?: "new";
  design: LabDesign;
  /** Seats and the Lab's roof kind after the work, and before it. */
  capacity: number;
  roof: string;
  before: { capacity: number; roof: string };
  /** Premium seats added (twenty a suite). */
  premium: number;
  /** Gate effects of the work, in the projects' terms (projects.ts), counting only what no project already did. */
  effect: { demand: number; premium: number; perCap: number; sponsor: number };
  /** Project ids (projects.ts) this work delivers, so they aren't built or counted twice. */
  covers: string[];
  /** Parking spaces the club runs added (or removed), and how many of them in garages; land bought. */
  spaces: number;
  garage: number;
  acres: number;
  /** Seats shut in a season the work runs through. */
  closed: number;
  /** Building's yearly upkeep multiplier after the work (bigger bowl, solar). */
  upkeep: number;
  surface?: "grass" | "turf";
  /** Parts of the building it renews (facilities.ts keys). */
  renews: string[];
  /** Full price, our share (the budget, contingency included), the part of it that's contingency, and what's been paid. */
  price: number;
  cost: number;
  contingency: number;
  paid: number;
  started: string;
  opens: string;
  opened?: boolean;
  /** Over (or under, negative) the budget, settled on opening. */
  overrun?: number;
}

export interface StadiumLabState {
  renovations: LabRenovation[];
  /** The owner's design in progress, by building. */
  drafts: Record<string, LabDesign>;
}

// Every team's stadium and who controls it, entered by hand from public
// reporting (leases, stadium authority reports, team announcements) as of the
// 2026 season. Money figures are our own estimates in the spirit of what's
// reported: rent and lease terms are public for most teams; upkeep, debt
// service and event income are rounded guesses at the right scale.
//
// Five ways an NFL team can hold its stadium:
// - owned: the team (its owner) holds the building. Full control: it books
//   any event, keeps all of the money, sells the naming rights, and pays for
//   everything, debt included.
// - coowned: two teams own it together (MetLife). Each books events only with
//   the other's agreement and splits the money and the bills.
// - publicTeam: a city, county or stadium authority owns it, and the team runs
//   it under a lease. The team books events and keeps most event income, but
//   pays rent, shares capital repairs, and the landlord has a say.
// - publicAuthority: a public authority owns AND runs it. The team is a
//   tenant on game days: the authority books every other event and keeps most
//   of that money, and controls parking and concessions contracts.
// - tenant: the team rents from another team's owner (the Chargers at SoFi).
//   It sets its own ticket prices and little else.

export type Structure = "owned" | "coowned" | "publicTeam" | "publicAuthority" | "tenant";

export const STRUCTURE_LABEL: Record<Structure, string> = {
  owned: "Team-owned",
  coowned: "Co-owned with another team",
  publicTeam: "Publicly owned, team-operated",
  publicAuthority: "Publicly owned and operated",
  tenant: "Tenant of another team",
};

export interface FixedEvent {
  date: string;
  name: string;
  /** Net income to the stadium operator before the team's share, dollars. */
  net: number;
}

export interface Stadium {
  team: string;
  name: string;
  structure: Structure;
  /** Who holds title. */
  owner: string;
  /** Who runs it day to day and books non-NFL events. */
  operator: string;
  /** Seats for the 2026 season. */
  capacity: number;
  roof: "open" | "dome" | "retractable";
  opened: number;
  /** Last season under the current lease or agreement, if there is one. */
  leaseThrough?: number;
  /** Rent or the yearly operating payment the team makes to the owner, dollars. */
  rent: number;
  /** Share of non-NFL event income the team keeps. */
  eventShare: number;
  /** Share of NFL game-day concessions and parking income the team keeps. */
  gameDayShare: number;
  /** Naming rights per year, and the team's share of it. */
  naming: number;
  namingShare: number;
  /** The team's yearly cost of the building: operations, maintenance, capital repairs, insurance. */
  upkeep: number;
  /** Yearly debt service the team carries for the building. */
  debt: number;
  /** The other team in a shared or rented stadium. */
  partner?: string;
  /** A college team that plays its home games here (its id in the college data). */
  collegeTenant?: string;
  /** An MLS club that plays here. */
  mls?: string;
  /** Local rules that cut concert income (Levi's Stadium's weeknight curfew). */
  curfew?: boolean;
  /** Dates the building is booked for something else every year, inclusive. */
  blackout?: { from: string; to: string; what: string }[];
  /** Big events already on the stadium's 2026-27 calendar. */
  fixed: FixedEvent[];
  /** What's happening with the building, in a sentence or two. */
  note: string;
}

const M = 1_000_000;
const CCG = "2026-12-05";

export const STADIUMS: Stadium[] = [
  {
    team: "BUF", name: "Highmark Stadium", structure: "publicTeam", roof: "open", opened: 2026, capacity: 62_000,
    owner: "Erie County Stadium Corporation (New York State and Erie County)", operator: "Buffalo Bills", leaseThrough: 2055,
    rent: 2 * M, eventShare: 0.85, gameDayShare: 1, naming: 5 * M, namingShare: 1, upkeep: 18 * M, debt: 55 * M,
    fixed: [],
    note: "The new Highmark Stadium opened this season across the street from the old one. The public paid about $850M of the cost; the Bills' share came largely from league G-5 loans and seat licenses, and they run the building under a 30-year lease.",
  },
  {
    team: "MIA", name: "Hard Rock Stadium", structure: "owned", roof: "open", opened: 1987, capacity: 65_326,
    owner: "Stephen Ross (Hard Rock Stadium LLC)", operator: "Miami Dolphins", rent: 0, eventShare: 1, gameDayShare: 1,
    naming: 25 * M, namingShare: 1, upkeep: 38 * M, debt: 20 * M, collegeTenant: "MIA",
    fixed: [{ date: "2027-01-14", name: "Orange Bowl (CFP semifinal)", net: 4.5 * M }],
    note: "Privately owned and privately renovated. The campus hosts the Miami Hurricanes, the Orange Bowl, the Formula 1 Miami Grand Prix and the Miami Open, which makes it one of the busiest buildings in the league.",
  },
  {
    team: "NE", name: "Gillette Stadium", structure: "owned", roof: "open", opened: 2002, capacity: 65_878,
    owner: "Kraft Group", operator: "Kraft Sports + Entertainment", rent: 0, eventShare: 1, gameDayShare: 1,
    naming: 8 * M, namingShare: 1, upkeep: 30 * M, debt: 6 * M, mls: "New England Revolution",
    fixed: [],
    note: "Built with private money in 2002 and surrounded by the Krafts' Patriot Place development. The Revolution play here, and the Krafts book every concert and event.",
  },
  {
    team: "NYJ", name: "MetLife Stadium", structure: "coowned", roof: "open", opened: 2010, capacity: 82_500,
    owner: "MetLife Stadium Company (Jets and Giants, 50/50), on land leased from the NJ Sports and Exposition Authority", operator: "MetLife Stadium Company",
    leaseThrough: 2047, rent: 4 * M, eventShare: 0.5, gameDayShare: 1, naming: 18 * M, namingShare: 0.5, upkeep: 26 * M, debt: 60 * M, partner: "NYG",
    fixed: [{ date: "2026-12-12", name: "Army-Navy Game", net: 3 * M }],
    note: "The Jets and Giants built it together and own it as equal partners. Each team keeps its own game-day money, while concerts and other events need both teams' sign-off and are split down the middle.",
  },
  {
    team: "NYG", name: "MetLife Stadium", structure: "coowned", roof: "open", opened: 2010, capacity: 82_500,
    owner: "MetLife Stadium Company (Giants and Jets, 50/50), on land leased from the NJ Sports and Exposition Authority", operator: "MetLife Stadium Company",
    leaseThrough: 2047, rent: 4 * M, eventShare: 0.5, gameDayShare: 1, naming: 18 * M, namingShare: 0.5, upkeep: 26 * M, debt: 60 * M, partner: "NYJ",
    fixed: [{ date: "2026-12-12", name: "Army-Navy Game", net: 3 * M }],
    note: "The Giants and Jets built it together and own it as equal partners. Each team keeps its own game-day money, while concerts and other events need both teams' sign-off and are split down the middle.",
  },
  {
    team: "BAL", name: "M&T Bank Stadium", structure: "publicTeam", roof: "open", opened: 1998, capacity: 70_745,
    owner: "Maryland Stadium Authority", operator: "Baltimore Ravens", leaseThrough: 2052,
    rent: 1 * M, eventShare: 0.9, gameDayShare: 1, naming: 6 * M, namingShare: 1, upkeep: 16 * M, debt: 8 * M,
    fixed: [],
    note: "The state owns it; the Ravens run it under a lease extended through 2052, with the stadium authority funding most of a recent round of upgrades.",
  },
  {
    team: "CIN", name: "Paycor Stadium", structure: "publicTeam", roof: "open", opened: 2000, capacity: 65_515,
    owner: "Hamilton County", operator: "Cincinnati Bengals", leaseThrough: 2035,
    rent: 1 * M, eventShare: 0.6, gameDayShare: 1, naming: 4 * M, namingShare: 1, upkeep: 12 * M, debt: 3 * M,
    fixed: [],
    note: "Hamilton County owns it and has carried most of its costs under one of the most team-friendly leases ever signed; a new lease with a major county-funded renovation replaces it.",
  },
  {
    team: "CLE", name: "Huntington Bank Field", structure: "publicTeam", roof: "open", opened: 1999, capacity: 67_431,
    owner: "City of Cleveland", operator: "Cleveland Browns", leaseThrough: 2028,
    rent: 0.5 * M, eventShare: 0.75, gameDayShare: 1, naming: 2 * M, namingShare: 1, upkeep: 14 * M, debt: 2 * M,
    fixed: [],
    note: "The city owns the lakefront stadium. The Browns plan to leave for a domed stadium of their own in Brook Park when the lease runs out, and the city has fought the move.",
  },
  {
    team: "PIT", name: "Acrisure Stadium", structure: "publicTeam", roof: "open", opened: 2001, capacity: 68_400,
    owner: "Sports & Exhibition Authority of Pittsburgh and Allegheny County", operator: "Pittsburgh Steelers", leaseThrough: 2030,
    rent: 1 * M, eventShare: 0.8, gameDayShare: 1, naming: 10 * M, namingShare: 1, upkeep: 14 * M, debt: 5 * M, collegeTenant: "PITT",
    fixed: [],
    note: "Publicly owned and run by the Steelers, who share the building with the Pitt Panthers and book its concerts.",
  },
  {
    team: "HOU", name: "NRG Stadium", structure: "publicAuthority", roof: "retractable", opened: 2002, capacity: 72_220,
    owner: "Harris County Sports & Convention Corporation", operator: "ASM Global for Harris County", leaseThrough: 2031,
    rent: 1.5 * M, eventShare: 0.2, gameDayShare: 0.85, naming: 10 * M, namingShare: 0.7, upkeep: 6 * M, debt: 2 * M,
    blackout: [{ from: "2027-02-22", to: "2027-03-28", what: "Houston Livestock Show and Rodeo" }],
    fixed: [{ date: "2026-12-30", name: "Texas Bowl", net: 1.2 * M }],
    note: "Harris County owns NRG Park and a management company runs it for the county. The Texans play there under a lease and get a small cut of other events; the Rodeo takes over the building every spring.",
  },
  {
    team: "IND", name: "Lucas Oil Stadium", structure: "publicAuthority", roof: "retractable", opened: 2008, capacity: 67_000,
    owner: "Indiana Finance Authority", operator: "Capital Improvement Board of Marion County", leaseThrough: 2041,
    rent: 0.25 * M, eventShare: 0.25, gameDayShare: 0.9, naming: 6 * M, namingShare: 1, upkeep: 4 * M, debt: 0,
    fixed: [{ date: CCG, name: "Big Ten Championship Game", net: 3 * M }],
    note: "The state owns it and the county's Capital Improvement Board runs it, booking the combine, Big Ten title games and Final Fours. The Colts pay little rent and get a share of other events.",
  },
  {
    team: "JAX", name: "EverBank Stadium", structure: "publicTeam", roof: "open", opened: 1995, capacity: 42_500,
    owner: "City of Jacksonville", operator: "Jacksonville Jaguars", leaseThrough: 2055,
    rent: 0.5 * M, eventShare: 0.6, gameDayShare: 1, naming: 4 * M, namingShare: 1, upkeep: 8 * M, debt: 20 * M,
    fixed: [{ date: "2026-10-31", name: "Florida-Georgia", net: 2.5 * M }, { date: "2026-12-31", name: "Gator Bowl", net: 1.4 * M }],
    note: "The $1.4B \"Stadium of the Future\" rebuild cut capacity to about 42,500 this season, and two Jaguars home games moved to London. Next season the team plays in Orlando while the work finishes.",
  },
  {
    team: "TEN", name: "Nissan Stadium", structure: "publicTeam", roof: "open", opened: 1999, capacity: 69_143,
    owner: "Metropolitan Government of Nashville", operator: "Tennessee Titans", leaseThrough: 2026,
    rent: 0.5 * M, eventShare: 0.7, gameDayShare: 1, naming: 3 * M, namingShare: 1, upkeep: 12 * M, debt: 35 * M,
    fixed: [{ date: "2026-12-30", name: "Music City Bowl", net: 1.2 * M }],
    note: "This is the last season in the old building. The new, enclosed Nissan Stadium next door opens in 2027, publicly owned with the Titans running it and keeping all event income.",
  },
  {
    team: "DEN", name: "Empower Field at Mile High", structure: "publicTeam", roof: "open", opened: 2001, capacity: 76_125,
    owner: "Metropolitan Football Stadium District", operator: "Stadium Management Company (Broncos)", leaseThrough: 2030,
    rent: 1 * M, eventShare: 0.9, gameDayShare: 1, naming: 7 * M, namingShare: 1, upkeep: 16 * M, debt: 4 * M,
    fixed: [],
    note: "A public stadium district owns it; the Broncos' management company runs it and books its concerts.",
  },
  {
    team: "KC", name: "GEHA Field at Arrowhead Stadium", structure: "publicTeam", roof: "open", opened: 1972, capacity: 76_416,
    owner: "Jackson County Sports Complex Authority", operator: "Kansas City Chiefs", leaseThrough: 2030,
    rent: 1 * M, eventShare: 0.85, gameDayShare: 1, naming: 3 * M, namingShare: 1, upkeep: 15 * M, debt: 3 * M,
    fixed: [],
    note: "Jackson County owns Arrowhead and the Chiefs run it. The lease ends after the 2030 season, and the Chiefs have announced a move to a new domed stadium in Kansas.",
  },
  {
    team: "LV", name: "Allegiant Stadium", structure: "publicTeam", roof: "dome", opened: 2020, capacity: 65_000,
    owner: "Las Vegas Stadium Authority", operator: "LV Stadium Events Company (Raiders)", leaseThrough: 2049,
    rent: 0, eventShare: 1, gameDayShare: 1, naming: 20 * M, namingShare: 1, upkeep: 26 * M, debt: 45 * M, collegeTenant: "UNLV",
    fixed: [{ date: "2027-01-25", name: "CFP National Championship", net: 6 * M }, { date: "2026-12-29", name: "Las Vegas Bowl", net: 1.4 * M }],
    note: "Clark County hotel taxes paid $750M and the stadium authority holds title, but the Raiders pay no rent, run the building and keep every dollar of its concerts, fights and bowl games.",
  },
  {
    team: "LAC", name: "SoFi Stadium", structure: "tenant", roof: "dome", opened: 2020, capacity: 70_240,
    owner: "Hollywood Park (Stan Kroenke)", operator: "SoFi Stadium (Kroenke)", leaseThrough: 2040,
    rent: 1, eventShare: 0, gameDayShare: 0.6, naming: 30 * M, namingShare: 0.15, upkeep: 0, debt: 22 * M, partner: "LA",
    fixed: [],
    note: "The Chargers pay $1 a year in rent to the Rams' owner, plus their share of the building's financing through seat licenses. They set their own ticket prices but have no say in the stadium's other events and only a small cut of its sponsorships.",
  },
  {
    team: "LA", name: "SoFi Stadium", structure: "owned", roof: "dome", opened: 2020, capacity: 70_240,
    owner: "Hollywood Park (Stan Kroenke)", operator: "SoFi Stadium (Kroenke)", rent: 0, eventShare: 1, gameDayShare: 1,
    naming: 30 * M, namingShare: 0.85, upkeep: 40 * M, debt: 150 * M, partner: "LAC",
    fixed: [{ date: "2026-12-19", name: "LA Bowl", net: 1.2 * M }],
    note: "Stan Kroenke built the most expensive stadium in the world with private money and owns it outright. He books every concert and event, collects from the Chargers as a tenant, and carries the debt.",
  },
  {
    team: "DAL", name: "AT&T Stadium", structure: "publicTeam", roof: "retractable", opened: 2009, capacity: 80_000,
    owner: "City of Arlington", operator: "Dallas Cowboys", leaseThrough: 2039,
    rent: 2 * M, eventShare: 1, gameDayShare: 1, naming: 19 * M, namingShare: 1, upkeep: 30 * M, debt: 30 * M,
    fixed: [{ date: CCG, name: "Big 12 Championship Game", net: 3 * M }, { date: "2027-01-01", name: "Cotton Bowl (CFP quarterfinal)", net: 4 * M }],
    note: "Arlington holds title and paid about a third of the cost, but the Cowboys built it, run it, and keep everything it makes, from the Cotton Bowl to concerts and fights.",
  },
  {
    team: "PHI", name: "Lincoln Financial Field", structure: "publicTeam", roof: "open", opened: 2003, capacity: 69_879,
    owner: "City of Philadelphia", operator: "Philadelphia Eagles", leaseThrough: 2032,
    rent: 1 * M, eventShare: 0.85, gameDayShare: 1, naming: 7 * M, namingShare: 1, upkeep: 14 * M, debt: 6 * M, collegeTenant: "TEM",
    fixed: [],
    note: "The city owns it and the Eagles run it, sharing it with Temple.",
  },
  {
    team: "WAS", name: "Northwest Stadium", structure: "owned", roof: "open", opened: 1997, capacity: 62_000,
    owner: "Washington Commanders", operator: "Washington Commanders", rent: 0, eventShare: 1, gameDayShare: 1,
    naming: 6 * M, namingShare: 1, upkeep: 22 * M, debt: 5 * M,
    fixed: [],
    note: "Privately built in Landover in 1997 and owned by the team. The Commanders are building a new stadium at the old RFK site in Washington for 2030.",
  },
  {
    team: "CHI", name: "Soldier Field", structure: "publicAuthority", roof: "open", opened: 1924, capacity: 61_500,
    owner: "Chicago Park District", operator: "ASM Global for the Park District", leaseThrough: 2033,
    rent: 6.5 * M, eventShare: 0.05, gameDayShare: 0.6, naming: 0, namingShare: 0, upkeep: 2 * M, debt: 0, mls: "Chicago Fire",
    fixed: [],
    note: "The Park District owns and runs Soldier Field. The Bears pay rent, can't sell naming rights, and get almost nothing from its other events, which is why they bought land to build their own.",
  },
  {
    team: "DET", name: "Ford Field", structure: "publicTeam", roof: "dome", opened: 2002, capacity: 65_000,
    owner: "Detroit/Wayne County Stadium Authority", operator: "Detroit Lions", leaseThrough: 2032,
    rent: 0.5 * M, eventShare: 0.9, gameDayShare: 1, naming: 2 * M, namingShare: 1, upkeep: 14 * M, debt: 4 * M,
    fixed: [{ date: "2026-12-26", name: "GameAbove Sports Bowl", net: 0.8 * M }],
    note: "Publicly owned, built largely by the Lions, and run by them. The dome makes it a year-round building for concerts, Supercross and basketball.",
  },
  {
    team: "GB", name: "Lambeau Field", structure: "publicTeam", roof: "open", opened: 1957, capacity: 81_441,
    owner: "City of Green Bay and the Green Bay/Brown County Professional Football Stadium District", operator: "Green Bay Packers", leaseThrough: 2031,
    rent: 1 * M, eventShare: 0.95, gameDayShare: 1, naming: 0, namingShare: 0, upkeep: 20 * M, debt: 4 * M,
    fixed: [],
    note: "The city and a county stadium district own Lambeau; the Packers run it and its Titletown district. The stadium carries no corporate name, and the season-ticket waiting list runs for decades.",
  },
  {
    team: "MIN", name: "U.S. Bank Stadium", structure: "publicAuthority", roof: "dome", opened: 2016, capacity: 66_860,
    owner: "Minnesota Sports Facilities Authority", operator: "ASM Global for the MSFA", leaseThrough: 2046,
    rent: 8 * M, eventShare: 0.1, gameDayShare: 0.9, naming: 9 * M, namingShare: 1, upkeep: 4 * M, debt: 25 * M,
    fixed: [],
    note: "The state authority owns and runs the building and books everything but Vikings games. The Vikings keep their game-day money and the naming rights, pay yearly rent, and repay the share of construction they financed.",
  },
  {
    team: "ATL", name: "Mercedes-Benz Stadium", structure: "publicTeam", roof: "retractable", opened: 2017, capacity: 71_000,
    owner: "Georgia World Congress Center Authority", operator: "AMB Sports & Entertainment (Arthur Blank)", leaseThrough: 2047,
    rent: 0, eventShare: 1, gameDayShare: 1, naming: 12 * M, namingShare: 1, upkeep: 22 * M, debt: 40 * M, mls: "Atlanta United",
    fixed: [{ date: CCG, name: "SEC Championship Game", net: 3.5 * M }, { date: "2027-01-01", name: "Peach Bowl (CFP quarterfinal)", net: 4 * M }],
    note: "The state convention authority owns it; Arthur Blank's company runs it and keeps its income. It hosts Atlanta United, the SEC title game and the Peach Bowl, and is known for its low \"fan first\" concession prices.",
  },
  {
    team: "CAR", name: "Bank of America Stadium", structure: "owned", roof: "open", opened: 1996, capacity: 74_867,
    owner: "Tepper Sports & Entertainment", operator: "Tepper Sports & Entertainment", leaseThrough: 2039,
    rent: 0, eventShare: 1, gameDayShare: 1, naming: 7 * M, namingShare: 1, upkeep: 24 * M, debt: 12 * M, mls: "Charlotte FC",
    fixed: [{ date: CCG, name: "ACC Championship Game", net: 2.5 * M }, { date: "2026-12-28", name: "Duke's Mayo Bowl", net: 1.2 * M }],
    note: "Built with private money on city land and owned by the team. Charlotte put up $650M for renovations in exchange for the Panthers staying through 2039.",
  },
  {
    team: "NO", name: "Caesars Superdome", structure: "publicAuthority", roof: "dome", opened: 1975, capacity: 73_208,
    owner: "Louisiana Stadium and Exposition District", operator: "ASM Global for the state", leaseThrough: 2035,
    rent: 0, eventShare: 0.1, gameDayShare: 0.9, naming: 10 * M, namingShare: 0.6, upkeep: 3 * M, debt: 0,
    fixed: [{ date: "2026-11-28", name: "Bayou Classic", net: 1.6 * M }, { date: "2027-01-15", name: "Sugar Bowl (CFP semifinal)", net: 4.5 * M }],
    note: "The state owns and runs the Superdome and books its Sugar Bowls, Final Fours and festivals. The Saints play under a lease with state subsidies and get a small share of other events.",
  },
  {
    team: "TB", name: "Raymond James Stadium", structure: "publicTeam", roof: "open", opened: 1998, capacity: 65_618,
    owner: "Tampa Sports Authority", operator: "Tampa Sports Authority, with the Buccaneers", leaseThrough: 2028,
    rent: 3.5 * M, eventShare: 0.8, gameDayShare: 1, naming: 6 * M, namingShare: 1, upkeep: 6 * M, debt: 0, collegeTenant: "USF",
    fixed: [{ date: "2026-12-23", name: "Gasparilla Bowl", net: 0.8 * M }, { date: "2027-01-01", name: "ReliaQuest Bowl", net: 1.5 * M }],
    note: "The Tampa Sports Authority owns and staffs it, but the Buccaneers' lease is famously generous: they keep naming rights, suites and most income from other events while the public covers most costs.",
  },
  {
    team: "ARI", name: "State Farm Stadium", structure: "publicAuthority", roof: "retractable", opened: 2006, capacity: 63_400,
    owner: "Arizona Sports and Tourism Authority", operator: "Arizona Sports and Tourism Authority", leaseThrough: 2036,
    rent: 1 * M, eventShare: 0.35, gameDayShare: 0.9, naming: 8 * M, namingShare: 1, upkeep: 10 * M, debt: 6 * M,
    fixed: [{ date: "2026-12-30", name: "Fiesta Bowl (CFP quarterfinal)", net: 4 * M }],
    note: "The state tourism authority owns the stadium and controls its calendar, from the Fiesta Bowl to concerts. The Cardinals handle much of the day-to-day under their agreement and take a share of other events.",
  },
  {
    team: "SF", name: "Levi's Stadium", structure: "publicTeam", roof: "open", opened: 2014, capacity: 68_500, curfew: true,
    owner: "Santa Clara Stadium Authority (City of Santa Clara)", operator: "Forty Niners Stadium Management Company", leaseThrough: 2053,
    rent: 25 * M, eventShare: 0.55, gameDayShare: 1, naming: 11 * M, namingShare: 1, upkeep: 20 * M, debt: 50 * M,
    fixed: [],
    note: "The city's stadium authority owns it; the 49ers run it and repay most of the construction debt. A city curfew limits weeknight events, and the team and the city have fought for years over non-NFL event money.",
  },
  {
    team: "SEA", name: "Lumen Field", structure: "publicTeam", roof: "open", opened: 2002, capacity: 68_740,
    owner: "Washington State Public Stadium Authority", operator: "First & Goal Inc. (Seahawks ownership)", leaseThrough: 2032,
    rent: 1 * M, eventShare: 0.9, gameDayShare: 1, naming: 8 * M, namingShare: 1, upkeep: 14 * M, debt: 3 * M, mls: "Seattle Sounders",
    fixed: [],
    note: "The state stadium authority owns it; the Seahawks' ownership runs it through First & Goal and keeps most of its income, including Sounders matches.",
  },
];

export const STADIUM_BY_TEAM: Record<string, Stadium> = Object.fromEntries(STADIUMS.map((s) => [s.team, s]));

/** What the owner can do with the building, by structure. */
export interface Control {
  /** Book concerts and other events. "partner": needs the co-owner's yes; "approval": the landlord can say no. */
  booking: "full" | "partner" | "approval" | "none";
  /** Set concession prices on game days. */
  concessions: boolean;
  /** Set parking prices on game days. */
  parking: boolean;
}

export function controlOf(s: Stadium): Control {
  switch (s.structure) {
    case "owned": return { booking: "full", concessions: true, parking: true };
    case "coowned": return { booking: "partner", concessions: true, parking: true };
    case "publicTeam": return { booking: "approval", concessions: true, parking: true };
    case "publicAuthority": return { booking: "none", concessions: false, parking: false };
    case "tenant": return { booking: "none", concessions: false, parking: false };
  }
}

/**
 * Each team's market, for the 2026 season: how strong ticket demand is, the
 * average general seat price per game for season-ticket holders, the share of
 * general seats held by season-ticket holders, yearly suite and club income,
 * the average parking charge, and our estimate of total 2026 revenue (the
 * local sponsorship line is set so a typical season lands near it).
 */
export interface Market {
  pull: number;
  ticket: number;
  stShare: number;
  premium: number;
  parking: number;
  target: number;
}

export const MARKETS: Record<string, Market> = {
  BUF: { pull: 1.1, ticket: 125, stShare: 0.88, premium: 60 * M, parking: 40, target: 760 * M },
  MIA: { pull: 0.92, ticket: 140, stShare: 0.7, premium: 85 * M, parking: 45, target: 780 * M },
  NE: { pull: 1.05, ticket: 175, stShare: 0.86, premium: 100 * M, parking: 60, target: 880 * M },
  NYJ: { pull: 0.95, ticket: 150, stShare: 0.8, premium: 95 * M, parking: 45, target: 820 * M },
  NYG: { pull: 1.0, ticket: 155, stShare: 0.85, premium: 105 * M, parking: 45, target: 860 * M },
  BAL: { pull: 1.08, ticket: 135, stShare: 0.88, premium: 60 * M, parking: 50, target: 760 * M },
  CIN: { pull: 0.95, ticket: 110, stShare: 0.75, premium: 40 * M, parking: 35, target: 690 * M },
  CLE: { pull: 1.02, ticket: 115, stShare: 0.85, premium: 45 * M, parking: 40, target: 730 * M },
  PIT: { pull: 1.1, ticket: 135, stShare: 0.92, premium: 55 * M, parking: 50, target: 760 * M },
  HOU: { pull: 0.98, ticket: 125, stShare: 0.8, premium: 75 * M, parking: 40, target: 790 * M },
  IND: { pull: 0.97, ticket: 115, stShare: 0.8, premium: 50 * M, parking: 40, target: 730 * M },
  JAX: { pull: 1.0, ticket: 100, stShare: 0.8, premium: 30 * M, parking: 30, target: 690 * M },
  TEN: { pull: 0.93, ticket: 120, stShare: 0.75, premium: 45 * M, parking: 40, target: 730 * M },
  DEN: { pull: 1.08, ticket: 140, stShare: 0.9, premium: 65 * M, parking: 45, target: 760 * M },
  KC: { pull: 1.15, ticket: 150, stShare: 0.93, premium: 65 * M, parking: 50, target: 790 * M },
  LV: { pull: 1.0, ticket: 185, stShare: 0.65, premium: 105 * M, parking: 60, target: 840 * M },
  LAC: { pull: 0.82, ticket: 150, stShare: 0.55, premium: 75 * M, parking: 60, target: 760 * M },
  LA: { pull: 0.92, ticket: 165, stShare: 0.7, premium: 135 * M, parking: 60, target: 920 * M },
  DAL: { pull: 1.2, ticket: 170, stShare: 0.85, premium: 210 * M, parking: 75, target: 1_350 * M },
  PHI: { pull: 1.12, ticket: 150, stShare: 0.92, premium: 75 * M, parking: 50, target: 830 * M },
  WAS: { pull: 0.95, ticket: 140, stShare: 0.75, premium: 70 * M, parking: 50, target: 800 * M },
  CHI: { pull: 1.12, ticket: 170, stShare: 0.9, premium: 60 * M, parking: 55, target: 820 * M },
  DET: { pull: 1.08, ticket: 130, stShare: 0.88, premium: 55 * M, parking: 40, target: 760 * M },
  GB: { pull: 1.2, ticket: 125, stShare: 0.97, premium: 45 * M, parking: 30, target: 790 * M },
  MIN: { pull: 1.02, ticket: 135, stShare: 0.85, premium: 65 * M, parking: 40, target: 740 * M },
  ATL: { pull: 0.95, ticket: 105, stShare: 0.8, premium: 80 * M, parking: 35, target: 770 * M },
  CAR: { pull: 0.93, ticket: 120, stShare: 0.78, premium: 55 * M, parking: 40, target: 740 * M },
  NO: { pull: 1.02, ticket: 125, stShare: 0.85, premium: 55 * M, parking: 40, target: 730 * M },
  TB: { pull: 0.97, ticket: 120, stShare: 0.8, premium: 55 * M, parking: 40, target: 740 * M },
  ARI: { pull: 0.88, ticket: 105, stShare: 0.7, premium: 50 * M, parking: 35, target: 710 * M },
  SF: { pull: 1.02, ticket: 180, stShare: 0.82, premium: 120 * M, parking: 60, target: 850 * M },
  SEA: { pull: 1.05, ticket: 140, stShare: 0.88, premium: 60 * M, parking: 50, target: 760 * M },
};

/** Teams that sell tickets on the road: their visits lift demand. */
export const DRAW: Record<string, number> = {
  DAL: 1.18, KC: 1.15, PIT: 1.12, GB: 1.12, SF: 1.08, PHI: 1.08, CHI: 1.06, NE: 1.05, BUF: 1.05, DET: 1.05, LV: 1.04, NYG: 1.03, BAL: 1.03,
};

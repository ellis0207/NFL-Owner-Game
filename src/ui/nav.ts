// The sidebar's map of the club: every page, grouped by the part of the job it
// belongs to. Page names are the ones the guide and the Today page use, so a
// page keeps its name wherever it is listed.
export const NAV = [
  { id: "home", label: "Desk", pages: ["Today", "Calendar", "Inbox", "Media"] },
  { id: "team", label: "Team", pages: ["Football", "Roster", "Schedule", "Game week", "Camp", "Clubhouse", "Staff", "Stats", "Analytics"] },
  { id: "moves", label: "Roster building", pages: ["Contracts", "Cap", "Free agents", "Trades"] },
  { id: "draft", label: "Draft", pages: ["College", "Scouting", "Draft"] },
  { id: "office", label: "Owner's office", pages: ["Owner", "Front office", "Business", "Reports", "Agreements", "Legal"] },
  { id: "league", label: "League", pages: ["Standings", "League", "Owners", "History"] },
  { id: "game", label: "Game", pages: ["Settings", "Guide", "Save"] },
] as const;

export type Screen = (typeof NAV)[number]["pages"][number];
export type NavGroup = (typeof NAV)[number];

export const SCREENS: readonly Screen[] = NAV.flatMap((g) => g.pages as readonly Screen[]);

/** What a page is called in the sidebar when its short name needs help. */
export const PAGE_LABEL: Partial<Record<Screen, string>> = {
  Football: "Overview",
  League: "Scoreboard",
};

/** A line on what each page holds, for page search and the page header. */
export const PAGE_HINT: Record<Screen, string> = {
  Today: "What needs you today",
  Calendar: "The league calendar, month by month",
  Inbox: "Messages from your staff and the league",
  Media: "Coverage of the club and press questions",
  Football: "The roster's outlook, health and next opponents",
  Roster: "The 53, practice squad and reserve lists",
  Schedule: "This season's games",
  "Game week": "Practice reports and the game plan",
  Camp: "Training camp battles and reps",
  Clubhouse: "Chemistry, leaders, development and medical",
  Staff: "Coaches, scouts and searches",
  Stats: "Player and team statistics",
  Analytics: "The analytics department and game plans",
  Contracts: "Talks, extensions and the market",
  Cap: "Cap space, the five-year plan and cash",
  "Free agents": "The open market and street free agents",
  Trades: "Offers, the trade block and picks",
  College: "College football, teams and polls",
  Scouting: "Assignments and scouting reports",
  Draft: "The draft room and boards",
  Owner: "Your goals, money and standing",
  "Front office": "Executives, memos, meetings and culture",
  Business: "Books, tickets, sponsors, stadium and markets",
  Reports: "Saved reports and briefings",
  Agreements: "Agreements and the archive",
  Legal: "Compliance and legal matters",
  Standings: "Division standings and playoff seeds",
  League: "Scores around the league",
  Owners: "Fellow owners, votes and labor",
  History: "Seasons, records and the Hall of Fame",
  Settings: "Play and display settings",
  Guide: "How the rules and the money work",
  Save: "Save, load and quit",
};

export function groupOf(s: Screen): NavGroup {
  return NAV.find((g) => (g.pages as readonly Screen[]).includes(s))!;
}

export function pageLabel(s: Screen): string {
  return PAGE_LABEL[s] ?? s;
}

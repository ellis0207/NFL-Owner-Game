// The game's version, what changed in it, and where its facts come from. The
// About page, the title screen and the one-time "what's new" notice read this.

export const VERSION = "1.1";
export const RELEASED = "2026-11-25";

/** What changed in this version, in the words the About page and the title screen show. */
export const WHATS_NEW: { title: string; text: string }[] = [
  { title: "Start as far back as 2002", text: "New game now offers every season from 2002, with that year's real rosters, schedule, stadiums, head coaches and cap, each player's real career back to 1999, the records as they stood, and the real draft classes from 2002 on. The 2000s play by their own rules: sudden-death overtime, 45 active on game day, small practice squads, big rookie deals before the wage scale, the uncapped 2010 year and the 2011 lockout." },
  { title: "Stats that hold for a decade", text: "Draft classes now turn out like real ones: first-rounders mostly become starters, day-three picks rarely do, and busts fade. Each position stays on the league's own scale, so 1,000-yard seasons, big sack years and league leaders look like NFL ones ten seasons in. Expanded leagues also schedule and reload reliably." },
  { title: "A quieter inbox", text: "Routine roster moves, practice-squad calls and medical follow-ups now come in the GM's weekly report and the Monday staff notes, so the inbox holds what needs you." },
  { title: "One look, front to back", text: "The title screen, new-game setup, owner's guide and sim overlay match the rest of the game, and phone layouts no longer break words." },
  { title: "A first hour that teaches itself", text: "The tutorial runs 22 lessons, now covering the hourly clock, live games, home-game prices, the locker room and the Stadium Lab. A new game gets a \"Your first season\" card on Today." },
  { title: "Long careers hold up", text: "Players' bodies and craft age the way real ones do, so sacks and interceptions stay at NFL levels for years. CPU extensions have to fit the next two caps, and an owner who keeps signings to themselves gets a free-agency plan to approve." },
  { title: "Sound and game feel", text: "Finals and achievements arrive as notices with a sound. The field view has a crowd and a whistle, and a season recap opens after the Super Bowl. The header has a mute button, and Settings has Off, Low and Full." },
  { title: "Lighter and faster", text: "The page is half its old size because the league's data ships compressed. Seasons sim a little faster, and saves grow more slowly." },
];

/** Where the real league comes from. Each line names the source and what the game takes from it. */
export const SOURCES: { name: string; what: string }[] = [
  { name: "nflverse", what: "Open NFL data: 2026 rosters, player bios and draft history, contracts (gathered from OverTheCap), the schedule, combine testing, weekly player stats since 1999 and snap counts. Historical starts from 2002 to 2025 come from the same files; contracts the archive lacks before about 2011 are estimated by the game." },
  { name: "OverTheCap", what: "Contract details, and each club's 2026 cap space, dead money and adjusted cap (a snapshot from October 27, 2026)." },
  { name: "Pro Football Reference", what: "Career totals, Pro Bowls, first-team All-Pros and Hall of Fame status for every drafted player since 1980, by way of nflverse's draft table." },
  { name: "Pro Football Hall of Fame", what: "Every class from 1963 to 2026 and its enshrinees, plus hand-compiled careers for the people the draft table doesn't reach." },
  { name: "Wikipedia", what: "The 2026 FBS conferences and head coaches, and gaps in the historical record." },
  { name: "Team and venue sites, press coverage", what: "Each club's 2026 coaches, coordinators and general manager; stadium capacities, parking and leases." },
  { name: "OpenStreetMap contributors", what: "The outlines of the land around each stadium in the Stadium Lab and on the Grounds page (© OpenStreetMap contributors, ODbL)." },
];

/** What the game makes up. They're labeled in the code, and listed here so nobody takes them for real. */
export const MADE_UP = [
  "Hidden player, coach and executive ratings, read from real stats and reputations. The owner never sees them.",
  "Agents, reporters, outlets, the Huddle social platform and its accounts.",
  "The commissioner, committee members, minority partners, sponsors' contacts, investors and executives.",
  "Future draft prospects and recruits beyond the real classes, generated coaches, trainers and scouts.",
  "Everything that happens after camps open in July 2026.",
  "In historical starts: most contracts before about 2011 (priced from each player's standing, draft slot and the cap), coordinators, general managers and the preseason schedule.",
];

export const BUILT_WITH = [
  { name: "React", what: "the pages" },
  { name: "three.js", what: "the 3D players on the field view" },
  { name: "Blender", what: "the room pictures, the player models and their moves" },
  { name: "Web Audio", what: "every sound, made in the browser" },
  { name: "Vite and Vitest", what: "the build and the tests" },
  { name: "Stadium Lab", what: "Ellis's 3D stadium designer, built into the game" },
  { name: "Claude Code", what: "written with Anthropic's coding agent" },
];

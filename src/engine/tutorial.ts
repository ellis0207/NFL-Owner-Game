// The tutorial: a practice game started from the title screen that walks the
// owner through every part of the job, one lesson at a time. Each lesson says
// how the system works, asks for one decision, and measures what that decision
// moved: a snapshot of the numbers when the lesson starts, another when it is
// finished, and the numbers now, so the effects that take days (a game, a
// week of practice, a month of fans' memory) show up as the calendar runs.
// Hidden things (trust, mood, the hot seat) are shown as the words the staff
// would use and the direction they moved, never as numbers; players are never
// rated. Tutorial games are not autosaved and earn no achievements.
import { newGame } from "./season";
import { DEFAULT_SETUP } from "./ownership";
import { forceCrossroads } from "./crossroads";
import { forceBoardMeeting } from "./boardroom";
import { forceSale, investors, moodWord } from "./investors";
import { culture, gmTrustWord } from "./culture";
import { fanBase } from "./fans";
import { business, cashBalance, gateForecast, valuation } from "./business";
import { nextHomeGame } from "./ticketing";
import { capSummary } from "./cap";
import { leagueYear } from "./contracts";
import { rosterCount } from "./roster";
import { standings } from "./standings";
import { hotSeat, people } from "./people";
import { EXEC_KEYS, execRole, execs } from "./executives";
import { emphasis, type Emphasis } from "./gameweek";
import { pressTone } from "./media/climate";
import { wouldEarn } from "./achievements";
import { daysBetween } from "./dates";
import { money } from "./inbox";
import type { GameState } from "./types";

const TEAM_DEFAULT = "CHI";
const SEED = 20260;

interface Metric {
  label: string;
  read: (s: GameState) => number;
  show: (n: number) => string;
  /** Hidden from the owner: shown as words and a direction, never a number. */
  hidden?: boolean;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const count = (n: number) => `${Math.round(n)}`;
const morale = (s: GameState) => avg(Object.values(s.players).filter((p) => p.team === s.userTeam && (p.status === "active" || p.status === "camp")).map((p) => p.morale ?? 70));
const moraleWord = (n: number) => (n >= 75 ? "Upbeat" : n >= 62 ? "Settled" : n >= 50 ? "Grumbling" : "Sour");
const fanWord = (n: number) => (n >= 75 ? "They believe in you" : n >= 58 ? "Willing to trust you" : n >= 42 ? "Waiting to be convinced" : n >= 28 ? "Skeptical" : "They've stopped believing");
const seatWord = (n: number) => (n >= 0.75 ? "Coaching for his job" : n >= 0.5 ? "Getting warm" : n >= 0.3 ? "Some grumbling" : "Secure");
const pressWord = (n: number) => (n >= 20 ? "Glowing" : n >= 6 ? "Friendly" : n > -6 ? "Neutral" : n > -20 ? "Critical" : "Savage");
const satisfactionWord = (n: number) => (n >= 70 ? "Happy in the job" : n >= 50 ? "Content" : n >= 35 ? "Restless" : "Looking around");
const EMPH: Emphasis[] = ["balanced", "plan", "fundamentals", "recovery"];
const nextGate = (s: GameState) => { const g = nextHomeGame(s); return g ? gateForecast(s, g) : null; };
const known = (s: GameState) => Object.values(s.college?.scouting.know ?? {}).filter((k) => k >= 60).length;

export const METRICS: Record<string, Metric> = {
  day: { label: "Days into the save", read: (s) => daysBetween(startDate(s), s.date), show: count },
  gmTrust: { label: "The GM", read: (s) => culture(s).gmTrust, show: gmTrustWord, hidden: true },
  morale: { label: "Locker room", read: morale, show: moraleWord, hidden: true },
  fans: { label: "Fans' trust in you", read: (s) => fanBase(s).trust, show: fanWord, hidden: true },
  partners: { label: "Your partners", read: (s) => avg(investors(s).partners.map((p) => p.mood)), show: moodWord, hidden: true },
  roster: { label: "Players under contract (camp or 53)", read: (s) => rosterCount(s, s.userTeam).roster, show: count },
  capSpace: { label: "Cap space this year", read: (s) => capSummary(s, s.userTeam).space, show: money },
  capNext: { label: "Cap space next year", read: (s) => capSummary(s, s.userTeam, leagueYear(s.date) + 1).space, show: money },
  dead: { label: "Dead money this year", read: (s) => capSummary(s, s.userTeam).dead, show: money },
  cash: { label: "Club cash", read: cashBalance, show: money },
  trades: { label: "Trades completed", read: (s) => (s.trades?.log ?? []).filter((t) => t.status === "done" && t.teams.includes(s.userTeam)).length, show: count },
  price: { label: "Single-game ticket price", read: (s) => business(s).prices.single, show: (n) => `$${Math.round(n)}` },
  sold: { label: "Next home game, seats sold (forecast)", read: (s) => nextGate(s)?.sold ?? 0, show: pct },
  gate: { label: "Next home game, ticket revenue (forecast)", read: (s) => nextGate(s)?.tickets ?? 0, show: money },
  parking: { label: "Next home game, parking (forecast)", read: (s) => nextGate(s)?.parking ?? 0, show: money },
  budget: { label: "Department budget levels (sum of six, 0-3 each)", read: (s) => Object.values(business(s).budget).reduce((a, b) => a + b, 0), show: count },
  wins: { label: "Wins this season", read: (s) => standings(s)[s.userTeam]?.w ?? 0, show: count },
  press: { label: "Coverage of the club", read: (s) => pressTone(s, s.userTeam), show: pressWord, hidden: true },
  seat: { label: "The head coach's seat", read: hotSeat, show: seatWord, hidden: true },
  known: { label: "Prospects our scouts know well", read: known, show: count },
  execs: { label: "Executives' satisfaction", read: (s) => avg(EXEC_KEYS.map((k) => execRole(s, k)?.satisfaction).filter((x): x is number => x !== undefined)), show: satisfactionWord, hidden: true },
  bonuses: { label: "Executives with a bonus target", read: (s) => Object.keys(execs(s).bonus ?? {}).length, show: count },
  liquid: { label: "Your own cash (outside the club)", read: (s) => s.owner?.liquid ?? 0, show: money },
  value: { label: "What the club is worth", read: (s) => valuation(s, s.userTeam), show: money },
  emphasis: { label: "This week's practice emphasis", read: (s) => EMPH.indexOf(emphasis(s)), show: (n) => ["Balanced", "Game plan", "Fundamentals", "Recovery"][n] ?? "Balanced" },
  would: { label: "Achievements a real save would have earned", read: (s) => wouldEarn(s).length, show: count },
};

export interface Lesson {
  id: string;
  title: string;
  page: string;
  tab?: string;
  /** How the system works, in two or three sentences. */
  how: string;
  /** The one decision to make. */
  task: string;
  /** What to look for afterwards, and when. */
  watch: string;
  metrics: string[];
  /** Set the lesson up (a decision on the desk); returns a memo id to watch, if any. */
  begin?: (s: GameState) => string | undefined;
  /** Whether the decision has been made, judged against the numbers at the start. */
  done?: (s: GameState, before: Record<string, number>, ref?: string) => boolean;
}

const moved = (...keys: string[]) => (s: GameState, b: Record<string, number>) => keys.some((k) => METRICS[k].read(s) !== b[k]);
const decided = (s: GameState, _b: Record<string, number>, ref?: string) => !!ref && (s.office?.memos ?? []).some((m) => m.id === ref && m.status !== "open");

export const LESSONS: Lesson[] = [
  {
    id: "calendar", title: "The calendar", page: "Today",
    how: "The game runs a day at a time. Each morning Today lists what needs you: decisions, deadlines and problems. What you leave alone, your staff handles in their own way, and the clock moves on.",
    task: "Press the first button at the top of the page: Next day, or Sim rest of day when something is still waiting today (your staff handles it).",
    watch: "The date moves and Today refills. Anything you ignored was decided by your staff; the Inbox says how.",
    metrics: ["day", "cash"], done: moved("day"),
  },
  {
    id: "crossroads", title: "Big calls: the crossroads", page: "Today",
    how: "A few times a year the building splits on a big call. Each person around the table says which way they'd go and what overruling them costs. Whatever you choose, someone loses, and a season later a letter says who was right.",
    task: "A star wants a new deal and the building is split. Open it on Today and decide.",
    watch: "Whoever you overruled trusts you less; whoever you backed, more. These words move right away; the letter comes next May.",
    metrics: ["gmTrust", "morale", "fans", "capNext"],
    begin: (s) => forceCrossroads(s, "star")?.id, done: decided,
  },
  {
    id: "roster", title: "The roster and the cap", page: "Cap",
    how: "Every player's cap hit counts against the salary cap. Cutting a player saves his salary but turns any bonus not yet charged into dead money that still counts. Cash is separate: signing bonuses are paid now even when the cap spreads them out.",
    task: "Release a player you don't need from the Roster page, or sign a street free agent from Free agents.",
    watch: "Roster size, cap space, dead money and cash all move at once. A cut veteran with bonus left shows up as dead money for one or two years.",
    metrics: ["roster", "capSpace", "dead", "cash"], done: moved("roster"),
  },
  {
    id: "contracts", title: "Contracts and extensions", page: "Contracts",
    how: "Agents ask for more than they'll take, and every offer is graded against the market. A long deal with a big bonus keeps this year's cap low and pushes cost into later years.",
    task: "Open talks with one of your players on an expiring deal and agree to an extension, or sign a free agent.",
    watch: "Next year's cap space is where long deals bite. Compare it to this year's.",
    metrics: ["capSpace", "capNext", "cash", "morale"], done: moved("capNext", "capSpace"),
  },
  {
    id: "trades", title: "Trades", page: "Trades",
    how: "Other clubs value players and picks by need, age, cost and their own direction. They counter what they don't like, and a trade carries the dead money a player leaves behind.",
    task: "Make an offer to another club and get a deal done (a counter-offer counts once you accept it).",
    watch: "Cap space changes with the salaries that moved, and the dead money of anyone you sent away lands on your cap.",
    metrics: ["trades", "capSpace", "dead", "roster"], done: moved("trades"),
  },
  {
    id: "tickets", title: "Ticket prices", page: "Business", tab: "Tickets",
    how: "Each home game sells by demand: the opponent, the record, the weather, and what fans think of the price. Raise prices and each seat earns more but fewer sell; fans also remember being squeezed.",
    task: "Change the single-game price and save it.",
    watch: "The forecast for the next home game moves at once. After the game, the books show what really sold, and fans' trust shows whether they felt gouged.",
    metrics: ["price", "sold", "gate", "fans"], done: moved("price"),
  },
  {
    id: "budget", title: "Department budgets", page: "Business", tab: "Budget",
    how: "Six departments (marketing, game day, community, medical, facilities, scouts) each run at a level from 0 to 3. Each level costs money every month and does something you'll only see over time.",
    task: "Raise or cut one department's budget.",
    watch: "Cash moves as the monthly bills land. Medical shows up in how fast players come back; marketing and game day in attendance; scouts in the draft.",
    metrics: ["budget", "cash", "fans"], done: moved("budget"),
  },
  {
    id: "gameday", title: "Game day", page: "Schedule",
    how: "Every game is simulated play by play from the players, the coaches' plans, weather, rest and travel. You can follow your own game drive by drive on the field view, or let it run.",
    task: "Use Sim to game day, then Next day to play it. Watch it from the Schedule if you like.",
    watch: "Wins, gate money, coverage and fans' trust all move with the result.",
    metrics: ["wins", "cash", "press", "fans"], done: (s, b) => daysBetween(startDate(s), s.date) - b.day >= 5 || METRICS.wins.read(s) !== b.wins,
  },
  {
    id: "coach", title: "Backing the coach", page: "Front office", tab: "People",
    how: "The head coach's seat warms with losses, bad press and an impatient owner. A coach on the hot seat coaches scared. A public vote of confidence cools it for four months, and everyone remembers if you fire him anyway.",
    task: "Give the head coach a public vote of confidence.",
    watch: "The seat cools right away. If the team then loses, the press will remind you.",
    metrics: ["seat", "press", "gmTrust"], done: (s) => !!people(s).backed,
  },
  {
    id: "scouting", title: "Scouting the draft", page: "Scouting",
    how: "Your area scouts can only be in so many places. What they see sharpens their read of a prospect; what they don't see stays a guess. The budget runs from camp to the draft.",
    task: "Assign scouts to a region or a prospect, then sim a week.",
    watch: "The number of prospects your scouts know well climbs week by week, and the reports get tighter.",
    metrics: ["known", "cash"], done: moved("known"),
  },
  {
    id: "media", title: "The press", page: "Media", tab: "Press room",
    how: "Reporters cover what you do and what you say. Confident promises are checked against the record; posts and op-eds reach fans directly; a reporter you favor gets leads, one you ban writes worse.",
    task: "Hold a press conference, give an interview or post on the Huddle.",
    watch: "Coverage and fans' trust move over the next days as the stories run. A promise you can't keep comes back a month later.",
    metrics: ["press", "fans"], begin: (s) => JSON.stringify(s.media?.desk?.last ?? {}),
    done: (s, _b, ref) => JSON.stringify(s.media?.desk?.last ?? {}) !== ref,
  },
  {
    id: "board", title: "The board", page: "Ownership", tab: "Board",
    how: "Your partners own part of the club and each wants something: cash, winning or a rising value. Four times a year the board meets and asks for a promise. A pledge is checked at the next meeting; keep it and they warm to you, break it and they remember.",
    task: "A board meeting is on the desk. Make the pledge, present your own plan, or remind them who runs the club.",
    watch: "Partners' mood moves now; if you pledged, the pledge is judged at the next meeting.",
    metrics: ["partners", "gmTrust", "cash"],
    begin: (s) => forceBoardMeeting(s)?.id, done: decided,
  },
  {
    id: "bonus", title: "Executive bonuses", page: "Front office", tab: "Executives",
    how: "A bonus target tells an executive what you'll pay for a good year. The target makes them work harder all year; the bonus is paid, or missed, at the year-end review.",
    task: "Set a bonus target for one executive.",
    watch: "Satisfaction lifts right away. The payment or the miss lands at the review.",
    metrics: ["bonuses", "execs", "cash"], done: moved("bonuses"),
  },
  {
    id: "money", title: "Your own money", page: "Business", tab: "Overview",
    how: "Your money and the club's are separate. You can put your own cash in when the club runs short, take distributions when it's flush, and invest the rest. Partners share in distributions.",
    task: "Put some of your own money into the club, or take some out, on the Business overview.",
    watch: "Your own cash and the club's move in opposite directions.",
    metrics: ["liquid", "cash", "partners"], done: moved("liquid"),
  },
  {
    id: "grounds", title: "Parking and the grounds", page: "Business", tab: "Grounds",
    how: "Fans arrive by car, transit or on foot. Cars park in your lots or someone else's; only your own spaces pay you. Leasing a lot costs a yearly fee and earns on every home game.",
    task: "Lease a lot near the stadium.",
    watch: "The next home game's parking forecast goes up; the lease shows in the books.",
    metrics: ["parking", "cash"], done: moved("parking"),
  },
  {
    id: "gameweek", title: "Game week practice", page: "Game week",
    how: "Each week the coaches practice with an emphasis: the game plan, fundamentals, recovery or a balance. Game plan helps Sunday, fundamentals helps growth, recovery cuts practice injuries.",
    task: "Pick an emphasis for the week.",
    watch: "Sunday's plan, injuries in practice and young players' growth all lean the way you chose.",
    metrics: ["emphasis", "morale"], done: moved("emphasis"),
  },
  {
    id: "league", title: "The other owners", page: "Owners",
    how: "Rules, schedules and money are voted on by the 32 owners. Relationships decide votes: back a fellow owner's rule and he'll remember. The March meeting is when most of it happens.",
    task: "Read through the Owners page: your relations, the rules on the table and the clubs' profiles. Mark it done when you're ready.",
    watch: "Votes you lobby for later depend on the relations you see here.",
    metrics: ["value"],
  },
  {
    id: "settings", title: "Difficulty and settings", page: "Settings",
    how: "Difficulty sets how hard other clubs bargain, how sharp your scouts' reads are, how wild the economy runs and how much setbacks cost you in trust. Realism switches like the cap rules are there too.",
    task: "Look over the settings. Mark it done when you're ready.",
    watch: "In a real save, the difficulty you chose is recorded with each achievement.",
    metrics: [],
  },
  {
    id: "finish", title: "Pins and achievements", page: "Achievements",
    how: "Pin the pages you use most with the Pin button at the top of each page; they collect in a Pinned group at the top of the sidebar. Achievements mark the milestones of an ownership; practice games don't earn them.",
    task: "Pin a page you'll use often, then look over the achievements.",
    watch: "The count below is what a real save would already have earned from what you've done here.",
    metrics: ["would"],
  },
];

function startDate(s: GameState): string {
  return s.tutorial?.start ?? s.date;
}

function snapshot(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, m] of Object.entries(METRICS)) {
    try { out[k] = m.read(s); } catch { out[k] = 0; }
  }
  return out;
}

/** A practice game: a fixed club and seed, standard difficulty, and a minority partner so the board has someone in it. */
export function newTutorial(team = TEAM_DEFAULT): GameState {
  const s = newGame(team, "Tutorial owner", { capRules: "real", finances: "real", scouting: "real", difficulty: "standard" } as GameState["settings"], SEED, DEFAULT_SETUP);
  forceSale(s, 0.2, "secondary");
  s.tutorial = { lesson: 0, start: s.date, marks: {} };
  startLesson(s, 0);
  return s;
}

/** Open a lesson: take the before snapshot and put its decision on the desk. */
export function startLesson(s: GameState, i: number): void {
  const t = s.tutorial;
  if (!t || !LESSONS[i]) return;
  t.lesson = i;
  const l = LESSONS[i];
  if (t.marks[l.id]) return;
  const ref = l.begin?.(s);
  t.marks[l.id] = { before: snapshot(s), ...(ref ? { ref } : {}) };
}

/** Finish the current lesson (decided or marked done) and move to the next. */
export function finishLesson(s: GameState, how: "made" | "skipped"): void {
  const t = s.tutorial;
  if (!t) return;
  const l = LESSONS[t.lesson];
  const m = t.marks[l.id];
  if (m && !m.done) { m.after = snapshot(s); m.done = how; }
  if (t.lesson + 1 < LESSONS.length) startLesson(s, t.lesson + 1);
}

export interface LessonRow { label: string; before: string; after?: string; now: string; dir: "up" | "down" | "same"; hidden: boolean }

/** What the coach panel shows for a lesson: whether it's done, and each measure before, at the decision and now. */
export function lessonView(s: GameState, i: number): { lesson: Lesson; ready: boolean; rows: LessonRow[]; done?: string } {
  const lesson = LESSONS[i];
  const mark = s.tutorial?.marks[lesson.id];
  const before = mark?.before ?? {};
  let ready = false;
  try { ready = !!mark && (!!mark.done || (!!lesson.done && lesson.done(s, before, mark.ref))); } catch { ready = false; }
  const rows = lesson.metrics.map((k) => {
    const m = METRICS[k];
    let now = 0;
    try { now = m.read(s); } catch { now = 0; }
    const b = before[k] ?? now;
    const eps = Math.max(1e-6, Math.abs(b) * 1e-4);
    return {
      label: m.label, before: m.show(b), now: m.show(now), hidden: !!m.hidden,
      ...(mark?.after ? { after: m.show(mark.after[k] ?? now) } : {}),
      dir: (now - b > eps ? "up" : b - now > eps ? "down" : "same") as LessonRow["dir"],
    };
  });
  return { lesson, ready, rows, done: mark?.done };
}

// Owner calls that come around again and again, each with the staff's
// forecast and, afterward, what actually happened.
//
// Home games: five days before each home game the revenue staff brings a
// price for that game alone, with what each choice should sell and bring in.
// After the game the gate is set against the forecast (business.ts,
// `homeGate`). A club whose prices are delegated has the staff make the call.
//
// The budget review: each spring, after the books close, the CFO sets last
// season's department spending against what it bought: ticket and sponsor
// money for marketing and game day, the fan base for marketing and the
// community, and the football side for the training room and the building.
// The staff proposes changes; the forecast goes in the decisions log and is
// checked a season later (causes.ts).
//
// Free agency: when the owner keeps every signing, the GM asks each
// February how the owner wants to run the market. A real GM never sits out a
// free agency, so an owner who never answers gets the GM working within the
// owner's limits; otherwise an absent owner's club lets every contract run out
// and plays the season with a roster of minimum deals.
import { business, cashBalance, deptCost, DEPTS, gateForecast, inflation, pnl, setBudget, BUDGET_LEVELS } from "./business";
import { cause, revenueNow } from "./causes";
import { localIncome } from "./commerce";
import { leagueYear } from "./contracts";
import { addDays, shortDate } from "./dates";
import { addMemo, mode, openMemos, setMode } from "./delegation";
import { signer } from "./executives";
import { money } from "./inbox";
import { RULES, SCHEDULE, teamLabel } from "./league";
import { gmOf, pendingFreeAgents, plannedSpace } from "./offseason";
import { tix } from "./ticketing";
import type { Dept, GameState, Memo, ScheduledGame } from "./types";

const M = 1_000_000;
/** Days before a home game that its price call lands on the desk. */
const LEAD = 5;
/** What a fan spends inside the building beyond the ticket (food, parking, the store), our share, in 2026 dollars. */
const PER_HEAD = 22;

// ---- Home-game prices ----

const round = (x: number) => Math.round(x * 100) / 100;

/** The staff's read on a price for one game: gate money, plus what the crowd spends, less the goodwill a steep price burns. */
function gameValue(state: GameState, g: ScheduledGame, mult: number): { mult: number; tickets: number; sold: number; capacity: number; heat: number; value: number } {
  const f = gateForecast(state, g, mult);
  const value = f.tickets + f.attendance * PER_HEAD * inflation(RULES.season, 0.03) - Math.max(0, mult - 1.2) * 3 * M;
  return { mult, tickets: f.tickets, sold: f.sold, capacity: f.capacity, heat: f.heat, value };
}

/** The choices for a home game: the staff's pick, today's price and a move the other way, each with its forecast. */
export function gameChoices(state: GameState, g: ScheduledGame): ReturnType<typeof gameValue>[] {
  const now = business(state).prices.single;
  const grid = [...new Set([0.85, 0.92, 1, 1.08, 1.16, 1.25].map((k) => round(Math.max(0.6, Math.min(1.8, now * k)))))];
  const rows = grid.map((m) => gameValue(state, g, m));
  const best = rows.reduce((a, b) => (b.value > a.value + 1 ? b : a), rows.find((r) => r.mult === round(now)) ?? rows[0]);
  const hold = rows.find((r) => r.mult === round(now)) ?? gameValue(state, g, now);
  if (best.mult === hold.mult) {
    const up = rows.find((r) => r.mult === round(Math.min(1.8, now * 1.16))) ?? gameValue(state, g, round(now * 1.16));
    const down = rows.find((r) => r.mult === round(Math.max(0.6, now * 0.85))) ?? gameValue(state, g, round(now * 0.85));
    return [hold, up, down];
  }
  const other = best.mult > now ? rows.find((r) => r.mult === round(Math.max(0.6, now * 0.85)))! : rows.find((r) => r.mult === round(Math.min(1.8, now * 1.16)))!;
  return [best, hold, other ?? hold];
}

const pct = (x: number) => `${x >= 1 ? "+" : ""}${Math.round((x - 1) * 100)}%`;

function nextGameToPrice(state: GameState): ScheduledGame | undefined {
  const day = addDays(state.date, LEAD);
  return SCHEDULE.find((g) => g.home === state.userTeam && !g.neutral && (g.type === "PRE" || g.type === "REG") && g.date === day && !state.results[g.id]);
}

function gameCall(state: GameState, g = nextGameToPrice(state), force = false): Memo | undefined {
  if (!g) return;
  if (openMemos(state).some((m) => m.payload?.gamePrice === g.id)) return;
  const how = force ? "decide" : mode(state, "pricing");
  const opts = gameChoices(state, g);
  const t = tix(state);
  if (how === "delegate") {
    t.game = { id: g.id, mult: opts[0].mult, forecast: opts[0].tickets };
    return;
  }
  const now = business(state).prices.single;
  const opp = teamLabel(g.home === state.userTeam ? g.away! : g.home!);
  const f = opts.find((o) => o.mult === round(now)) ?? opts[0];
  const singles = Math.max(0, f.capacity - business(state).holders);
  const label = (o: (typeof opts)[number]) => (o.mult === round(now) ? "Keep today's price" : `${o.mult > now ? "Raise" : "Cut"} this game ${pct(o.mult / now)}`);
  const effect = (o: (typeof opts)[number]) => `Forecast: about ${o.sold.toLocaleString("en-US")} of ${o.capacity.toLocaleString("en-US")} seats sold and ${money(o.tickets)} in ticket money` +
    (o.mult > 1.2 ? ". Fans notice prices this high." : o.sold < o.capacity * 0.9 ? ". Empty seats show on TV." : ".");
  return addMemo(state, {
    kind: "general", area: "pricing", from: signer(state, "CRO"), title: `Tickets for ${opp} on ${shortDate(g.date)}`,
    problem: `${g.type === "PRE" ? "A preseason game" : "A regular-season home game"} against the ${opp}. ` +
      `At today's prices single-game demand runs about ${Math.round(f.heat * 100)}% of the seats we have left for sale${singles ? ` (about ${singles.toLocaleString("en-US")} after season tickets)` : ""}.`,
    proposal: label(opts[0]),
    options: opts.map((o) => ({ label: label(o), effect: effect(o), evidence: "estimate" as const })),
    risks: ["The forecast is made today; a loss this week or bad weather moves it.", "Season tickets are already sold: only single-game buyers see this price."],
    budget: `Ticket money for this game: about ${money(opts[0].tickets)} on the staff's pick.`,
    recommend: 0, deadline: addDays(state.date, LEAD - 1), ifLate: "Today's single-game price stays.",
    payload: { gamePrice: g.id, mults: opts.map((o) => o.mult), forecasts: opts.map((o) => o.tickets) },
  });
}

/** The tutorial's price call: the next home game still to play, on the desk now whatever the delegation. */
export function forceGameCall(state: GameState): string | undefined {
  const g = SCHEDULE.find((x) => x.home === state.userTeam && !x.neutral && (x.type === "PRE" || x.type === "REG") && x.date > state.date && !state.results[x.id]);
  return gameCall(state, g, true)?.id;
}

/** The owner's answer to a home-game price call (memos.ts hands it here). */
export function resolveGameCall(state: GameState, m: Memo, choice: number): string | null {
  const id = m.payload?.gamePrice as string;
  const mults = m.payload?.mults as number[];
  const forecasts = m.payload?.forecasts as number[];
  if (!id || !mults?.[choice] || state.results[id]) return null;
  tix(state).game = { id, mult: mults[choice], forecast: forecasts[choice], memo: m.id };
  return null;
}

// ---- The budget review ----

/** Departments whose money shows up on the revenue lines, and the ones whose return is on the field or in the fan base. */
const MONEY_DEPTS: Dept[] = ["marketing", "gameday"];
const ALL_DEPTS: Dept[] = ["marketing", "gameday", "community", "medical", "facilities", "scouts"];

function homeGames(): ScheduledGame[] {
  return SCHEDULE.filter((g) => g.type === "REG" && !g.neutral && g.home !== undefined);
}

/** Last season's gates and local sponsors with one department at another level, everything else as it was. */
function revenueAt(state: GameState, dept: Dept, level: number): number {
  const b = business(state);
  const before = b.budget[dept];
  b.budget[dept] = level;
  let total = 0;
  try {
    for (const g of homeGames()) if (g.home === state.userTeam) { const f = gateForecast(state, g); total += f.tickets + f.premium; }
    total += localIncome(state).sponsors;
  } finally {
    b.budget[dept] = before;
  }
  return total;
}

/** What a department costs at a level over a year. */
function yearlyCost(state: GameState, dept: Dept, level: number): number {
  const year = leagueYear(state.date);
  const games = DEPTS[dept].perGame ? homeGames().filter((g) => g.home === state.userTeam).length : 1;
  return deptCost(dept, level, year) * games;
}

/** The fan base a level builds or lets wear, valued as the ticket money it holds up in later seasons. */
function lasting(dept: Dept, level: number, tickets: number): number {
  const k = dept === "marketing" ? 0.02 : dept === "gameday" ? 0.015 : dept === "community" ? 0.006 : 0;
  return (level - 1) * k * tickets;
}

export interface DeptReturn {
  dept: Dept;
  level: number;
  /** Money the next level up would add and cost a year; and the level down. */
  up?: { revenue: number; cost: number };
  down?: { revenue: number; cost: number };
  line: string;
}

/** Each department's return by the staff's numbers, from last season's games. */
export function deptReturns(state: GameState): DeptReturn[] {
  const b = business(state);
  const year = leagueYear(state.date) - 1;
  const p = pnl(state, year);
  const tickets = p.revenue.find((r) => r.cat === "tickets")?.amount ?? 0;
  return ALL_DEPTS.map((dept) => {
    const level = b.budget[dept];
    const out: DeptReturn = { dept, level, line: "" };
    if (MONEY_DEPTS.includes(dept)) {
      const here = revenueAt(state, dept, level);
      if (level < 3) out.up = { revenue: revenueAt(state, dept, level + 1) - here + lasting(dept, level + 1, tickets) - lasting(dept, level, tickets), cost: yearlyCost(state, dept, level + 1) - yearlyCost(state, dept, level) };
      if (level > 0) out.down = { revenue: revenueAt(state, dept, level - 1) - here + lasting(dept, level - 1, tickets) - lasting(dept, level, tickets), cost: yearlyCost(state, dept, level - 1) - yearlyCost(state, dept, level) };
      const u = out.up, d = out.down;
      out.line = `${DEPTS[dept].label} (${BUDGET_LEVELS[level].toLowerCase()}): ` +
        (u ? `a level up would cost ${money(u.cost)} and bring back about ${money(u.revenue)}` : "already at the top") +
        (d ? `; a level down saves ${money(-d.cost)} and gives up about ${money(-d.revenue)}` : "") + ".";
    } else {
      const what: Record<string, string> = {
        community: "The foundation and the club's work in town: fan trust and the fan base grow a little every year it's funded, and the city remembers it in lease talks.",
        medical: "The training room: how fast injured players get back, and how many get hurt at all.",
        facilities: "The team's building: the coaches' mood and what free agents see on their visits.",
        scouts: "College scouting: how true the draft reports are.",
      };
      out.line = `${DEPTS[dept].label} (${BUDGET_LEVELS[level].toLowerCase()}, ${money(yearlyCost(state, dept, level))} a year): ${what[dept]}`;
    }
    return out;
  });
}

/** The staff's plan: move a money department a level where the return beats the cost; keep the football side off the bottom. */
function staffPlan(state: GameState, rows: DeptReturn[]): Partial<Record<Dept, number>> {
  const plan: Partial<Record<Dept, number>> = {};
  const tight = cashBalance(state) < 25 * M;
  for (const r of rows) {
    if (r.up && !tight && r.up.revenue > r.up.cost * 1.1) plan[r.dept] = r.level + 1;
    // A cut has to save clearly more than it gives up (both are negative here).
    else if (r.down && r.down.cost < r.down.revenue * 1.1) plan[r.dept] = r.level - 1;
    else if ((r.dept === "medical" || r.dept === "facilities") && r.level === 0 && !tight) plan[r.dept] = 1;
  }
  return plan;
}

function budgetReview(state: GameState): void {
  const year = leagueYear(state.date);
  const o = state.office;
  if (!o || o.memos.some((m) => m.payload?.budget === year)) return;
  const b = business(state);
  const rows = deptReturns(state);
  const plan = staffPlan(state, rows);
  const changes = Object.entries(plan) as [Dept, number][];
  const net = (lv: Partial<Record<Dept, number>>) => {
    let n = 0;
    for (const r of rows) {
      const to = lv[r.dept];
      if (to === undefined || to === r.level) continue;
      const step = to > r.level ? r.up : r.down;
      if (step) n += step.revenue - step.cost;
      else n -= yearlyCost(state, r.dept, to) - yearlyCost(state, r.dept, r.level);
    }
    return n;
  };
  const lean = Object.fromEntries(rows.filter((r) => r.level > 0).map((r) => [r.dept, r.level - 1])) as Partial<Record<Dept, number>>;
  const leanSaves = rows.reduce((t, r) => t + (r.level > 0 ? yearlyCost(state, r.dept, r.level) - yearlyCost(state, r.dept, r.level - 1) : 0), 0);
  const leanLoses = rows.reduce((t, r) => t - (r.level > 0 && r.down ? r.down.revenue : 0), 0);
  const options: Memo["options"] = [];
  const plans: Partial<Record<Dept, number>>[] = [];
  if (changes.length) {
    options.push({ label: "The staff's plan", effect: changes.map(([d, l]) => `${DEPTS[d].label} to ${BUDGET_LEVELS[l].toLowerCase()}`).join("; ") + `. About ${money(net(plan))} a year better by the staff's numbers.`, evidence: "estimate" });
    plans.push(plan);
  }
  options.push({ label: "Keep every budget where it is", effect: "Nothing changes; the departments carry on as they did last season.", evidence: "estimate" });
  plans.push({});
  options.push({ label: "A lean year: every department down a level", effect: `Saves about ${money(leanSaves)} this year. The staff thinks the revenue lines give back ${money(leanLoses)} of it, and the training room, the building and the scouts slip with it.`, evidence: "opinion" });
  plans.push(lean);
  addMemo(state, {
    kind: "general", area: "pricing", from: signer(state, "CFO"), title: `${year} department budgets`,
    problem: `The ${year - 1} books are closed. Here is what each department cost and what it bought, by the staff's numbers from last season's games. ` + rows.map((r) => r.line).join(" "),
    proposal: changes.length ? options[0].effect : "Keep the budgets where they are.",
    options,
    risks: ["The returns are estimates from last season; a winning or losing year moves the revenue lines more than any budget.", "Cuts to the training room and the building show up on the field, not in the books."],
    budget: `Departments cost ${money(rows.reduce((t, r) => t + yearlyCost(state, r.dept, r.level), 0))} at today's levels.`,
    recommend: 0, deadline: addDays(state.date, 14), ifLate: "Budgets stay where they are.",
    payload: { budget: year, plans, levels: Object.fromEntries(ALL_DEPTS.map((d) => [d, b.budget[d]])) },
  });
}

/** The owner's answer to the budget review (memos.ts hands it here). */
export function resolveBudgetMemo(state: GameState, m: Memo, choice: number): string | null {
  const plans = m.payload?.plans as Partial<Record<Dept, number>>[] | undefined;
  const plan = plans?.[choice];
  if (!plan) return null;
  const rows = deptReturns(state);
  let est = 0;
  for (const [d, lv] of Object.entries(plan) as [Dept, number][]) {
    const r = rows.find((x) => x.dept === d);
    const step = r && (lv > r.level ? r.up : r.down);
    if (step && r) est += step.revenue;
    setBudget(state, d, lv);
  }
  if (Object.keys(plan).length) {
    const label = m.options[choice].label;
    cause(state, "budgets", `Department budgets: ${label.toLowerCase()}`, [m.options[choice].effect], undefined, {
      metric: "Revenue change on the year (tickets, premium, concessions, sponsors)", unit: "money",
      low: est - 4 * M, mid: est, high: est + 4 * M, attribution: "weak", option: label, measure: "revenue", baseline: revenueNow(state),
    });
  }
  return null;
}

export function ownerCallsDaily(state: GameState): void {
  if (!state.business || !state.office) return;
  gameCall(state);
  // Spring, two weeks into the league year: the books are closed and the season's numbers are in.
  if (state.date === addDays(RULES.keyDates.newLeagueYear, 14)) budgetReview(state);
  if (state.date === RULES.keyDates.franchiseTagWindowOpens) freeAgencyPlan(state);
}

/** The GM's February question to an owner who keeps every signing: who runs free agency this year? */
function freeAgencyPlan(state: GameState): Memo | undefined {
  if (state.tutorial || mode(state, "signings") !== "owner") return;
  const team = state.userTeam;
  const pending = pendingFreeAgents(state, team);
  const space = plannedSpace(state, team);
  const year = RULES.season + 1;
  return addMemo(state, {
    kind: "general", area: "signings", from: gmOf(team), title: `How we run ${year} free agency`,
    problem: `${pending.length} of our players come off contract when the league year opens on ${shortDate(RULES.keyDates.newLeagueYear)}, ` +
      `and we project ${money(space)} of ${year} cap space before re-signings and the draft class. Right now every offer has to come from you.`,
    proposal: "Let me work the market within your limits and report each signing.",
    options: [
      { label: "I'll handle it myself", effect: "Nothing goes out unless you make the offer. Players we don't re-sign leave when the league year opens.", evidence: "confirmed" },
      { label: "Bring me each offer", effect: "The GM builds offers and each one waits on your desk; an offer you leave goes nowhere.", evidence: "confirmed" },
      { label: "Run it within my limits", effect: "The GM re-signs and signs players within your contract and guarantee limits and reports each deal. You can take it back in the Front office.", evidence: "confirmed" },
    ],
    budget: `${money(space)} of projected ${year} cap space.`,
    risks: ["A club that sits out free agency loses its own free agents and fills the roster with minimum deals.", "The GM spends to the team's needs, not to your taste in players."],
    recommend: 2, deadline: addDays(RULES.keyDates.negotiatingWindowOpens, -1),
    ifLate: "The GM runs free agency within your limits.",
    payload: { faPlan: year },
  });
}

/** The owner's answer on free agency, or the GM's default when none came. */
export function resolveFaPlan(state: GameState, _m: Memo, choice: number): string | null {
  if (choice === 1) setMode(state, "signings", "approve");
  if (choice === 2) setMode(state, "signings", "delegate");
  return null;
}

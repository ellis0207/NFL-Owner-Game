// The boardroom: what the owner owes the people who own the rest of the club,
// and what the owner asks of the people who run it.
//
// - Each partner has a goal for the league year that follows from what they
//   care about (crossroads.ts `partnerWants`): money back, a winning team, or
//   a club that is worth more. The Ownership page shows how each one stands.
// - Four times a year (the 20th of January, April, July and October, after
//   the quarterly report) the board meets. The partners whose goals are
//   furthest behind set the agenda and ask for a promise the owner can be held
//   to at the next meeting: a distribution, a winning record, spending to the
//   cap, or no new debt. The owner pledges, presents a plan instead, or cuts
//   the meeting short, with the GM and the CFO on the record either way.
// - A pledge is checked when the next meeting opens. Kept, the partners who
//   asked trust the owner more; broken, they say so and it gets out.
// - Executive bonus targets: the owner can put a share of each executive's
//   salary on a review score. A bonus sharpens the department a little all
//   year (`bonusBoost` in executives.ts); at the review it is paid or missed,
//   and a stretch target missed stings more than an easy one.
import { cashBalance, ownerCash, post, valuation } from "./business";
import { reserveTarget } from "./books";
import { capSummary } from "./cap";
import { leagueYear } from "./contracts";
import { execVoice, gmVoice, partnersVoice, partnerWants, settleVoices, WANTS_WORD, type Wants } from "./crossroads";
import { addDays, shortDate } from "./dates";
import { totalDebt } from "./debt";
import { addMemo } from "./delegation";
import { EXEC_ROLES, execRole, execs } from "./executives";
import { money, news, send } from "./inbox";
import { RULES, TEAM_BY_ID } from "./league";
import { investors, moodWord, partnerReturn, pctText } from "./investors";
import { standings, winPct } from "./standings";
import type { BoardroomState, ExecRole, GameState, Memo, Partner, Pledge, Voice } from "./types";

const M = 1_000_000;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

export function boardroom(state: GameState): BoardroomState {
  return (state.boardroom ??= { meetings: [], pledges: [], marks: {}, kept: 0, broken: 0 });
}

const MEETING_MONTHS = ["01", "04", "07", "10"];

/** The next board meeting after a date: the 20th of the next quarter's first month. */
export function nextMeeting(date: string): string {
  let y = Number(date.slice(0, 4));
  for (let i = 0; i < 6; i++) {
    for (const mo of MEETING_MONTHS) {
      const d = `${y}-${mo}-20`;
      if (d > date) return d;
    }
    y++;
  }
  return addDays(date, 91);
}

// ---- Partners' goals ----

/** Where a partner's year started: their distributions and the club's value at the turn of the league year. */
function markOf(state: GameState, p: Partner): { dist: number; value: number } {
  const m = state.boardroom?.marks[p.id];
  return m && m.year === leagueYear(state.date) ? m : { dist: p.distributions, value: valuation(state, state.userTeam) };
}

/** How far into the league year we are, 0 to 1 (the league year opens in mid-March). */
function yearGone(state: GameState): number {
  const open = RULES.keyDates.newLeagueYear;
  const start = state.date >= open ? open : addDays(open, -365);
  return Math.max(0.1, Math.min(1, (Date.parse(state.date) - Date.parse(start)) / (365 * 86400000)));
}

export interface PartnerGoal { want: Wants; text: string; status: string; met: boolean }

/** Each partner's goal for the league year and how it stands, in the words their side would use. */
export function partnerGoal(state: GameState, p: Partner): PartnerGoal {
  const want = partnerWants(state, p);
  const mark = markOf(state, p);
  if (want === "cash") {
    // A fund's model assumes about 2% of the stake's value back each year.
    const goal = Math.max(1 * M, Math.round(partnerReturn(state, p).value * 0.02 / (0.1 * M)) * 0.1 * M);
    const got = p.distributions - mark.dist;
    return { want, text: `At least ${money(goal)} back this league year`, status: `${money(got)} so far`, met: got >= goal * Math.max(0, yearGone(state) - 0.25) - 1 };
  }
  if (want === "winning") {
    const r = standings(state)[state.userTeam];
    const games = r ? r.w + r.l + r.t : 0;
    const wp = games ? winPct(r.w, r.l, r.t) : 0.5;
    return { want, text: "A winning record", status: games ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "No games yet", met: wp >= 0.5 };
  }
  const now = valuation(state, state.userTeam);
  const target = mark.value * (1 + 0.08 * yearGone(state));
  const up = mark.value ? now / mark.value - 1 : 0;
  return { want, text: "Club value up 8% this league year", status: `${up >= 0 ? "Up" : "Down"} ${Math.abs(up * 100).toFixed(1)}% so far`, met: now >= target - 25 * M };
}

// ---- Pledges ----

function partnerDistributions(state: GameState): number {
  return investors(state).partners.reduce((t, p) => t + p.distributions, 0);
}
function partnersPct(state: GameState): number {
  return investors(state).partners.reduce((t, p) => t + p.pct, 0);
}

/** Season is on: from the opener through the last regular-season game. */
function inSeason(state: GameState): boolean {
  return state.date >= addDays(RULES.keyDates.regularSeasonStart, -14) && state.date <= RULES.keyDates.regularSeasonEnd;
}

/** The promise the board asks for, by what the partners asking want. */
function pledgeFor(state: GameState, want: Wants): Omit<Pledge, "made" | "status"> {
  const due = nextMeeting(state.date);
  if (want === "cash") {
    const amount = Math.max(5 * M, Math.round(valuation(state, state.userTeam) * 0.006 / M) * M);
    return { kind: "payout", due, target: amount, want, base: partnerDistributions(state), text: `Pay out ${money(amount)} to the owners before ${shortDate(due)}` };
  }
  if (want === "winning") {
    if (inSeason(state) || state.date.slice(5) < "02-01") return { kind: "winning", due, target: 0.5, want, base: 0, text: "A winning record at the next meeting" };
    const cap = capSummary(state, state.userTeam);
    return { kind: "payroll", due, target: Math.round(cap.limit * 0.05), want, base: 0, text: `Spend to within ${money(cap.limit * 0.05)} of the cap by ${shortDate(due)}` };
  }
  return { kind: "value", due, target: 0, want, base: totalDebt(state), text: `No new debt, and cash above the reserve, at the next meeting` };
}

/** Whether a pledge would be kept if it were checked today. */
export function pledgeOnTrack(state: GameState, p: Pledge): boolean {
  if (p.kind === "payout") return partnerDistributions(state) - p.base >= p.target * partnersPct(state) - 1;
  if (p.kind === "winning") {
    const r = standings(state)[state.userTeam];
    return !!r && r.w + r.l + r.t > 0 && winPct(r.w, r.l, r.t) >= 0.5;
  }
  if (p.kind === "payroll") return capSummary(state, state.userTeam).space <= p.target;
  return totalDebt(state) <= p.base * 1.01 + 1 * M && cashBalance(state) >= reserveTarget(state);
}

export function openPledge(state: GameState): Pledge | undefined {
  return state.boardroom?.pledges.find((p) => p.status === "open");
}

/** A pledge comes due: kept or broken, and the partners who asked for it react hardest. */
function judgePledge(state: GameState, pl: Pledge): string {
  const b = boardroom(state);
  const kept = pledgeOnTrack(state, pl);
  pl.status = kept ? "kept" : "broken";
  for (const p of investors(state).partners) {
    const asked = partnerWants(state, p) === pl.want;
    p.mood = clamp(p.mood + (kept ? (asked ? 6 : 2) : asked ? -10 : -4));
    if (!kept && asked) p.complaints += 1;
  }
  if (kept) {
    b.kept++;
    send(state, "business", "The board", "Pledge kept", `You told the board: "${pl.text}." You did. The partners noticed.`);
    return `Last meeting's pledge was kept: "${pl.text}."`;
  }
  b.broken++;
  send(state, "business", "The board", "Pledge broken", `You told the board: "${pl.text}." It didn't happen. The partners who asked for it are saying so, to each other and to their friends.`);
  state.inbox[0].priority = 3;
  if (b.broken >= 2) news(state, "ownership", `Friction in the ${TEAM_BY_ID[state.userTeam].name} ownership group: limited partners say the controlling owner has broken promises to the board, according to people familiar with the group`);
  return `Last meeting's pledge was broken: "${pl.text}." ${b.broken} broken, ${b.kept} kept.`;
}

// ---- The meeting ----

/** The want with the most stake behind it, counting double for partners whose goal is behind or who are unhappy. */
function boardAsk(state: GameState): Wants {
  const weight: Partial<Record<Wants, number>> = {};
  for (const p of investors(state).partners) {
    const g = partnerGoal(state, p);
    weight[g.want] = (weight[g.want] ?? 0) + p.pct * (g.met ? 0.5 : 1.5) * (p.mood < 50 ? 1.3 : 1);
  }
  return (Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "cash") as Wants;
}

function period(date: string): string {
  return `Q${MEETING_MONTHS.indexOf(date.slice(5, 7)) + 1 || 1} ${date.slice(0, 4)}`;
}

function holdBoardMeeting(state: GameState, opening: string[]): Memo | null {
  const s = investors(state);
  if (!s.partners.length) return null;
  const b = boardroom(state);
  const ask = boardAsk(state);
  const pl = pledgeFor(state, ask);
  const cash = cashBalance(state);
  const reserve = reserveTarget(state);
  // What the CFO thinks the club can promise.
  const affordable = pl.kind === "payout" ? cash - pl.target >= reserve * 1.2
    : pl.kind === "winning" ? pledgeOnTrack(state, { ...pl, made: state.date, status: "open" })
    : pl.kind === "payroll" ? cash >= reserve * 1.3
    : cash >= reserve;
  const lines = [
    ...opening,
    "Around the table:",
    ...s.partners.map((p) => {
      const g = partnerGoal(state, p);
      return `${p.name} (${pctText(p.pct)}): cares about ${WANTS_WORD[g.want]}. Goal: ${g.text} (${g.status}, ${g.met ? "on track" : "behind"}). ${moodWord(p.mood)}.`;
    }),
  ];
  if (b.broken > b.kept) lines.push(`They remember the record: ${b.broken} pledge${b.broken === 1 ? "" : "s"} broken, ${b.kept} kept.`);
  const g = gmVoice(state), cfo = execVoice(state, "CFO");
  const gmSide = pl.kind === "winning" || pl.kind === "payroll" ? 0 : 1;
  const voices: Voice[] = [
    { kind: "gm", who: g.who, role: "General manager", side: gmSide,
      says: gmSide === 0 ? `"Promise them wins and let me spend. That's a promise I want to be held to."` : pl.kind === "payout" ? `"That's money out of football. Every dollar paid out is a signing bonus I can't fund."` : `"Freezing the debt freezes us. Tell them a plan, not a promise."`,
      ifOverruled: "The GM tells the coaches the owner is managing to the partners." },
    { kind: "exec", who: cfo.who, role: "CFO", side: affordable ? 0 : 1,
      says: affordable ? `"We can carry that. If you promise it, I'll make sure we keep it."` : `"Don't promise what we can't keep. We have ${money(cash)} against a ${money(reserve)} reserve. A broken pledge costs more than no pledge."`,
      ifOverruled: affordable ? "The CFO has to explain to the partners why the owner wouldn't commit." : "The CFO's notes will show they advised against it." },
  ];
  const pv = partnersVoice(state, (w) => (w === ask ? 0 : 1),
    (lead) => partnerWants(state, lead) === ask ? `"We're not asking for much. ${pl.text}. Say it, and do it."` : `"Show us a plan. Promises are cheap."`,
    "Partners who leave the room unhappy start talking to bankers about their stakes.");
  if (pv) voices.unshift(pv);
  const lead = [...s.partners].sort((a, b2) => b2.pct - a.pct)[0];
  const deadline = addDays(state.date, 10);
  const m = addMemo(state, {
    kind: "general", area: "financing", from: `The board (${lead.name} chairing)`,
    title: `${period(state.date)} board meeting`,
    problem: lines.join("\n"),
    proposal: `The board asks for a promise: "${pl.text}."`,
    options: [
      { label: "Make the pledge", effect: `"${pl.text}." Checked at the next meeting (${shortDate(pl.due)}). Kept, the partners who asked trust you more; broken, they won't forget, and it gets out.` },
      { label: "Present your own plan", effect: "No promise. Each partner judges you by their own goal: on track, they're satisfied; behind, they're less so." },
      { label: "Remind them who runs the club", effect: "A short meeting. Every partner leaves less happy, and they remember it at the next vote on a reserved matter." },
    ],
    risks: ["A broken pledge does more harm than no pledge.", "Unhappy partners complain, then ask out, and their stakes go to buyers you didn't choose."],
    budget: pl.kind === "payout" ? `${money(pl.target)} of the club's ${money(cash)}.` : "No cost today; the promise has its own price.",
    recommend: affordable ? 0 : 1, conditions: "The CFO's view.",
    deadline, ifLate: "The meeting goes on without you. The partners take it as being brushed off.",
    voices, stakes: `The people who own ${pctText(partnersPct(state))} of the club want to hear what you'll promise them.`,
    payload: { board: true, ask, pledge: pl },
  });
  b.meetings.unshift({ date: state.date, period: period(state.date), ask: pl.text, lines });
  b.meetings = b.meetings.slice(0, 12);
  return m;
}

/** The owner's answer to the board. */
export function resolveBoardMemo(state: GameState, m: Memo, choice: number): string | null {
  const b = boardroom(state);
  const pl = m.payload?.pledge as Omit<Pledge, "made" | "status"> | undefined;
  if (!pl) return null;
  if (choice === 0) {
    for (const x of b.pledges) if (x.status === "open") x.status = "broken";
    b.pledges.unshift({ ...pl, made: state.date, status: "open" });
    b.pledges = b.pledges.slice(0, 16);
  } else if (choice === 1) {
    // A plan is judged against each partner's own goal, and against the owner's record of keeping promises.
    const doubt = b.broken > b.kept ? -2 : 0;
    for (const p of investors(state).partners) p.mood = clamp(p.mood + (partnerGoal(state, p).met ? 2 : -2) + doubt);
  }
  settleVoices(state, m, choice);
  const row = b.meetings.find((x) => x.date <= state.date && x.ask === pl.text);
  if (row) row.choice = m.options[choice].label;
  return null;
}

/** Nobody from the owner's side showed up: the board takes it as being told who runs the club. */
export function lapseBoardMemo(state: GameState, m: Memo): void {
  for (const p of investors(state).partners) p.mood = clamp(p.mood - 3);
  resolveBoardMemo(state, m, 2);
}

/** Pay a pledged distribution now (the Ownership page's button): the usual rules on cash and covenants apply. */
export function payPledge(state: GameState): string | null {
  const pl = openPledge(state);
  if (!pl || pl.kind !== "payout") return "No payout pledge is open.";
  const owed = Math.max(0, Math.round(pl.target - (partnerDistributions(state) - pl.base) / Math.max(0.01, partnersPct(state))));
  if (owed <= 0) return "Already paid.";
  return ownerCash(state, -owed);
}

// ---- Executive bonuses ----

export const BONUS_PCTS = [0, 0.1, 0.25, 0.5];
export const BONUS_TARGETS = [50, 60, 70, 80];

/** The owner sets (or clears, at 0%) an executive's bonus target for the year. */
export function setExecBonus(state: GameState, role: ExecRole, pct: number, target: number): string | null {
  if (!BONUS_PCTS.includes(pct) || !BONUS_TARGETS.includes(target)) return "Pick one of the listed amounts and targets.";
  const x = execs(state);
  x.bonus ??= {};
  const before = x.bonus[role];
  if (!pct) delete x.bonus[role];
  else x.bonus[role] = { pct, target };
  // Taking money off the table mid-year is noticed.
  const e = execRole(state, role);
  if (e && before && (pct < before.pct || target > before.target)) e.satisfaction = clamp(e.satisfaction - 3);
  return null;
}

/** At the review: the bonus is paid or missed. Returns the line for the review memo. */
export function settleExecBonus(state: GameState, role: ExecRole, score: number): string {
  const bonus = state.execs?.bonus?.[role];
  const e = execRole(state, role);
  if (!bonus || !e?.contract) return "";
  if (score >= bonus.target) {
    const amount = Math.round(e.contract.salary * bonus.pct / 1000) * 1000;
    post(state, "businessOps", -amount, `${EXEC_ROLES[role].label} bonus`);
    e.satisfaction = clamp(e.satisfaction + 4 + e.hidden.ambition / 25);
    return ` Bonus earned (target ${bonus.target}): ${money(amount)}.`;
  }
  // A stretch target missed stings; an easy one missed is on them.
  e.satisfaction = clamp(e.satisfaction - (bonus.target >= 70 ? 3 + e.hidden.ambition / 25 : 2));
  return ` Bonus missed (target ${bonus.target}).`;
}

// ---- The day ----

export function boardroomDaily(state: GameState): void {
  if (state.tenure && state.tenure.role !== "control") return;
  const s = state.investors;
  if (!s?.partners.length) return;
  const b = boardroom(state);
  const year = leagueYear(state.date);
  for (const p of s.partners) {
    const mk = b.marks[p.id];
    if (!mk || mk.year !== year) b.marks[p.id] = { year, dist: p.distributions, value: valuation(state, state.userTeam) };
  }
  if (state.date.slice(8) !== "20" || !MEETING_MONTHS.includes(state.date.slice(5, 7))) return;
  const opening: string[] = [];
  for (const pl of b.pledges) if (pl.status === "open" && pl.due <= state.date) opening.push(judgePledge(state, pl));
  holdBoardMeeting(state, opening);
}

/** Tests: hold the board meeting today, whatever the calendar says. */
export function forceBoardMeeting(state: GameState): Memo | null {
  const opening: string[] = [];
  for (const pl of boardroom(state).pledges) if (pl.status === "open" && pl.due <= state.date) opening.push(judgePledge(state, pl));
  return holdBoardMeeting(state, opening);
}

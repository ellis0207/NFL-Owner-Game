// The organization's people over time: who could step into each key job,
// promotions from within (scouts, analysts, quality-control coaches),
// coaching agreements with partial guarantees and playoff incentives, how
// secure the head coach feels, what each person remembers about how the
// owner treated them, working conditions, the cost of an owner who reaches
// into everything, what happens when the GM or president changes, mandates
// for the executives, and the owner's calendar. The quality-control coaches
// and anything they remember are made up.
import { AREAS, noteDecision } from "./delegation";
import { achievement } from "./standing";
import { madePlayoffs } from "./incentives";
import { holdMeeting } from "./memos";
import { analysts } from "./analysts";
import { business, post } from "./business";
import { extendStaff } from "./carousel";
import { newPerson, staff } from "./coaches";
import { leagueYear } from "./contracts";
import { culture } from "./culture";
import { addDays, daysBetween } from "./dates";
import { EXEC_KEYS, EXEC_ROLES, deputy, execRole, execs } from "./executives";
import { money, news, send } from "./inbox";
import { RULES, TEAM_BY_ID } from "./league";
import { owner } from "./ownership";
import { hireRoom, ROOM_TITLE } from "./positionCoaches";
import { gaussian, rngFor } from "./rng";
import { scoutOps } from "./scoutops";
import { replaceScout, scouts } from "./scouts";
import { standings } from "./standings";
import { teamStaff } from "./staff";
import type { CoachRoom, DecisionArea, ExecRole, GameState } from "./types";

const QC_SALARY = 160_000;

export type Mandate = "winNow" | "build" | "profit" | "invest" | "stability" | "growth";
export const MANDATES: Record<Mandate, { label: string; what: string }> = {
  winNow: { label: "Win now", what: "Spend and trade for this season." },
  build: { label: "Build for later", what: "Draft, develop and keep future cap room." },
  profit: { label: "Hit the profit target", what: "Costs at or under budget, revenue at or over." },
  invest: { label: "Invest in the business", what: "Spend where it grows revenue, even over budget." },
  stability: { label: "Keep the staff together", what: "Low turnover and few incidents." },
  growth: { label: "Grow revenue", what: "New partners, more events, higher sales." },
};

export interface Memory { date: string; text: string; w: number }
export interface CalendarItem { date: string; kind: "meeting" | "stadium" | "public" | "league"; note: string; done?: boolean }

export interface PeopleState {
  /** Quality-control coaches on our staff (person ids in the staff file). */
  qc: string[];
  /** Named successors by job ("HC", "OC", "DC", "GM" or an executive role): the person's id or exec id. */
  successors: Record<string, string>;
  /** What people remember about the owner, by name, newest first. */
  memory: Record<string, Memory[]>;
  promotions: { date: string; who: string; from: string; to: string }[];
  mandates: Partial<Record<ExecRole | "GM", Mandate>>;
  /** Coaching playoff incentives settled, by season. */
  incentives: number[];
  /** The GM and president in their jobs last we looked, to notice changes. */
  gm?: string;
  pres?: string;
  calendar: CalendarItem[];
  /** The management meeting's topics, in the order the owner wants them. */
  agenda: string[];
  /** The owner publicly backed the head coach until this date. */
  backed?: { coach: string; until: string };
}

export function people(state: GameState): PeopleState {
  return (state.people ??= { qc: [], successors: {}, memory: {}, promotions: [], mandates: {}, incentives: [], calendar: [], agenda: [] });
}

// ---- Memory ----

/** Someone remembers how the owner treated them: positive weights for being backed, negative for being overruled or misled. */
export function remember(state: GameState, who: string, text: string, w: number): void {
  if (!who) return;
  const p = people(state);
  const list = (p.memory[who] ??= []);
  list.unshift({ date: state.date, text, w });
  p.memory[who] = list.slice(0, 12);
}

/** How someone feels about the owner from what they remember, fading over two years: about -10 to +10. */
export function regard(state: GameState, who: string): number {
  const list = state.people?.memory[who] ?? [];
  return Math.max(-10, Math.min(10, list.reduce((t, m) => t + m.w * Math.max(0, 1 - daysBetween(m.date, state.date) / 730), 0)));
}

export function memoryOf(state: GameState, who: string): Memory[] {
  return state.people?.memory[who] ?? [];
}

// ---- Micromanagement and working conditions ----

/**
 * How much the owner reaches into work they delegated, 0 to 1: their own
 * decisions in delegated areas and follow-up questions in the last four
 * months. Overcontrol slows the staff and wears out good managers.
 */
export function micromanagement(state: GameState): number {
  const o = state.office;
  if (!o) return 0;
  const since = addDays(state.date, -120);
  const labels = new Map(Object.entries(AREAS).map(([k, a]) => [a.label.toLowerCase(), k as DecisionArea]));
  const n = o.trail.filter((t) => t.date >= since && t.by === "Owner" && ((labels.has(t.area) && o.modes[labels.get(t.area)!] === "delegate") || t.area === "follow-up")).length;
  return Math.min(1, n / 12);
}

export interface Conditions { staffing: number; workload: number; resources: number; wellbeing: number; notes: string[] }

/** Staffing, hours, resources and well-being in the building, 0 to 100 each (shown in words). */
export function workingConditions(state: GameState): Conditions {
  const notes: string[] = [];
  const vacancies = state.execs ? EXEC_KEYS.filter((r) => !EXEC_ROLES[r].optional && !execRole(state, r)).length : 0;
  const cuts = Object.values(state.treasury?.cuts ?? {}).reduce((t, c) => t + (c ?? 0), 0);
  const staffing = Math.max(0, 80 - vacancies * 12 - cuts * 120);
  if (vacancies) notes.push(`${vacancies} senior job${vacancies > 1 ? "s" : ""} open; deputies are covering.`);
  if (cuts > 0) notes.push("Recent layoffs left the remaining staff covering more.");
  const inSeason = state.date >= RULES.keyDates.regularSeasonStart && state.date <= RULES.keyDates.superBowl;
  const memos = state.office ? state.office.memos.filter((m) => m.status === "open").length : 0;
  const workload = Math.max(0, 75 - (inSeason ? 15 : 0) - Math.max(0, memos - 3) * 4 - micromanagement(state) * 20);
  if (inSeason) notes.push("In season the football side works seven-day weeks.");
  const b = state.business;
  const levels = b ? (b.budget.marketing + b.budget.medical + b.budget.facilities + b.budget.scouts) / 4 : 1.5;
  const resources = Math.max(0, Math.min(100, 40 + levels * 18 + (state.culture?.development ?? 1) * 6));
  const wellbeing = Math.round((staffing + workload + resources) / 3);
  return { staffing: Math.round(staffing), workload: Math.round(workload), resources: Math.round(resources), wellbeing, notes };
}

export function conditionWord(v: number): string {
  return v >= 70 ? "Good" : v >= 55 ? "Adequate" : v >= 40 ? "Strained" : "Poor";
}

// ---- Quality-control coaches ----

export function qcCoaches(state: GameState) {
  const s = staff(state);
  return people(state).qc.map((id) => s.people[id]).filter((c) => c && !c.retired && c.job?.team === state.userTeam && !c.job.room);
}

/** Add a quality-control coach: film breakdown and self-scouting for the coordinators, and a coach in the making. */
export function hireQc(state: GameState, side: "offense" | "defense"): string | null {
  const p = people(state);
  if (qcCoaches(state).length >= 6) return "Six quality-control coaches is all the staff room holds.";
  const s = staff(state);
  const rng = rngFor(state.seed, `qc:${p.qc.length}:${state.date}`);
  const taken = new Set(Object.values(s.people).map((c) => c.name));
  const c = newPerson(state, rng, taken, {
    track: "coach", side, age: 25 + Math.floor(rng() * 6), salt: `qc${state.date}${p.qc.length}`, mean: 52, sd: 8,
    job: { kind: "assistant", title: `${side === "offense" ? "Offensive" : "Defensive"} quality control`, team: state.userTeam }, background: "Graduate assistant",
  });
  c.contract = { through: RULES.season + 1, salary: QC_SALARY };
  s.people[c.id] = c;
  p.qc.push(c.id);
  noteDecision(state, "coaching staff", `Hired ${c.name} as a quality-control coach`, QC_SALARY, "Owner", "owner");
  return null;
}

export function releaseQc(state: GameState, id: string): void {
  const p = people(state);
  const c = staff(state).people[id];
  if (c) { c.job = undefined; delete c.contract; }
  p.qc = p.qc.filter((x) => x !== id);
}

/** The coordinators' plan edge from quality-control work: a little per coach, more from good ones (plan points). */
export function qcBonus(state: GameState): number {
  const qc = qcCoaches(state);
  return Math.min(0.8, qc.reduce((t, c) => t + 0.1 + ((c.hidden.development ?? 55) - 55) / 200, 0));
}

/** How ready a quality-control coach looks to run a room, in words (never the number). */
export function qcReadiness(state: GameState, id: string): string {
  const c = staff(state).people[id];
  if (!c) return "";
  const years = RULES.season - c.hiredYear;
  const v = (c.hidden.development ?? 55) + years * 3 + gaussian(rngFor(state.seed, `qcread:${id}:${RULES.season}`)) * 4;
  return v >= 66 ? "Ready to run a room" : v >= 58 ? "A year or two away" : "Still learning";
}

/** Promote a quality-control coach to lead a position room on his side of the ball. */
export function promoteQc(state: GameState, id: string, room: CoachRoom): string | null {
  const c = staff(state).people[id];
  if (!c || !people(state).qc.includes(id)) return "He isn't one of our quality-control coaches.";
  const offense: CoachRoom[] = ["QB", "RB", "WR", "TE", "OL"];
  if (room !== "ST" && (c.side === "offense") !== offense.includes(room)) return "That room is on the other side of the ball.";
  hireRoom(state, state.userTeam, room, id);
  people(state).qc = people(state).qc.filter((x) => x !== id);
  promoted(state, c.name, "quality control", ROOM_TITLE[room]);
  return null;
}

function promoted(state: GameState, who: string, from: string, to: string): void {
  const p = people(state);
  p.promotions.unshift({ date: state.date, who, from, to });
  p.promotions = p.promotions.slice(0, 40);
  remember(state, who, `Promoted to ${to.toLowerCase()}`, 4);
  noteDecision(state, "promotions", `${who}: ${from} to ${to}`, undefined, "Owner", "owner");
}

// ---- Promotions in scouting and analytics ----

/** An area scout becomes the national scout; his area goes to a new hire. */
export function promoteScout(state: GameState, id: string): string | null {
  const s = scouts(state).staff.find((x) => x.id === id);
  if (!s) return "Not one of our area scouts.";
  const ops = scoutOps(state);
  const old = ops.national.name;
  ops.national = { name: s.name, eye: Math.min(90, s.eye + 2), since: RULES.season };
  replaceScout(state, id);
  post(state, "scouts", -60_000, `Raise for ${s.name}, national scout`);
  promoted(state, s.name, "area scout", "national scout");
  remember(state, old, "Replaced as national scout by someone from inside", -3);
  return null;
}

/** An analyst moves up to run the department (or into a senior role). */
export function promoteAnalyst(state: GameState, index: number): string | null {
  const x = analysts(state);
  const a = x.staff[index];
  if (!a) return "No such analyst.";
  if (a.role === "director") return "He already runs the department.";
  const dir = x.staff.findIndex((s) => s.role === "director");
  if (dir < 0) return "There's no director job at this staff level. Grow the department first.";
  const old = x.staff[dir];
  x.staff[dir] = { ...a, role: "director", skill: Math.min(95, a.skill + 3) };
  x.staff[index] = { ...old, role: a.role };
  post(state, "staff", -80_000, `Raise for ${a.name}, director of analytics`);
  promoted(state, a.name, "analyst", "director of analytics");
  remember(state, old.name, "Passed over for someone younger", -4);
  return null;
}

// ---- Succession ----

export interface SuccessionRow { job: string; incumbent: string; candidates: { id: string; name: string; read: string }[]; named?: string }

/** Who could step into each key job from inside, as the staff sees it (noisy, in words). */
export function successionPlan(state: GameState): SuccessionRow[] {
  const s = staff(state);
  const team = state.userTeam;
  const ts = teamStaff(team);
  const p = people(state);
  const read = (key: string, v: number) => {
    const n = v + gaussian(rngFor(state.seed, `succ:${key}:${RULES.season}`)) * 5 + (state.culture?.development ?? 1) * 1.5;
    return n >= 68 ? "Ready now" : n >= 60 ? "Ready in a year or two" : "Developing";
  };
  const coach = (id: string) => s.people[id];
  const rows: SuccessionRow[] = [];
  const pool = Object.values(s.people).filter((c) => !c.retired && (c.team === team || c.job?.team === team));
  const cands = (filter: (c: typeof pool[number]) => boolean, key: (c: typeof pool[number]) => number) => pool.filter(filter).sort((a, b) => key(b) - key(a)).slice(0, 3)
    .map((c) => ({ id: c.id, name: c.name, read: read(c.id, key(c)) }));
  rows.push({ job: "HC", incumbent: ts.HC?.name ?? "Vacant", candidates: cands((c) => c.role === "OC" || c.role === "DC" || c.role === "STC", (c) => (c.hidden.leadership ?? 55) * 0.6 + (c.hidden.playCalling ?? 55) * 0.4) });
  rows.push({ job: "OC", incumbent: ts.OC?.name ?? "Vacant", candidates: cands((c) => !!c.job?.room && ["QB", "WR", "OL", "TE", "RB"].includes(c.job.room) || (p.qc.includes(c.id) && c.side === "offense"), (c) => (c.hidden.playCalling ?? 50) * 0.6 + (c.hidden.development ?? 55) * 0.4) });
  rows.push({ job: "DC", incumbent: ts.DC?.name ?? "Vacant", candidates: cands((c) => !!c.job?.room && ["DL", "LB", "DB"].includes(c.job.room) || (p.qc.includes(c.id) && c.side === "defense"), (c) => (c.hidden.playCalling ?? 50) * 0.6 + (c.hidden.development ?? 55) * 0.4) });
  rows.push({ job: "GM", incumbent: ts.GM?.name ?? "Vacant", candidates: cands((c) => c.role === "COL" || c.role === "PRO", (c) => (c.hidden.evaluation ?? 55) * 0.7 + (c.hidden.leadership ?? 55) * 0.3) });
  if (state.execs) for (const role of EXEC_KEYS) {
    const e = execRole(state, role);
    const d = deputy(state, role);
    if (!e && !d) continue;
    rows.push({ job: role, incumbent: e?.name ?? "Vacant", candidates: d ? [{ id: d.id, name: d.name, read: read(d.id, d.hidden.skill) }] : [] });
  }
  for (const r of rows) {
    const id = p.successors[r.job];
    if (id) r.named = coach(id)?.name ?? execs(state).people[id]?.name;
  }
  return rows;
}

export function nameSuccessor(state: GameState, job: string, id: string | null): void {
  const p = people(state);
  if (!id) { delete p.successors[job]; return; }
  p.successors[job] = id;
  const name = staff(state).people[id]?.name ?? execs(state).people[id]?.name ?? id;
  remember(state, name, `Named the successor for ${job}`, 3);
}

// ---- Coaching agreements ----

/**
 * Extend a coach with a partial guarantee and a playoff incentive. Agents
 * want more salary for less protection and take a little less for an
 * incentive they expect to earn. A fired coach is owed the guaranteed
 * share of what's left.
 */
export function extendCoach(state: GameState, id: string, years: number, salary: number, guaranteed: number, incentive: number): { ok: boolean; text: string } {
  const g = Math.max(0.5, Math.min(1, guaranteed));
  const inc = Math.max(0, incentive);
  // What the offer is worth to him as a fully guaranteed salary.
  const worth = salary * (1 - (1 - g) * 0.4) + inc * 0.35;
  const r = extendStaff(state, id, years, worth);
  if (!r.ok) return r;
  const c = staff(state).people[id];
  c.contract = { ...c.contract!, salary, guaranteed: g, incentive: inc };
  return { ok: true, text: `${r.text.replace(/at \$[^ ]+ a year/, `at ${money(salary)} a year`)} ${Math.round(g * 100)}% guaranteed${inc ? `, plus ${money(inc)} for a playoff trip` : ""}.` };
}

/** What firing a coach would cost: the guaranteed share of the salary left. */
export function severanceOwed(state: GameState, id: string): number {
  const c = staff(state).people[id];
  if (!c?.contract) return 0;
  const next = state.date > RULES.keyDates.regularSeasonEnd ? RULES.season + 1 : RULES.season;
  const years = Math.max(0, c.contract.through - next + 1);
  return Math.round(c.contract.salary * years * (c.contract.guaranteed ?? 1));
}

// ---- The hot seat ----

/**
 * How insecure our head coach feels, 0 to 1: the owner's patience and
 * firing record, the season against expectations, and the coverage.
 */
export function hotSeat(state: GameState): number {
  const hc = teamStaff(state.userTeam).HC;
  if (!hc) return 0;
  const o = state.owner ? owner(state) : null;
  const patience = o ? (6 - o.patience) / 5 : 0.4;
  const fired = (state.staff?.log ?? []).filter((l) => l.team === state.userTeam && /fire/i.test(l.text) && /Head Coach/i.test(l.text)).length;
  const r = standings(state)[state.userTeam];
  const games = r ? r.w + r.l + r.t : 0;
  const exp = (staff(state).expect[state.userTeam] ?? 0.5);
  const behind = games >= 4 ? Math.max(0, exp - (r!.w + r!.t / 2) / games) * 2 : 0;
  const media = state.media ? Math.max(0, (55 - state.media.coach) / 60) : 0;
  const tenure = Math.max(0, RULES.season - hc.hiredYear);
  const backed = people(state).backed;
  const comfort = backed && backed.coach === hc.id && backed.until >= state.date ? 0.25 : 0;
  return Math.max(0, Math.min(1, 0.15 + patience * 0.25 + fired * 0.05 + behind * 0.6 + media * 0.4 + (tenure >= 2 ? 0.05 : 0) - comfort));
}

/** The plan cost of a coach coaching for his job: conservative, distracted. */
export function hotSeatDrag(state: GameState): number {
  const h = hotSeat(state);
  return h > 0.6 ? -(h - 0.6) * 2 : 0;
}

/** A public vote of confidence: the coach settles down, but firing him soon after is remembered as a broken promise. */
export function backCoach(state: GameState): string | null {
  const hc = teamStaff(state.userTeam).HC;
  if (!hc) return "There's no head coach to back.";
  people(state).backed = { coach: hc.id, until: addDays(state.date, 120) };
  remember(state, hc.name, "Backed publicly by the owner", 3);
  news(state, `${TEAM_BY_ID[state.userTeam].name} owner gives ${hc.name} a public vote of confidence`);
  return null;
}

// ---- Mandates ----

export function setMandate(state: GameState, who: ExecRole | "GM", m: Mandate | null): void {
  const p = people(state);
  if (!m) delete p.mandates[who];
  else p.mandates[who] = m;
  noteDecision(state, "mandates", `${who === "GM" ? "General manager" : EXEC_ROLES[who].label}: ${m ? MANDATES[m].label.toLowerCase() : "no mandate"}`, undefined, "Owner", "owner");
}

/** Adjusts an executive's review for how well the year matched the mandate: about -8 to +8. */
export function mandateScore(state: GameState, role: ExecRole, year: number): { delta: number; text: string } | null {
  const m = state.people?.mandates[role];
  if (!m) return null;
  const led = business(state).ledger.filter((e) => e.year === year);
  const rev = led.filter((e) => e.amount > 0 && !["loanIn", "capital", "deposits"].includes(e.cat)).reduce((t, e) => t + e.amount, 0);
  const plan = state.books?.plan[year] ?? {};
  const planRev = Object.values(plan).filter((v) => (v ?? 0) > 0).reduce((t, v) => t + (v ?? 0), 0);
  const close = state.books?.closed.find((c) => c.year === year);
  const departures = state.execs ? execs(state).departures.filter((d) => leagueYear(d.date) === year).length : 0;
  let delta = 0;
  if (m === "profit" && close) delta = close.operating >= close.planOperating ? 6 : -6;
  if (m === "growth" || m === "invest") delta = planRev ? (rev >= planRev ? 6 : -4) : 0;
  if (m === "stability") delta = departures <= 1 ? 6 : -departures * 3;
  return { delta: Math.max(-8, Math.min(8, delta)), text: `Mandate: ${MANDATES[m].label.toLowerCase()} (${delta >= 0 ? "met" : "missed"}).` };
}

// ---- Training value ----

/** What the staff development budget has bought: promotions from within, departures and readiness. */
export function trainingValue(state: GameState): { spent: number; promotions: number; departures: number; ready: number; text: string } {
  const year = leagueYear(state.date);
  const spent = business(state).ledger.filter((e) => e.year >= year - 2 && e.note === "Staff development").reduce((t, e) => t - e.amount, 0);
  const promotions = people(state).promotions.filter((x) => x.date >= addDays(state.date, -730)).length;
  const departures = state.execs ? execs(state).departures.filter((d) => d.date >= addDays(state.date, -730)).length : 0;
  const ready = successionPlan(state).filter((r) => r.candidates.some((c) => c.read === "Ready now")).length;
  const text = spent <= 0 ? "No development budget: the staff learns on the job, and good people look elsewhere to grow."
    : promotions + ready >= 4 ? "The development money is showing: people are moving up from inside and the bench is deep."
    : departures > promotions ? "We're training people who then leave. Promotions from within would keep more of them."
    : "Some return so far: a few people ready to step up.";
  return { spent: Math.round(spent), promotions, departures, ready, text };
}

// ---- The owner's calendar ----

export const CALENDAR_KINDS: Record<CalendarItem["kind"], { label: string; what: string; cost: number }> = {
  meeting: { label: "Executive meeting", what: "The management meeting, with your agenda.", cost: 0 },
  stadium: { label: "Stadium and city talks", what: "Time with the stadium authority and city staff: goodwill for the next lease or project.", cost: 0 },
  public: { label: "Public appearance", what: "A community event or charity dinner: fans and the community notice.", cost: 25_000 },
  league: { label: "League office visit", what: "Time with the commissioner's staff: credibility at the league office.", cost: 0 },
};

export function schedule(state: GameState, date: string, kind: CalendarItem["kind"], noteText = ""): string | null {
  if (date <= state.date) return "Pick a date ahead.";
  const p = people(state);
  if (p.calendar.filter((c) => !c.done && c.date >= state.date).length >= 12) return "Your calendar is full. Something has to come off first.";
  p.calendar.push({ date, kind, note: noteText || CALENDAR_KINDS[kind].label });
  p.calendar.sort((a, b) => a.date.localeCompare(b.date));
  return null;
}

export interface CalendarRow { date: string; what: string; kind: string }

/** The weeks ahead: the owner's appointments, league dates, deadlines and renewals. */
export function ownerCalendar(state: GameState, days = 60): CalendarRow[] {
  const to = addDays(state.date, days);
  const K = RULES.keyDates;
  const rows: CalendarRow[] = [];
  const labels: Record<string, string> = { tradeDeadline: "Trade deadline", superBowl: "Super Bowl", franchiseTagDeadline: "Franchise tag deadline", newLeagueYear: "New league year", annualLeagueMeeting: "Annual league meeting", draftStart: "Draft", rosterCutdown: "Roster cutdown", regularSeasonStart: "Season opener", scoutingCombineStart: "Scouting combine" };
  for (const [k, label] of Object.entries(labels)) if (K[k] && K[k] >= state.date && K[k] <= to) rows.push({ date: K[k], what: label, kind: "League" });
  for (const c of people(state).calendar) if (!c.done && c.date >= state.date && c.date <= to) rows.push({ date: c.date, what: c.note, kind: CALENDAR_KINDS[c.kind].label });
  for (const m of state.office?.memos ?? []) if (m.status === "open" && m.deadline <= to) rows.push({ date: m.deadline, what: `Memo due: ${m.title}`, kind: "Decision" });
  for (const t of state.office?.tasks ?? []) if (t.status === "open" && t.due <= to) rows.push({ date: t.due, what: `Task due: ${t.title}`, kind: "Task" });
  if (state.execs) for (const role of EXEC_KEYS) {
    const e = execRole(state, role);
    if (e?.contract && e.contract.through === leagueYear(state.date)) rows.push({ date: addDays(RULES.keyDates.newLeagueYear, -1), what: `${e.name}'s contract ends`, kind: "Contract" });
  }
  return rows.filter((r) => r.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}

// ---- The agenda ----

export const AGENDA_TOPICS = ["The budget", "Sponsors", "Debt", "Incidents", "Football", "People", "Stadium"];

export function setAgenda(state: GameState, topics: string[]): void {
  people(state).agenda = topics.filter((t) => AGENDA_TOPICS.includes(t));
}

/** The meeting's topics in the owner's order; topics the owner didn't list follow. The first three get the time to turn into tasks. */
export function agendaOrder(state: GameState, topics: string[]): string[] {
  const a = state.people?.agenda ?? [];
  if (!a.length) return topics;
  const rank = (t: string) => (a.includes(t) ? a.indexOf(t) : 50 + topics.indexOf(t));
  return [...topics].sort((x, y) => rank(x) - rank(y));
}

// ---- Daily ----

function changes(state: GameState): void {
  const p = people(state);
  const gm = teamStaff(state.userTeam).GM?.id;
  const pres = state.execs ? execRole(state, "PRES")?.id : undefined;
  if (p.gm && gm && p.gm !== gm) {
    // A new GM resets the working relationships he inherits.
    const c = culture(state);
    c.gmTrust = 50 + (c.gmTrust - 50) * 0.2;
    c.cooperation = 50 + (c.cooperation - 50) * 0.3;
    c.log.unshift({ date: state.date, text: "A new general manager: the scouts, coaches and the cap staff are learning how he works." });
    for (const e of state.execs ? Object.values(execs(state).people).filter((x) => x.role) : []) e.satisfaction = Math.max(0, e.satisfaction - 2);
  }
  if (p.pres && pres && p.pres !== pres) {
    const c = culture(state);
    c.log.unshift({ date: state.date, text: "A new president: department heads are waiting to see whom he trusts." });
    for (const e of Object.values(execs(state).people).filter((x) => x.role && x.role !== "PRES")) e.satisfaction = Math.max(0, e.satisfaction - 4);
  }
  p.gm = gm;
  p.pres = pres;
}

function monthly(state: GameState): void {
  // Quality-control coaches are paid like the rest of the staff, monthly.
  const qc = qcCoaches(state);
  if (qc.length && state.business) post(state, "staff", -qc.length * QC_SALARY / 12, "Quality-control coaches");
  // Managers who are second-guessed or overworked grow restless; good conditions and regard hold them.
  const micro = micromanagement(state);
  const cond = workingConditions(state);
  if (state.execs) for (const e of Object.values(execs(state).people).filter((x) => x.role)) {
    const drift = -micro * 3 + (cond.wellbeing - 55) / 40 + regard(state, e.name) / 20;
    e.satisfaction = Math.max(0, Math.min(100, e.satisfaction + drift));
  }
  if (micro > 0.5 && state.date.slice(5, 7) === "01") send(state, "staff", execRole(state, "PRES")?.name ?? "The president", "A word about how decisions get made",
    "Several department heads have told me they feel second-guessed on calls you've handed them. Work is slowing while people wait to see whether you'll step in, and the best of them have options elsewhere.");
  // The hot seat makes the news when it's real.
  const h = hotSeat(state);
  if (h > 0.7 && state.date.slice(8) === "01" && state.date >= RULES.keyDates.regularSeasonStart) {
    const hc = teamStaff(state.userTeam).HC;
    if (hc) news(state, `Speculation grows about ${hc.name}'s future with the ${TEAM_BY_ID[state.userTeam].name}`);
  }
}

/** Playoff incentives in coaching agreements are paid once our season ends. */
function incentives(state: GameState): void {
  const p = people(state);
  if (p.incentives.includes(RULES.season) || state.date !== addDays(RULES.keyDates.superBowl, 1)) return;
  p.incentives.push(RULES.season);
  const made = madePlayoffs(state, state.userTeam, RULES.season);
  if (!made) return;
  achievement(state, `A playoff season in ${RULES.season}`);
  let total = 0;
  for (const c of Object.values(staff(state).people)) if (c.team === state.userTeam && c.role && c.contract?.incentive) total += c.contract.incentive;
  if (total && state.business) post(state, "staff", -total, "Coaches' playoff incentives");
}

function calendarDay(state: GameState): void {
  for (const c of people(state).calendar) {
    if (c.done || c.date !== state.date) continue;
    c.done = true;
    const k = CALENDAR_KINDS[c.kind];
    if (k.cost && state.business) post(state, "community", -k.cost, k.label);
    const cu = culture(state);
    if (c.kind === "public") { cu.rel.community = Math.min(100, cu.rel.community + 1.5); state.pressure.fans = Math.min(100, state.pressure.fans + 0.5); }
    if (c.kind === "stadium") cu.rel.community = Math.min(100, cu.rel.community + 1);
    if (c.kind === "league" && state.standing) state.standing.league = Math.min(100, state.standing.league + 2);
    if (c.kind === "meeting" && state.office) holdMeeting(state);
  }
}


export function peopleDaily(state: GameState): void {
  if (!state.office) return;
  changes(state);
  if (state.date.endsWith("-01")) monthly(state);
  incentives(state);
  calendarDay(state);
  // Development: once a year the quality-control coaches grow with the staff development budget.
  if (state.date === RULES.keyDates.newLeagueYear) {
    for (const c of qcCoaches(state)) {
      c.hidden.development = Math.min(85, (c.hidden.development ?? 55) + 1.5 + (state.culture?.development ?? 1) * 1.2);
      if (c.contract) c.contract.through = Math.max(c.contract.through, RULES.season + 1);
    }
  }
}

/** Fire a coach and remember it; a coach backed publicly in the last four months makes it a broken promise. */
export function noteFiring(state: GameState, id: string): void {
  const c = staff(state).people[id];
  const b = people(state).backed;
  if (c && b && b.coach === id && b.until >= state.date) {
    for (const e of state.execs ? Object.values(execs(state).people).filter((x) => x.role) : []) remember(state, e.name, `Saw the owner fire ${c.name} weeks after backing him`, -2);
    if (state.standing) state.standing.broken.push({ date: state.date, text: `Fired ${c.name} after a public vote of confidence` });
  }
}

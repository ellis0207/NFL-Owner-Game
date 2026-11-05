// Who decides what. For each kind of decision the owner picks one of three
// ways of working: do it personally, have the staff bring a proposal for
// sign-off, or let the staff decide within limits and report back. Deals over
// the limits come back to the owner whatever the setting.
//
// Keeping everything to yourself has a price: executives who can't run their
// departments get restless, the head coach reads it as a lack of trust, and
// the decisions that sit on the owner's desk wait. Handing everything off has
// one too: the staff's judgment is only as good as the staff.
//
// Every consequential decision lands in the audit trail: what it was, who
// proposed it, who approved it, and why.
import { addDays, weekday } from "./dates";
import { execs, EXEC_ROLES, execRole, signer } from "./executives";
import { money, send } from "./inbox";
import { RULES } from "./league";
import type { DecisionArea, DecisionMode, ExecRole, GameState, InboxItem, Memo, OfficeState } from "./types";

const M = 1_000_000;

export const AREAS: Record<DecisionArea, { label: string; what: string; who: ExecRole | "GM" | "HC"; modes: Record<DecisionMode, string> }> = {
  signings: {
    label: "Free-agent signings", what: "Offers to free agents in the market and on the street.", who: "GM",
    modes: { owner: "You make every offer yourself.", approve: "The GM brings each offer to you as a memo first.", delegate: "The GM makes offers within the limit and tells you." },
  },
  trades: {
    label: "Trade calls", what: "Answering trade offers other teams send us.", who: "GM",
    modes: { owner: "Offers come straight to you (as now).", approve: "The GM writes up each offer with a recommendation.", delegate: "The GM accepts what helps us and turns down the rest." },
  },
  coaching: {
    label: "Coaching staff", what: "Coordinator and position coach hires, and filling open staff jobs.", who: "HC",
    modes: { owner: "You run every search and hire.", approve: "The head coach proposes names for your approval (as now).", delegate: "The head coach and GM hire within the staff budget." },
  },
  pricing: {
    label: "Ticket prices", what: "Next season's ticket and premium prices, set after the regular season.", who: "CRO",
    modes: { owner: "You set prices.", approve: "The revenue staff proposes prices for your sign-off.", delegate: "The revenue staff sets prices and tells you." },
  },
  events: {
    label: "Stadium bookings", what: "Concerts, college games and other events promoters want to book.", who: "SOD",
    modes: { owner: "You answer every request.", approve: "Requests come to you with a recommendation (as now).", delegate: "Stadium operations books what fits the calendar." },
  },
  sponsors: {
    label: "Local sponsors and media", what: "Local partnership and radio/TV offers in the February window.", who: "CRO",
    modes: { owner: "You pick every partner.", approve: "Offers come to you; the staff takes the best left when the window closes (as now).", delegate: "The revenue staff signs the best offer in each category right away." },
  },
  financing: {
    label: "Borrowing", what: "Refinancing loans that come due, and taking the best terms lenders offer.", who: "CFO",
    modes: { owner: "You handle every loan.", approve: "The CFO brings refinancing terms as a memo.", delegate: "The CFO refinances maturing loans on the best terms offered, within the debt limit." },
  },
};
export const AREA_KEYS = Object.keys(AREAS) as DecisionArea[];

/** How the game always worked before decision rights existed. */
const DEFAULT_MODES: Record<DecisionArea, DecisionMode> = {
  signings: "owner", trades: "owner", coaching: "approve", pricing: "owner", events: "approve", sponsors: "approve", financing: "owner",
};

export const PRESETS: Record<string, { label: string; what: string; modes: Record<DecisionArea, DecisionMode> }> = {
  handsOn: { label: "Hands on everything", what: "Every decision is yours. The staff will feel it.", modes: { signings: "owner", trades: "owner", coaching: "owner", pricing: "owner", events: "owner", sponsors: "owner", financing: "owner" } },
  classic: { label: "Sign off on the big calls", what: "How most owners work: the staff proposes, you approve.", modes: DEFAULT_MODES },
  football: { label: "Football first", what: "You run the football side; the business staff runs the business.", modes: { signings: "owner", trades: "owner", coaching: "approve", pricing: "delegate", events: "delegate", sponsors: "delegate", financing: "approve" } },
  business: { label: "Business first", what: "You run the business; the GM and head coach run football.", modes: { signings: "delegate", trades: "delegate", coaching: "delegate", pricing: "owner", events: "approve", sponsors: "owner", financing: "owner" } },
  chairman: { label: "Chairman of the board", what: "The staff runs everything within your limits and reports to you.", modes: { signings: "delegate", trades: "delegate", coaching: "delegate", pricing: "delegate", events: "delegate", sponsors: "delegate", financing: "delegate" } },
};

export function office(state: GameState): OfficeState {
  return (state.office ??= {
    modes: { ...DEFAULT_MODES },
    limits: { contractApy: 20 * M, debt: 150 * M },
    alerts: { signings: "every", trades: "every", coaching: "every", pricing: "every", events: "weekly", sponsors: "weekly", financing: "every" },
    trail: [], digest: [], memos: [], meetings: [], tasks: [], incidents: [], trends: [],
  });
}

/** Saves from before decision rights keep the old ways of working. */
export function ensureOffice(state: GameState): void {
  office(state);
}

export function mode(state: GameState, area: DecisionArea): DecisionMode {
  return state.office?.modes[area] ?? DEFAULT_MODES[area];
}

/** The contract limit grows with the cap, so a limit set in 2026 means the same in 2030. */
export function apyLimit(state: GameState): number {
  return office(state).limits.contractApy * Math.pow(1.065, Math.max(0, RULES.season - 2026));
}

/** Who answers for an area, by name. */
export function areaOwner(state: GameState, area: DecisionArea, gm: string, hc: string): string {
  const who = AREAS[area].who;
  return who === "GM" ? gm : who === "HC" ? hc : signer(state, who);
}

// ---- Changing how decisions get made ----

/**
 * Taking a decision back from the staff unsettles the people who had it; giving
 * one away builds trust. The head coach watches the football areas.
 */
export function setMode(state: GameState, area: DecisionArea, to: DecisionMode, quiet = false): void {
  const o = office(state);
  const from = o.modes[area];
  if (from === to) return;
  o.modes[area] = to;
  const rank = { owner: 0, approve: 1, delegate: 2 };
  const step = rank[to] - rank[from];
  const who = AREAS[area].who;
  if (who !== "GM" && who !== "HC") {
    const e = execRole(state, who);
    if (e) e.satisfaction = clamp(e.satisfaction + step * (e.hidden.ambition >= 60 ? 8 : 4));
  } else if (state.media) {
    // Football people read a pulled decision as a vote of no confidence.
    state.media.coach = clamp(state.media.coach + step * (area === "coaching" ? 4 : 2));
  }
  if (!quiet) noteDecision(state, "decision rights", `${AREAS[area].label}: ${to === "owner" ? "the owner decides" : to === "approve" ? "the staff proposes, the owner approves" : "delegated to the staff"}`, undefined, "Owner", "owner");
}

export function setPreset(state: GameState, key: string): void {
  const p = PRESETS[key];
  if (!p) return;
  for (const a of AREA_KEYS) setMode(state, a, p.modes[a], true);
  noteDecision(state, "decision rights", `Adopted "${p.label}"`, undefined, "Owner", "owner");
}

export function setLimits(state: GameState, limits: Partial<OfficeState["limits"]>): void {
  Object.assign(office(state).limits, limits);
}

export function setAlert(state: GameState, area: DecisionArea, level: OfficeState["alerts"][DecisionArea]): void {
  office(state).alerts[area] = level;
}

// ---- The audit trail and reports ----

export function noteDecision(state: GameState, area: string, what: string, amount?: number, by = "Owner", approved: "owner" | "delegated" | "policy" = "owner", why?: string): void {
  const o = office(state);
  o.trail.unshift({ date: state.date, area, what, by, approved, ...(amount ? { amount: Math.round(amount) } : {}), ...(why ? { why } : {}) });
  if (o.trail.length > 400) o.trail.length = 400;
}

/** A delegated action: logged, and reported the way the owner asked for that area. */
export function report(state: GameState, area: DecisionArea, from: string, title: string, text: string, opts: { amount?: number; exception?: boolean } = {}): void {
  const o = office(state);
  noteDecision(state, AREAS[area].label.toLowerCase(), title, opts.amount, from, "delegated", text);
  const level = o.alerts[area];
  if (level === "every" || opts.exception) sendPriority(state, area === "events" || area === "sponsors" || area === "pricing" || area === "financing" ? "business" : "transaction", from, title, text, opts.exception ? 2 : 1);
  else if (level === "weekly") o.digest.push({ date: state.date, area, text: `${title}: ${text}` });
}

export function sendPriority(state: GameState, kind: InboxItem["kind"], from: string, title: string, body: string, priority: number): void {
  send(state, kind, from, title, body);
  if (priority > 1) state.inbox[0].priority = priority;
}

/** Monday mornings: the week's delegated decisions in one note. */
export function weeklyDigest(state: GameState): void {
  const o = office(state);
  if (weekday(state.date) !== "Monday" || !o.digest.length) return;
  const by = new Map<DecisionArea, string[]>();
  for (const d of o.digest) by.set(d.area, [...(by.get(d.area) ?? []), d.text]);
  const body = [...by.entries()].map(([a, lines]) => `${AREAS[a].label}:\n${lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n");
  send(state, "business", signer(state, "PRES"), "This week's decisions by the staff", body);
  o.digest = [];
}

// ---- Memos ----

/** File a memo on the owner's desk and flag it in the inbox. */
export function addMemo(state: GameState, m: Omit<Memo, "id" | "date" | "status" | "notes"> & { notes?: string[] }): Memo {
  const o = office(state);
  const memo: Memo = { ...m, id: `memo-${state.date}-${o.memos.length}`, date: state.date, status: "open", notes: m.notes ?? [] };
  o.memos.unshift(memo);
  if (o.memos.length > 150) o.memos = o.memos.filter((x) => x.status === "open" || x.status === "researching").concat(o.memos.filter((x) => x.status !== "open" && x.status !== "researching").slice(0, 100));
  const days = Math.max(0, Math.round((Date.parse(memo.deadline) - Date.parse(state.date)) / 86_400_000));
  sendPriority(state, memo.area === "signings" ? "transaction" : memo.kind === "coachReview" ? "staff" : "business", memo.from, `Decision memo: ${memo.title}`,
    `${memo.problem}\n\nProposal: ${memo.proposal}${memo.amount ? ` (${money(memo.amount)})` : ""}\n\nIt needs an answer ${days <= 1 ? "by tomorrow" : `within ${days} days`}. The full memo is on the Front office page under Memos.`,
    days <= 3 ? 3 : 2);
  return memo;
}

export function openMemos(state: GameState): Memo[] {
  return (state.office?.memos ?? []).filter((m) => m.status === "open" || m.status === "researching");
}

/**
 * Memos that sit past their deadline cost goodwill with whoever wrote them;
 * an owner who can't keep up with the desk slows the whole building down.
 */
export function deskPressure(state: GameState): number {
  return openMemos(state).filter((m) => m.status === "open" && m.deadline < addDays(state.date, 1)).length;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

/** How much of the club's work the owner keeps personally: 0 (all delegated) to 1 (all personal). */
export function ownerLoad(state: GameState): number {
  const rank = { owner: 1, approve: 0.5, delegate: 0 };
  return AREA_KEYS.reduce((t, a) => t + rank[mode(state, a)], 0) / AREA_KEYS.length;
}

/** The month's effect of the owner's way of working on the executives' mood. */
export function officeMood(state: GameState): void {
  if (!state.execs) return;
  const load = ownerLoad(state);
  const late = deskPressure(state);
  for (const e of Object.values(execs(state).people)) {
    if (!e.role) continue;
    const area = EXEC_ROLES[e.role].area;
    const held = area ? mode(state, area) === "owner" : false;
    // Ambitious people chafe when they can't run their own shop; everyone drifts back toward content.
    let d = (62 - e.satisfaction) * 0.08 - (held ? (e.hidden.ambition - 40) / 20 : 0) - late * 0.8 - Math.max(0, load - 0.8) * 5;
    if (area && mode(state, area) === "delegate") d += 0.5;
    e.satisfaction = clamp(e.satisfaction + d);
  }
}

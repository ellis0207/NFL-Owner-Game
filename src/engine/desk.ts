// The owner's desk: what to look at first (by deadline, money at stake,
// strategic weight and whose call it is), follow-up questions on a memo
// (evidence, clarification, a sensitivity case, an alternative), saved
// reports that run again any season, and the play settings: the
// full-realism preset, play modes, a sandbox kept apart from real games,
// and how much estimated information the owner sees.
import { AREA_KEYS, noteDecision, office, setMode } from "./delegation";
import { daysBetween } from "./dates";
import { money } from "./inbox";
import { consulting } from "./treasury";
import { alternativeText, memoComparison, sensitivityText } from "./compare";
import { remember } from "./people";
import type { DecisionArea, GameState, InboxItem, Memo } from "./types";

const M = 1_000_000;

// ---- Priority ----

export interface DeskItem { kind: "memo" | "message" | "task"; id: string; title: string; score: number; why: string[]; deadline?: string }

/** A memo's priority: days to the deadline, cash at stake, strategic weight and whether it's the owner's call alone. */
export function memoPriority(state: GameState, m: Memo): DeskItem {
  const why: string[] = [];
  const days = Math.max(0, daysBetween(state.date, m.deadline));
  let score = Math.max(0, 40 - days * 4);
  if (days <= 2) why.push(days === 0 ? "Due today" : `Due in ${days} day${days > 1 ? "s" : ""}`);
  const cash = Math.abs(m.amount ?? 0);
  score += Math.min(30, cash / (2 * M));
  if (cash >= 10 * M) why.push(`${money(cash)} at stake`);
  const strategic = ["trade", "signing", "refinance", "execReview", "coachReview", "general"].includes(m.kind);
  if (strategic) { score += 15; why.push("Strategic"); }
  // Calls only the owner can make (nobody else holds the decision) come before ones the staff could take.
  const area = m.area as DecisionArea | undefined;
  if (!area || office(state).modes[area] === "owner") { score += 10; why.push("Your call alone"); }
  return { kind: "memo", id: m.id, title: m.title, score: Math.round(score), why, deadline: m.deadline };
}

/** An inbox message's priority from its kind and how recent it is. */
export function messagePriority(state: GameState, it: InboxItem): DeskItem {
  const w: Partial<Record<InboxItem["kind"], number>> = { transaction: 20, business: 18, staff: 15, media: 8, league: 12 };
  const age = daysBetween(it.date, state.date);
  const score = (w[it.kind] ?? 10) + ((it as { priority?: number }).priority ?? 0) * 8 - Math.min(20, age * 2) + (it.read ? -15 : 0);
  return { kind: "message", id: it.id, title: it.title, score: Math.round(score), why: [it.read ? "Read" : "Unread"] };
}

/** Everything open on the desk, most urgent first. */
export function rankedDesk(state: GameState): DeskItem[] {
  const memos = (state.office?.memos ?? []).filter((m) => m.status === "open" || m.status === "researching").map((m) => memoPriority(state, m));
  const tasks = (state.office?.tasks ?? []).filter((t) => t.status === "open").map((t) => ({ kind: "task" as const, id: t.id, title: t.title, score: Math.max(0, 25 - daysBetween(state.date, t.due) * 2), why: ["Task you assigned"], deadline: t.due }));
  return [...memos, ...tasks].sort((a, b) => b.score - a.score);
}

// ---- Follow-up questions ----

export type FollowUp = "evidence" | "clarify" | "sensitivity" | "alternative";
export const FOLLOW_UPS: Record<FollowUp, string> = {
  evidence: "What's the evidence?",
  clarify: "Explain the numbers",
  sensitivity: "What if the assumptions are wrong?",
  alternative: "Give me another option",
};

/**
 * Ask the memo's author a follow-up. The answer goes on the memo. Asking is
 * free with strategy consultants on hand; otherwise each question costs the
 * author a little patience and counts toward how closely the owner manages.
 */
export function followUp(state: GameState, id: string, kind: FollowUp): string | null {
  const m = office(state).memos.find((x) => x.id === id);
  if (!m || (m.status !== "open" && m.status !== "researching")) return "That memo is closed.";
  const asked = m.notes.filter((n) => n.startsWith("Q:")).length;
  if (asked >= 4) return "You've asked enough on this one; the author wants a decision.";
  const amount = Math.abs(m.amount ?? 0);
  const cash = m.cash ?? [];
  let a: string;
  switch (kind) {
    case "evidence": {
      const ev = m.options.map((o, i) => `${o.label}: ${o.evidence === "confirmed" ? "confirmed" : o.evidence === "estimate" ? "an estimate" : "the staff's opinion"}${i === m.recommend ? " (recommended)" : ""}`);
      a = `On what each option rests: ${ev.join("; ")}.${m.comparables?.length ? ` Comparables: ${m.comparables.slice(0, 3).join("; ")}.` : ""}`;
      break;
    }
    case "clarify":
      a = amount ? `The ${money(amount)} is ${cash.length ? `paid ${cash.map((c) => `${money(c.amount)} on ${c.when}`).join(", ")}` : "the total commitment"}. ${m.budget}` : `There's no direct cost. ${m.budget}`;
      break;
    case "sensitivity": {
      const c = memoComparison(state, m.id);
      if (c) { a = sensitivityText(c, m.recommend); break; }
      if (!amount) { a = "Little money is at stake; the risk is in the relationships and the story, which the options describe."; break; }
      const low = Math.round(amount * 0.8), high = Math.round(amount * 1.25);
      a = `If our assumptions are 20% optimistic the real cost is closer to ${money(high)}; if they're cautious, ${money(low)}. ${m.risks[0] ?? ""} The recommendation holds unless the high case would break the budget.`;
      break;
    }
    default: {
      const c = memoComparison(state, m.id);
      const alt = c ? alternativeText(c, m.recommend) : "";
      if (alt) { a = `The genuinely different option, worked out the same way: ${alt}`; break; }
      a = amount ? `A smaller version: about ${money(Math.round(amount * 0.65))} for most of the benefit, with less certainty it works. We'd still recommend "${m.options[m.recommend].label}".` : `Waiting is the other option: ${m.ifLate}`;
    }
  }
  m.notes.push(`Q: ${FOLLOW_UPS[kind]}`, `A: ${a}`);
  if (!consulting(state, "strategy")) {
    office(state).trail.unshift({ date: state.date, area: "follow-up", what: `${FOLLOW_UPS[kind]} (${m.title})`, by: "Owner", approved: "owner" });
    if (asked >= 2) remember(state, m.from.split(",")[0], "Questioned at length on a memo", -0.5);
  }
  return null;
}

// ---- Saved reports ----

export const REPORT_KINDS: Record<string, { label: string; params: string[] }> = {
  cap: { label: "Cap by year", params: [] },
  budget: { label: "Budget against actual", params: ["year"] },
  injuries: { label: "Injured players", params: [] },
  leaders: { label: "Team stat leaders", params: ["stat"] },
  standings: { label: "Division standings", params: [] },
  payroll: { label: "Payroll by department", params: [] },
  contracts: { label: "Agreements expiring", params: ["within"] },
};

export function saveReport(state: GameState, name: string, kind: string, params: Record<string, string>): string | null {
  if (!REPORT_KINDS[kind]) return "Unknown report.";
  const o = office(state);
  o.reports ??= [];
  if (o.reports.length >= 20) return "Twenty saved reports is the limit; delete one first.";
  o.reports.push({ id: `r${state.date}-${o.reports.length}`, name: name.trim() || REPORT_KINDS[kind].label, kind, params });
  return null;
}

export function deleteReport(state: GameState, id: string): void {
  const o = office(state);
  o.reports = (o.reports ?? []).filter((r) => r.id !== id);
}

// ---- Play settings ----

export const MODES: Record<NonNullable<GameState["settings"]["mode"]>, { label: string; what: string }> = {
  owner: { label: "The whole club", what: "You run football and the business." },
  football: { label: "Football first", what: "The business executives handle pricing, bookings, sponsors and borrowing; you keep the football decisions." },
  business: { label: "Business first", what: "The GM and head coach handle signings, trades and staff; you run the business." },
};

const BUSINESS_AREAS: DecisionArea[] = ["pricing", "events", "sponsors", "financing"];
const FOOTBALL_AREAS: DecisionArea[] = ["signings", "trades", "coaching"];

/** Switch play mode: hands one side's decisions to the staff (they report as usual). */
export function setPlayMode(state: GameState, m: NonNullable<GameState["settings"]["mode"]>): void {
  state.settings.mode = m;
  if (m === "football") for (const a of BUSINESS_AREAS) setMode(state, a, "delegate", true);
  if (m === "business") for (const a of FOOTBALL_AREAS) setMode(state, a, "delegate", true);
  if (m === "owner") for (const a of AREA_KEYS) if (office(state).modes[a] === "delegate") setMode(state, a, "approve", true);
  noteDecision(state, "settings", `Play mode: ${MODES[m].label.toLowerCase()}`, undefined, "Owner", "owner");
}

/** Full realism: the real cap and finances, real scouting reads, the usual information, and one continuing save. */
export function fullRealism(state: GameState): string | null {
  if (state.sandbox) return "A sandbox game can't become a realism game.";
  Object.assign(state.settings, { capRules: "real", finances: "real", scouting: "real", info: "real", ironman: true, pause: "urgent" });
  noteDecision(state, "settings", "Full realism preset", undefined, "Owner", "owner");
  return null;
}

export function isRealism(state: GameState): boolean {
  const s = state.settings;
  return !state.sandbox && s.capRules === "real" && (s.finances ?? "real") === "real" && (s.scouting ?? "real") !== "sharp" && (s.info ?? "real") !== "full";
}

/** Turn the game into a sandbox: no cap, bottomless pockets, every estimate shown. It can't be turned back. */
export function makeSandbox(state: GameState): void {
  state.sandbox = true;
  Object.assign(state.settings, { capRules: "off", finances: "relaxed", info: "full", ironman: false });
  noteDecision(state, "settings", "Made this game a sandbox", undefined, "Owner", "owner");
}

/** Whether the owner sees staff estimates (models, projections, ranges); "limited" shows confirmed facts only. */
export function showEstimates(state: GameState): boolean {
  return (state.settings.info ?? "real") !== "limited";
}

/** Whether the owner sees the private side: what players tell the well-being staff, reporters' sources. Only in a sandbox with full information. */
export function showPrivate(state: GameState): boolean {
  return !!state.sandbox && state.settings.info === "full";
}


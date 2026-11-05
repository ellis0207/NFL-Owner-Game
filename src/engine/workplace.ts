// The month in the building: who's restless, who leaves, what gets raised
// with the owner, what leaks, and the culture readings that come out of it.
// The rules are in culture.ts; this file runs them each month and turns the
// sore points into memos (an executive who wants authority back, a GM who
// wants clarity, a GM and head coach at odds, a staff complaint).
import { business, post } from "./business";
import { culture, fairness, gmTrust, leak, recordIndicators, relationshipsMonthly, within } from "./culture";
import { addDays } from "./dates";
import { addMemo, AREAS, mode, office, openMemos, sendPriority, setMode } from "./delegation";
import { deputy, EXEC_KEYS, EXEC_ROLES, execBoost, execLeaves, execRole, execs, salaryAsk, signer } from "./executives";
import { mediaState } from "./outlets";
import { gaussian, rngFor } from "./rng";
import { teamStaff } from "./staff";
import type { CultureIndicator, DecisionMode, ExecRole, GameState, Memo } from "./types";

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

function gm(state: GameState): string {
  const g = teamStaff(state.userTeam).GM;
  return g ? `${g.name}, General Manager` : "General Manager";
}

function recent(state: GameState, kind: Memo["kind"], who: string, days: number): boolean {
  return office(state).memos.some((m) => m.kind === kind && m.payload?.who === who && within(state, m.date, days));
}

/** The first of each month, after the executives' mood has moved. */
export function workplaceMonthly(state: GameState): void {
  if (!state.execs || !state.office) return;
  const c = culture(state);
  const o = office(state);
  const rng = rngFor(state.seed, `workplace:${state.date}`);
  relationshipsMonthly(state, {
    delegatedFootball: (["signings", "trades"] as const).filter((a) => mode(state, a) === "delegate").length,
    fopsBoost: execRole(state, "FOPS") ? 0.5 + execBoost(state, "FOPS") : 0,
    incidents: o.incidents.filter((i) => within(state, i.date, 31)).length,
    fans: state.pressure.fans,
    communityBudget: business(state).budget.community,
  });

  // Pay, development and the chance to leave.
  for (const role of EXEC_KEYS) {
    const e = execRole(state, role);
    if (!e?.contract) continue;
    if (e.contract.salary < salaryAsk(state, e, role) * 0.9) e.satisfaction = clamp(e.satisfaction - 1);
    e.satisfaction = clamp(e.satisfaction + c.development * 0.3);
    if (e.satisfaction < 22 && rng() < 0.3) {
      const name = e.name;
      execLeaves(state, role, "an executive at another club");
      sendPriority(state, "business", signer(state, "PRES"), `${name} has resigned`,
        `${name} told us this morning they're leaving to join another club. ${deputy(state, role)?.name ?? "The deputy"} is acting in the job; you can promote them or open a search on the Front office page.`, 2);
    }
  }

  disputes(state);
  complaint(state, rng);
  leaks(state, rng);
  recordIndicators(state, indicators(state));
}

// ---- Things people raise with the owner ----

function disputes(state: GameState): void {
  const c = culture(state);
  // An executive who lost authority asks for it back.
  for (const d of c.disputes ?? []) {
    const e = execRole(state, d.who);
    if (!e || mode(state, d.area) === d.from) continue;
    if (recent(state, "dispute", d.who, 120)) continue;
    addMemo(state, {
      kind: "dispute", area: d.area, from: signer(state, d.who), title: `${e.name} wants ${AREAS[d.area].label.toLowerCase()} back`,
      problem: `Since you took ${AREAS[d.area].label.toLowerCase()} back, ${e.name.split(" ")[0]} says the department can't do the job it was hired for, and that the staff hears mixed messages about who decides.`,
      proposal: "Restore the authority you took back, with your limits on the big deals.",
      options: [
        { label: "Give it back", effect: "The department runs that area again; you still see anything over your limits." },
        { label: "Hold the line", effect: "You keep the decisions. They'll remember it." },
      ],
      risks: ["Executives who can't run their own area leave for clubs that let them."], budget: "No cost.",
      recommend: 0, deadline: addDays(state.date, 14), ifLate: "Nothing changes; the frustration grows.", payload: { who: d.who, area: d.area, from: d.from },
    });
  }
  c.disputes = [];
  // A GM who no longer feels trusted asks where they stand.
  if (c.gmTrust < 35 && !recent(state, "dispute", "GM", 120)) {
    addMemo(state, {
      kind: "dispute", area: "signings", from: gm(state), title: "Where do I stand?",
      problem: "Between the overrides and the decisions taken out of my hands, I need to know what this job is. The staff and the agents can tell when the GM doesn't have the owner's backing.",
      proposal: "Put the final say on signings and trades with me, inside the limits you set.",
      options: [
        { label: "Give the GM the final say", effect: "Signings and trades are delegated to the GM within your limits." },
        { label: "Talk it through", effect: "A frank conversation; the decisions stay where they are." },
        { label: "Remind them who decides", effect: "You keep everything. The GM and the room will feel it." },
      ],
      risks: ["A GM without the owner's trust stops bringing you the full picture."], budget: "No cost.",
      recommend: 0, deadline: addDays(state.date, 14), ifLate: "Silence reads as an answer.", payload: { who: "GM" },
    });
  }
  // The GM and the head coach at odds over the roster.
  if (c.cooperation < 38 && !recent(state, "dispute", "pair", 120)) {
    const hc = teamStaff(state.userTeam).HC;
    addMemo(state, {
      kind: "dispute", from: execRole(state, "FOPS") ? signer(state, "FOPS") : signer(state, "PRES"), title: "The GM and head coach are at odds",
      problem: `${teamStaff(state.userTeam).GM?.name ?? "The GM"} wants to build for the long run; ${hc?.name ?? "the head coach"} wants veterans who help now. It's starting to show in meetings and in who gets playing time.`,
      proposal: "Sit them down together and settle the plan.",
      options: [
        { label: "Back the GM's plan", effect: "The roster follows the GM. The coach won't love it." },
        { label: "Back the head coach", effect: "The roster bends toward winning now. The GM won't love it." },
        { label: "Sit them down together", effect: "A shared plan; it helps most with a president of football operations to hold them to it." },
      ],
      risks: ["A split front office makes worse roster decisions and leaks."], budget: "No cost.",
      recommend: 2, deadline: addDays(state.date, 14), ifLate: "They keep pulling apart.", payload: { who: "pair" },
    });
  }
}

const COMPLAINTS = [
  "A business office employee has filed a complaint about a department head's conduct in meetings.",
  "Several ticket office staff have complained about unpaid overtime during the renewal campaign.",
  "A stadium supervisor has reported being passed over for promotion unfairly.",
  "A staff member has complained about how a manager handled a medical leave.",
];

function complaint(state: GameState, rng: () => number): void {
  const morale = state.culture?.history.at(-1)?.morale ?? 60;
  const p = (0.025 + Math.max(0, 50 - morale) / 800) * (1 - 0.4 * execBoost(state, "GC"));
  if (rng() > p) return;
  const text = COMPLAINTS[Math.floor(rng() * COMPLAINTS.length)];
  const role = (["COO", "CRO", "SOD", "CTO", "MKT"] as ExecRole[])[Math.floor(rng() * 5)];
  addMemo(state, {
    kind: "complaint", from: signer(state, "GC"), title: "A staff complaint",
    problem: text, proposal: "Bring in an outside investigator.", amount: 350_000,
    options: [
      { label: "Outside investigation", effect: "About $350K. Credible, slower, and the staff sees it handled fairly." },
      { label: "Internal review", effect: "About $60K. Faster, but it can look like the club investigating itself." },
      { label: "Close it", effect: "No cost now. If it gets out, it looks like a cover-up." },
    ],
    risks: ["How the club handles this will be remembered by everyone who works here.", "Details could reach the press."],
    budget: "Legal costs come out of the business office budget.", recommend: 0,
    deadline: addDays(state.date, 10), ifLate: "It's closed by default, which is the worst way to close it.", payload: { who: role },
  });
}

function leaks(state: GameState, rng: () => number): void {
  const c = culture(state);
  const trust = c.history.at(-1)?.trust ?? 60;
  const p = Math.max(0.005, 0.02 + (50 - trust) / 500 + (c.rel.sources - 40) / 800 - 0.015 * execBoost(state, "GC"));
  if (rng() > p) return;
  const memo = openMemos(state).find((m) => m.kind === "signing" || m.kind === "trade" || m.kind === "dispute");
  if (memo) leak(state, `People inside the building say the club is weighing this: ${memo.title.toLowerCase()}. ${memo.kind === "dispute" ? "It's not the first sign of friction." : "Nothing is final."}`, memo.kind === "dispute" ? "Friction in the front office" : "Inside the front office's deliberations");
  else leak(state, "Staff describe a front office where decisions take too long and the lines of authority aren't clear.", "Questions about how the front office runs");
  for (const e of Object.values(execs(state).people)) if (e.role) e.satisfaction = clamp(e.satisfaction - 2);
}

/** The owner decides a dispute or complaint memo. */
export function settle(state: GameState, m: Memo, choice: number): string | null {
  const c = culture(state);
  const who = m.payload?.who as string;
  const rng = rngFor(state.seed, `settle:${m.id}`);
  if (m.kind === "complaint") {
    const role = who as ExecRole;
    if (choice === 0) {
      post(state, "professional", -350_000, "Outside workplace investigation");
      fairness(state, 8);
      // Investigations find something about half the time; the department head is held to account.
      const e = execRole(state, role);
      if (e && rng() < 0.5) {
        e.satisfaction = clamp(e.satisfaction - 10);
        m.notes.push(`The investigator substantiated the complaint; ${e.name} was formally warned.`);
      } else m.notes.push("The investigator found no wrongdoing.");
    } else if (choice === 1) {
      post(state, "professional", -60_000, "Internal workplace review");
      fairness(state, 2);
      if (rng() < 0.25) leak(state, "A staff complaint was reviewed internally, and some employees say it was handled by the people it was about.", "A complaint handled in-house");
    } else {
      fairness(state, -10);
      if (rng() < 0.4) {
        leak(state, "A staff complaint was closed without an investigation, according to people familiar with it.", "A complaint closed without a look");
        execs(state).reputation = Math.max(0, execs(state).reputation - 3);
      }
    }
    return null;
  }
  // Disputes.
  if (who === "GM") {
    if (choice === 0) {
      setMode(state, "signings", "delegate");
      setMode(state, "trades", "delegate");
      gmTrust(state, 15);
    } else if (choice === 1) gmTrust(state, 5);
    else {
      gmTrust(state, -8);
      mediaState(state).coach = clamp(mediaState(state).coach - 2);
    }
    return null;
  }
  if (who === "pair") {
    if (choice === 0) {
      c.cooperation = clamp(c.cooperation + 10);
      mediaState(state).coach = clamp(mediaState(state).coach - 5);
    } else if (choice === 1) {
      c.cooperation = clamp(c.cooperation + 10);
      gmTrust(state, -6);
    } else c.cooperation = clamp(c.cooperation + (execRole(state, "FOPS") ? 14 : 7));
    return null;
  }
  const e = execRole(state, who as ExecRole);
  if (choice === 0) {
    setMode(state, m.area!, (m.payload?.from as DecisionMode) ?? "approve");
    if (e) e.satisfaction = clamp(e.satisfaction + 8);
  } else {
    if (e) e.satisfaction = clamp(e.satisfaction - 8);
    fairness(state, -2);
  }
  return null;
}

// ---- The readings ----

export function indicators(state: GameState): Record<CultureIndicator, number> {
  const c = culture(state);
  const o = office(state);
  const x = execs(state);
  const people = Object.values(x.people).filter((e) => e.role);
  const sat = people.length ? people.reduce((t, e) => t + e.satisfaction, 0) / people.length : 60;
  const departures = x.departures.filter((d) => within(state, d.date, 730)).length;
  const reorgs = x.log.filter((l) => within(state, l.date, 365) && l.text.includes("now reports to")).length;
  const switches = o.trail.filter((t) => within(state, t.date, 365) && t.area === "decision rights").length;
  const lapsed = o.memos.filter((m) => m.status === "lapsed" && within(state, m.date, 120) && m.notes.some((n) => n.startsWith("Past the deadline"))).length;
  const leaksYear = c.leaks.filter((l) => within(state, l.date, 365)).length;
  const reviews = people.map((e) => e.reviews[0]?.score).filter((v): v is number => v !== undefined);
  const vacancies = EXEC_KEYS.filter((r) => !EXEC_ROLES[r].optional && !execRole(state, r)).length;
  const open = openMemos(state).length;
  const coach = state.media?.coach ?? 60;
  return {
    trust: 0.5 * c.gmTrust + 0.5 * sat,
    stability: 85 - departures * 10 - reorgs * 5 - Math.max(0, switches - 2) * 4,
    fairness: c.fairness,
    accountability: 55 + (reviews.length ? (reviews.reduce((a, b) => a + b, 0) / reviews.length - 60) * 0.5 : 0) + Math.min(10, o.tasks.filter((t) => t.status === "done" && within(state, t.due, 365)).length * 2) - lapsed * 4,
    communication: 70 - lapsed * 6 - leaksYear * 5 + (c.cooperation - 55) * 0.3,
    morale: 0.6 * sat + 0.4 * coach - vacancies * 4 - Math.max(0, open - 4) * 2 + c.development * 1.5,
  };
}

/** Workload in the business office, as the staff would describe it. */
export function workload(state: GameState): string {
  const vacancies = EXEC_KEYS.filter((r) => !EXEC_ROLES[r].optional && !execRole(state, r)).length;
  const lean = business(state).budget.marketing === 0 ? 1 : 0;
  const load = vacancies * 2 + lean + (execBoost(state, "COO") < -0.2 ? 1 : 0) + Math.max(0, openMemos(state).length - 4) * 0.5;
  return load >= 4 ? "Stretched thin: long hours and work falling through the cracks" : load >= 2 ? "Busy, with a few gaps" : "Well staffed";
}

/** How ready each deputy looks to step up, as the president sees it (noisy, never the number). */
export function succession(state: GameState): { role: ExecRole; name: string; read: string }[] {
  const out: { role: ExecRole; name: string; read: string }[] = [];
  for (const role of EXEC_KEYS) {
    const d = deputy(state, role);
    if (!d || (EXEC_ROLES[role].optional && !execRole(state, role))) continue;
    const v = d.hidden.skill + gaussian(rngFor(state.seed, `ready:${d.id}:${state.date.slice(0, 4)}`)) * 6;
    out.push({ role, name: d.name, read: v >= 60 ? "Ready to step up" : v >= 50 ? "A year or two away" : "Not ready yet" });
  }
  return out;
}


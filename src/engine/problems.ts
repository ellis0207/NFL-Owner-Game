// Open problems: what is going wrong around the club that no single memo asks
// about. The decision queue holds things to decide; this list holds things
// that are wrong and stay wrong until something changes: a thin cash cushion,
// an unhappy partner, a promise to the board that is slipping, a coach on a
// playoffs-or-else season, a GM who has stopped trusting the owner, a sour
// locker room. Each one remembers when it was first seen, and a problem left
// alone for two months is marked more serious.
import { cashBalance } from "./business";
import { reserveTarget } from "./books";
import { staff } from "./coaches";
import { culture, gmTrustWord } from "./culture";
import { addDays, daysBetween, shortDate, weekday } from "./dates";
import { EXEC_KEYS, EXEC_ROLES, execRole, execs } from "./executives";
import { fanBase } from "./fans";
import { money } from "./inbox";
import { RULES } from "./league";
import { covenants, moodWord } from "./investors";
import { openPledge, pledgeOnTrack } from "./boardroom";
import { standings } from "./standings";
import type { GameState } from "./types";

export interface Problem {
  id: string;
  title: string;
  detail: string;
  side: "football" | "business" | "owner";
  /** 1 worth watching, 2 serious, 3 urgent. */
  severity: number;
  since: string;
  link: { screen: string; tab?: string };
}

const ROSTER = new Set(["active", "camp"]);

function gather(state: GameState): Omit<Problem, "since">[] {
  const out: Omit<Problem, "since">[] = [];
  const cash = cashBalance(state);
  const reserve = reserveTarget(state);
  // Below zero is on the decision queue already; this is the thin cushion above it.
  if (cash >= 0 && cash < reserve) out.push({
    id: "cash-reserve", side: "business", severity: cash < reserve / 2 ? 2 : 1, link: { screen: "Business", tab: "Financing" },
    title: "Cash below the reserve", detail: `${money(cash)} on hand against a ${money(reserve)} reserve policy. No distributions until it's rebuilt, and one bad month means borrowing.`,
  });
  for (const c of state.investors?.partners.length || state.debt ? covenants(state) : []) {
    if (!c.ok) out.push({ id: `covenant:${c.what.slice(0, 24)}`, side: "business", severity: 3, link: { screen: "Ownership" }, title: "A covenant is broken", detail: `${c.what}. ${c.status}.` });
  }
  for (const p of state.investors?.partners ?? []) {
    if (p.mood < 42) out.push({
      id: `partner:${p.id}`, side: "owner", severity: p.mood < 25 ? 3 : 2, link: { screen: "Ownership" },
      title: `${p.name}: ${moodWord(p.mood).toLowerCase()}`, detail: `${p.complaints} complaint${p.complaints === 1 ? "" : "s"} so far. An unhappy partner votes against reserved matters and, past a point, asks to be bought out.`,
    });
  }
  const pl = openPledge(state);
  if (pl && !pledgeOnTrack(state, pl)) {
    const days = daysBetween(state.date, pl.due);
    out.push({
      id: `pledge:${pl.made}`, side: "owner", severity: days <= 30 ? 3 : 2, link: { screen: "Ownership" },
      title: "A pledge to the board is slipping", detail: `"${pl.text}." Checked ${shortDate(pl.due)}, ${days} days from now. As things stand it would be broken.`,
    });
  }
  const u = state.crossroads?.ultimatum;
  if (u && u.season === RULES.season && state.date <= RULES.keyDates.regularSeasonEnd) {
    const c = staff(state).people[u.coach];
    const r = standings(state)[state.userTeam];
    if (c && c.team === state.userTeam) out.push({
      id: "ultimatum", side: "football", severity: 2, link: { screen: "Standings" },
      title: `Playoffs or else for ${c.name}`, detail: `You told him and the city: playoffs this season. ${r && r.w + r.l + r.t ? `We're ${r.w}-${r.l}${r.t ? `-${r.t}` : ""}.` : "The season hasn't started."} Black Monday will hold you to it.`,
    });
  }
  if (state.culture) {
    const t = culture(state).gmTrust;
    if (t < 42) out.push({ id: "gm-trust", side: "football", severity: t < 28 ? 3 : 2, link: { screen: "Front office", tab: "Culture" }, title: "The GM's trust is low", detail: `${gmTrustWord(t)}. A GM who feels second-guessed shares less and leaves sooner.` });
  }
  if (state.fans) {
    const f = fanBase(state);
    if (f.trust < 45) out.push({ id: "fan-trust", side: "business", severity: f.trust < 30 ? 3 : 2, link: { screen: "Business" }, title: "Fans don't trust the owner", detail: "Renewals, the waiting list and walk-up sales all soften. Winning helps; so do keeping promises and fair prices." });
  }
  const roster = Object.values(state.players).filter((ps) => ps.team === state.userTeam && ROSTER.has(ps.status));
  if (roster.length) {
    const morale = roster.reduce((t, ps) => t + (ps.morale ?? 70), 0) / roster.length;
    if (morale < 55) out.push({ id: "morale", side: "football", severity: morale < 45 ? 3 : 2, link: { screen: "Roster" }, title: "The locker room is sour", detail: "Players are unhappy with their roles, their contracts or the direction. It shows in effort, in the press and in who wants to re-sign." });
  }
  if (state.execs) {
    for (const role of EXEC_KEYS) {
      const e = execRole(state, role);
      if (e && e.satisfaction < 35) out.push({ id: `exec:${role}`, side: "business", severity: 1, link: { screen: "Front office", tab: "People" }, title: `${e.name} is unhappy`, detail: `The ${EXEC_ROLES[role].label.toLowerCase()} has been overruled, under-paid or passed over. Other clubs call unhappy executives first.` });
      if (!e && !EXEC_ROLES[role].optional && !execs(state).searches.some((s) => s.role === role)) out.push({ id: `vacant:${role}`, side: "business", severity: 1, link: { screen: "Front office", tab: "People" }, title: `No ${EXEC_ROLES[role].label.toLowerCase()}`, detail: "The job is open and no search is running. A deputy covers, not as well." });
    }
  }
  return out;
}

/** What's wrong now, most serious first, with how long each has been going on. */
export function openProblems(state: GameState): Problem[] {
  const seen = state.problems?.seen ?? {};
  return gather(state).map((p) => {
    const since = seen[p.id] ?? state.date;
    // Left alone for two months, a problem becomes a bigger one.
    const severity = Math.min(3, p.severity + (since <= addDays(state.date, -60) ? 1 : 0));
    return { ...p, since, severity };
  }).sort((a, b) => b.severity - a.severity || a.since.localeCompare(b.since));
}

/** Mondays: note when each problem first appeared and forget the ones that are gone. */
export function problemsDaily(state: GameState): void {
  if (weekday(state.date) !== "Monday" || (state.tenure && state.tenure.role !== "control")) return;
  const s = (state.problems ??= { seen: {} });
  const now = new Set<string>();
  for (const p of gather(state)) {
    now.add(p.id);
    s.seen[p.id] ??= state.date;
  }
  for (const id of Object.keys(s.seen)) if (!now.has(id)) delete s.seen[id];
}

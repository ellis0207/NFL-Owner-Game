// The owner's decision queue: everything that needs the owner today, from
// every system, in one ranked list. Each item says why it matters, when it
// runs out, who recommends what, and what happens if the owner does nothing,
// and points at the exact place to act. Memos, offers, staff approvals,
// approaching deadlines with something wrong, money and roster problems,
// important staff messages and what the staff did under delegated authority
// all come through here.
//
// How involved the owner is (settings.involvement) decides what reaches the
// queue: a hands-off owner sees the major strategic calls, a hands-on owner
// sees everything plus a reading of every department.
import { capSummary } from "./cap";
import { openSearches, proposals as staffProposals } from "./carousel";
import { ROLE_NAME, staff } from "./coaches";
import { daysBetween, shortDate } from "./dates";
import { office, setMode } from "./delegation";
import { memoPriority, messagePriority } from "./desk";
import { money } from "./inbox";
import { PLAYER_BY_ID, RULES, teamLabel } from "./league";
import { openQuestions } from "./press";
import { off, pendingFreeAgents } from "./offseason";
import { MEDIA_BY_ID } from "./outlets";
import { roomProposals } from "./positionCoaches";
import { rosterCount } from "./roster";
import { business, cashBalance } from "./business";
import { teamPlayerIds } from "./cap";
import { budgetLeft } from "./scouting";
import { openDecisions } from "./discipline";
import { ourCases } from "./compliance";
import { franchise } from "./franchisemarket";
import type { DecisionArea, GameState, Memo } from "./types";

const M = 1_000_000;

export type QueueKind = "approval" | "deadline" | "problem" | "recommendation" | "review";

/** Where the owner acts on an item: a page (and tab), or a player's panel or talks. */
export interface QueueLink {
  screen: string;
  tab?: string;
  player?: string;
  talks?: string;
}

export interface QueueItem {
  id: string;
  kind: QueueKind;
  /** Football, business or the owner's own affairs. */
  side: "football" | "business" | "owner";
  title: string;
  /** Why it matters. */
  why: string;
  /** The last day to act, if there is one. */
  expires?: string;
  /** Who recommends what. */
  recommends?: string;
  /** What happens if the owner does nothing. */
  ifNothing: string;
  link: QueueLink;
  /** A major strategic call: reaches even a hands-off owner. */
  major: boolean;
  score: number;
  /** A memo the queue can decide in place. */
  memo?: string;
  /** A trade offer, booking or staff proposal the queue can answer in place. */
  answer?: { kind: "trade" | "booking" | "staff" | "room"; id: string };
  /** Choices the queue offers in place for other calls (an owner decision, a league case). */
  choices?: { kind: "decision" | "case" | "appeal"; id: string; options: { key: string; label: string }[]; recommended?: string };
}

export type Involvement = "handsOff" | "standard" | "handsOn";

export const INVOLVEMENT: Record<Involvement, { label: string; what: string }> = {
  handsOff: { label: "Hands-off", what: "Your executives run the routine business (pricing, bookings, sponsors) and the queue brings you only the major strategic calls." },
  standard: { label: "Standard", what: "The queue brings you every decision waiting on you." },
  handsOn: { label: "Hands-on", what: "Everything reaches the queue, and you get a reading of every department each day." },
};

export function involvement(state: GameState): Involvement {
  return state.settings.involvement ?? "standard";
}

/** The areas a hands-off owner leaves to the executives. */
const ROUTINE: DecisionArea[] = ["pricing", "events", "sponsors"];

export function setInvolvement(state: GameState, to: Involvement): void {
  state.settings.involvement = to;
  if (to === "handsOff") for (const a of ROUTINE) setMode(state, a, "delegate", true);
  // Coming back in, nothing is taken away from the staff without the owner choosing it on Decision rights.
}

const daysLeft = (state: GameState, d: string) => Math.max(0, daysBetween(state.date, d));

/** Urgency from the days left: 40 today, falling to 0 after ten days. */
function urgency(state: GameState, expires?: string): number {
  if (!expires) return 10;
  return Math.max(0, 40 - daysLeft(state, expires) * 4);
}

function memoItem(state: GameState, m: Memo): QueueItem {
  const p = memoPriority(state, m);
  const rec = m.options[m.recommend];
  const major = p.why.includes("Strategic") || Math.abs(m.amount ?? 0) >= 10 * M;
  const football = m.area === "signings" || m.area === "trades" || m.area === "coaching" || m.kind === "signing" || m.kind === "trade" || m.kind === "coachReview";
  return {
    id: `memo:${m.id}`, kind: "approval", side: football ? "football" : m.kind === "execReview" ? "owner" : "business",
    title: m.title, why: m.problem, expires: m.deadline,
    recommends: rec ? `${m.from} recommends: ${rec.label}${m.conditions ? ` (${m.conditions})` : ""}` : undefined,
    ifNothing: m.ifLate || "The memo lapses and the staff fall back on the usual practice.",
    link: { screen: "Front office", tab: "Memos" }, major, score: p.score + (major ? 10 : 0), memo: m.id,
  };
}

function tradeItems(state: GameState): QueueItem[] {
  return (state.trades?.offers ?? []).filter((o) => o.status === "open").map((o) => {
    const names = (side: number) => o.send[side]?.filter((a) => a.kind === "player").map((a) => PLAYER_BY_ID[a.id]?.name).filter(Boolean).join(", ");
    const gets = names(0), gives = names(1);
    return {
      id: `trade:${o.id}`, kind: "approval" as const, side: "football" as const,
      title: `Trade offer from the ${teamLabel(o.teams[0])}`,
      why: `${gives ? `They want ${gives}` : "They want picks"}${gets ? ` and offer ${gets}` : ""}. ${o.note}`.trim(),
      expires: o.expires, recommends: "The GM has the offer written up on the Trades page.",
      ifNothing: `The offer expires ${shortDate(o.expires)}; nothing changes on the roster.`,
      link: { screen: "Trades", tab: "offers" }, major: true, score: urgency(state, o.expires) + 25, answer: { kind: "trade", id: o.id },
    };
  });
}

function bookingItems(state: GameState): QueueItem[] {
  return business(state).events.filter((e) => e.status === "offered").map((e) => ({
    id: `booking:${e.id}`, kind: "approval" as const, side: "business" as const,
    title: `Booking request: ${e.name}`,
    why: `A promoter wants the stadium on ${shortDate(e.date)}${e.low && e.high ? `; the event staff estimate ${money(e.low)} to ${money(e.high)} for us` : ""}.`,
    expires: e.expires, recommends: "The stadium staff will take it if you leave it to them under delegated bookings.",
    ifNothing: `The request lapses ${e.expires ? shortDate(e.expires) : "soon"} and the date stays open.`,
    link: { screen: "Business", tab: "Stadium" }, major: false, score: urgency(state, e.expires) + 5, answer: { kind: "booking", id: e.id },
  }));
}

function staffItems(state: GameState): QueueItem[] {
  const out: QueueItem[] = [];
  const people = staff(state).people;
  for (const p of staffProposals(state)) {
    const top = p.role === "OC" || p.role === "DC";
    out.push({
      id: `staff:${p.id}`, kind: "approval", side: "football",
      title: `Approve ${people[p.candidate]?.name ?? "a candidate"} as ${ROLE_NAME[p.role]}`,
      why: p.reason, recommends: `${people[p.by]?.name ?? "The head coach"} recommends the hire.`,
      ifNothing: "The job stays open and the head coach keeps waiting on you; the candidate may take another job.",
      link: { screen: "Staff" }, major: top, score: 20 + (top ? 10 : 0), answer: { kind: "staff", id: p.id },
    });
  }
  for (const p of roomProposals(state)) {
    out.push({
      id: `room:${p.id}`, kind: "recommendation", side: "football",
      title: `Position coach: ${people[p.candidate]?.name ?? "a candidate"} for the ${p.room} room`,
      why: p.reason, recommends: "The head coach recommends the hire.",
      ifNothing: "The room keeps its current coaching.",
      link: { screen: "Staff" }, major: false, score: 12, answer: { kind: "room", id: p.id },
    });
  }
  for (const s of openSearches(state, state.userTeam)) {
    const top = s.role === "HC" || s.role === "GM";
    out.push({
      id: `search:${s.role}`, kind: "approval", side: "football",
      title: `Open job: ${ROLE_NAME[s.role]}`,
      why: s.agreed ? `${people[s.agreed.id]?.name ?? "A candidate"} has agreed terms and waits on your hire.` : `${Object.keys(s.interviews).length} candidates interviewed so far.${s.interim ? ` ${people[s.interim]?.name ?? "An interim"} is filling in.` : ""}`,
      ifNothing: s.interim ? "The interim keeps the job, and the best candidates go elsewhere as other searches close." : "The job stays empty and the best candidates go elsewhere.",
      link: { screen: "Staff" }, major: top, score: (top ? 35 : 15) + (s.agreed ? 10 : 0),
    });
  }
  return out;
}

function talksItems(state: GameState): QueueItem[] {
  const out: QueueItem[] = [];
  const cap = RULES.salaryCap;
  for (const n of Object.values(state.negotiations)) {
    if (n.team !== state.userTeam || n.status !== "open" || n.handler !== "owner" || n.pending) continue;
    const p = PLAYER_BY_ID[n.player];
    const last = n.rounds[n.rounds.length - 1];
    const big = cap > 0 && n.ask >= cap * 0.04;
    out.push({
      id: `talks:${n.player}`, kind: "approval", side: "football",
      title: `Your move in talks with ${p?.name ?? "a player"}`,
      why: `The agent answered${last ? ` on ${shortDate(last.date)}` : ""}${last?.from === "agent" ? `, asking about ${money(n.ask)} a year` : ""}. Agents lose patience when a reply waits.`,
      recommends: "The GM's notes are in the talks.",
      ifNothing: "The agent's patience runs down and other teams can step in.",
      link: { screen: "Contracts", talks: n.player }, major: big, score: 22 + (big ? 10 : 0),
    });
  }
  for (const id of teamPlayerIds(state, state.userTeam)) {
    const h = state.players[id].holdout;
    if (!h) continue;
    out.push({
      id: `holdout:${id}`, kind: "problem", side: "football",
      title: `${PLAYER_BY_ID[id]?.name ?? "A player"} is ${h.kind === "holdout" ? "holding out" : "holding in"}`,
      why: `Since ${shortDate(h.since)}. ${h.kind === "holdout" ? "He's missing practice and running up fines." : "He reports but won't practice fully."}`,
      ifNothing: "It drags on into the season and the locker room notices.",
      link: { screen: "Contracts", talks: id }, major: true, score: 30,
    });
  }
  return out;
}

function pressItems(state: GameState): QueueItem[] {
  return openQuestions(state).map((q) => ({
    id: `press:${q.id}`, kind: "deadline" as const, side: "owner" as const,
    title: `Request for comment: ${MEDIA_BY_ID[q.outlet]?.name ?? "a reporter"}`,
    why: q.question, expires: q.expires,
    ifNothing: "The story runs with \"declined to comment\", which reads differently depending on the topic.",
    link: { screen: "Media", tab: "Press room" }, major: false, score: urgency(state, q.expires),
  }));
}

/** Deadlines in the next two weeks where something of ours isn't ready. */
function deadlineItems(state: GameState): QueueItem[] {
  const out: QueueItem[] = [];
  const k = RULES.keyDates;
  const us = state.userTeam;
  const soon = (d: string | undefined, days = 14) => !!d && d >= state.date && daysLeft(state, d) <= days;
  const real = state.settings.capRules === "real";
  const counts = rosterCount(state, us);
  if (soon(k.rosterCutdown) && counts.roster > 53) {
    out.push({
      id: "deadline:cutdown", kind: "deadline", side: "football",
      title: `Cut ${counts.roster - 53} to reach 53 by ${shortDate(k.rosterCutdown)}`,
      why: `We carry ${counts.roster}. Every team must be at 53 by 4 PM on cutdown day.`, expires: k.rosterCutdown,
      recommends: "The coaches' bubble list is on the Camp page.",
      ifNothing: "The GM and head coach make the cuts by their own lights.",
      link: { screen: "Camp" }, major: true, score: urgency(state, k.rosterCutdown) + 20,
    });
  }
  // The new league year: every team must be under next year's cap.
  if (real && soon(k.newLeagueYear, 30)) {
    const space = capSummary(state, us, RULES.season + 1).space;
    if (space < 0) {
      out.push({
        id: "deadline:leagueyear", kind: "deadline", side: "football",
        title: `${money(-space)} over next year's cap`,
        why: `Every team must be under the cap when the league year opens ${shortDate(k.newLeagueYear)}.`, expires: k.newLeagueYear,
        recommends: "The cap staff list restructures and cuts on the Cap page.",
        ifNothing: "The GM cuts or restructures to get under, choosing the players himself.",
        link: { screen: "Cap" }, major: true, score: urgency(state, k.newLeagueYear) + 30,
      });
    }
  }
  if (soon(k.franchiseTagDeadline, 21) && state.date >= (k.franchiseTagWindowOpens ?? k.franchiseTagDeadline)) {
    const tagged = off(state).tags?.[us]?.player;
    const expiring = pendingFreeAgents(state, us).filter((id) => id !== tagged);
    if (expiring.length) {
      out.push({
        id: "deadline:tag", kind: "deadline", side: "football",
        title: `Tag decisions due ${shortDate(k.franchiseTagDeadline)}`,
        why: `${expiring.length} of our players' contracts end with the league year. A tag keeps one of them for a year at a set price.`,
        expires: k.franchiseTagDeadline, recommends: "The GM's view of each is on the Contracts page.",
        ifNothing: "They reach free agency, where other teams can sign them.",
        link: { screen: "Contracts" }, major: true, score: urgency(state, k.franchiseTagDeadline) + 15,
      });
    }
  }
  if (soon(k.tradeDeadline, 7)) {
    out.push({
      id: "deadline:trade", kind: "deadline", side: "football",
      title: `Trade deadline ${shortDate(k.tradeDeadline)}`,
      why: "The last chance to add or sell players this season.",
      expires: k.tradeDeadline, ifNothing: "The roster stays as it is through the playoffs.",
      link: { screen: "Trades" }, major: false, score: urgency(state, k.tradeDeadline),
    });
  }
  return out;
}

/** Money and roster trouble that needs the owner. */
function problemItems(state: GameState): QueueItem[] {
  const out: QueueItem[] = [];
  const us = state.userTeam;
  if (state.settings.capRules === "real" && state.date < RULES.keyDates.superBowl) {
    const space = capSummary(state, us).space;
    if (space < 0) out.push({
      id: "problem:cap", kind: "problem", side: "football", title: `${money(-space)} over the cap`,
      why: "The league blocks signings, and fines and lost picks follow if it stands.",
      ifNothing: "The league can void moves and fine the club.", link: { screen: "Cap" }, major: true, score: 60,
    });
  }
  const cash = cashBalance(state);
  if (cash < 0) out.push({
    id: "problem:cash", kind: "problem", side: "business", title: `Club cash is ${money(cash)}`,
    why: "Bills and payroll keep coming. The credit line, a capital call or cuts in spending cover a shortfall.",
    recommends: "The CFO's options are on the Business page under Financing.",
    ifNothing: "Suppliers tighten terms, lenders take notice and, if it lasts, the league steps in.",
    link: { screen: "Business", tab: "Financing" }, major: true, score: 55,
  });
  const counts = rosterCount(state, us);
  const inSeason = state.date > RULES.keyDates.rosterCutdown && state.date <= RULES.keyDates.superBowl;
  if (inSeason && counts.roster < 53) out.push({
    id: "problem:roster", kind: "problem", side: "football", title: `Only ${counts.roster} on the roster`,
    why: "A short roster leaves the game-day lineup thin.",
    ifNothing: "The GM fills spots from the practice squad and the street before the next game.",
    link: { screen: "Free agents" }, major: false, score: 18,
  });
  return out;
}

/** Important unread staff messages (the inbox's priority flags). */
function messageItems(state: GameState): QueueItem[] {
  return state.inbox.filter((i) => !i.read && (i.priority ?? 1) >= 3 && !i.title.startsWith("Decision memo:")).slice(0, 5).map((i) => ({
    id: `message:${i.id}`, kind: "recommendation" as const, side: (i.kind === "business" ? "business" : i.kind === "staff" || i.kind === "transaction" ? "football" : "owner") as QueueItem["side"],
    title: i.title, why: i.body.split("\n")[0].slice(0, 220), recommends: `From ${i.from}.`,
    ifNothing: "It stays in your inbox.", link: { screen: "Inbox" }, major: false, score: messagePriority(state, i).score,
  }));
}

/** What the staff did on their own authority since the owner last looked. */
function reviewItems(state: GameState): QueueItem[] {
  const o = office(state);
  const since = o.reviewed ?? "";
  const done = o.trail.filter((t) => t.approved === "delegated" && t.date > since && daysBetween(t.date, state.date) <= 14);
  if (!done.length) return [];
  const big = done.filter((t) => Math.abs(t.amount ?? 0) >= 5 * M);
  return [{
    id: "review:delegated", kind: "review", side: "business",
    title: `${done.length} decision${done.length > 1 ? "s" : ""} the staff made for you`,
    why: done.slice(0, 4).map((t) => `${t.by}: ${t.what}${t.amount ? ` (${money(t.amount)})` : ""}`).join("; ") + (done.length > 4 ? "; and more." : "."),
    ifNothing: "They stand. The full record is on Front office under Record.",
    link: { screen: "Front office", tab: "Record" }, major: big.length > 0, score: 8 + big.length * 6,
  }];
}

/** Player calls (minicamp absences, public comments), league cases and a club purchase under way. */
function otherItems(state: GameState): QueueItem[] {
  const out: QueueItem[] = [];
  for (const d of openDecisions(state)) {
    const fb = d.options.find((o) => o.key === d.fallback);
    out.push({
      id: `decision:${d.id}`, kind: "approval", side: "football", title: d.title, why: d.body, expires: d.expires,
      recommends: fb ? `The staff will go with "${fb.label}" unless you choose.` : undefined,
      ifNothing: fb ? `The staff go with "${fb.label}".` : "The staff decide.",
      link: { screen: "Camp" }, major: false, score: urgency(state, d.expires) + 8,
      choices: { kind: "decision", id: d.id, options: d.options, recommended: d.fallback },
    });
  }
  for (const k of ourCases(state)) {
    if ((k.stage === "inquiry" || k.stage === "interviews") && !k.response) {
      out.push({
        id: `case:${k.id}`, kind: "approval", side: "owner", title: "League investigation: how do we respond?", why: k.text, expires: k.next,
        recommends: "Counsel usually advises cooperating unless the evidence is thin.",
        ifNothing: "We give the league only what the rules require.",
        link: { screen: "Legal" }, major: true, score: urgency(state, k.next) + 20,
        choices: { kind: "case", id: k.id, options: [{ key: "cooperate", label: "Cooperate fully" }, { key: "limited", label: "Only what's required" }, { key: "contest", label: "Contest it" }], recommended: "cooperate" },
      });
    } else if (k.stage === "sanctioned" && !k.appealed) {
      out.push({
        id: `appeal:${k.id}`, kind: "approval", side: "owner", title: "League sanction: appeal?", why: `${k.sanction ?? k.text}`,
        ifNothing: "The sanction stands.", link: { screen: "Legal" }, major: true, score: 25,
        choices: { kind: "appeal", id: k.id, options: [{ key: "appeal", label: "Appeal" }] },
      });
    }
  }
  const deal = state.franchise?.deal && franchise(state).deal;
  if (deal && deal.stage !== "closed" && deal.stage !== "failed") {
    out.push({
      id: `deal:${deal.id}`, kind: "deadline", side: "owner", title: `Buying the ${teamLabel(deal.team)}: ${deal.stage}`,
      why: deal.stage === "bidding" && !deal.bid ? "Bids are due; we haven't made one." : `The ${deal.stage} stage resolves ${shortDate(deal.due)}.`,
      expires: deal.due, ifNothing: deal.stage === "bidding" && !deal.bid ? "Another buyer wins the club." : "The deal moves on as it stands.",
      link: { screen: "Ownership", tab: "Deals" }, major: true, score: urgency(state, deal.due) + 15,
    });
  }
  return out;
}

/** Everything waiting on the owner, most pressing first, filtered by how involved the owner chose to be. */
export function decisionQueue(state: GameState, all = false): QueueItem[] {
  const memos = (state.office?.memos ?? []).filter((m) => m.status === "open").map((m) => memoItem(state, m));
  const items = [
    ...memos, ...tradeItems(state), ...bookingItems(state), ...staffItems(state), ...talksItems(state),
    ...pressItems(state), ...otherItems(state), ...deadlineItems(state), ...problemItems(state), ...messageItems(state), ...reviewItems(state),
  ];
  const level = involvement(state);
  const shown = all || level !== "handsOff" ? items : items.filter((i) => i.major);
  return shown.sort((a, b) => b.score - a.score || (a.expires ?? "9999").localeCompare(b.expires ?? "9999"));
}

/** Mark everything the staff did up to today as seen. */
export function markReviewed(state: GameState): void {
  office(state).reviewed = state.date;
}

/** How many items a hands-off owner isn't being shown (the staff are handling them). */
export function hiddenMinor(state: GameState): number {
  return involvement(state) === "handsOff" ? decisionQueue(state, true).filter((i) => !i.major).length : 0;
}


// ---- Department readings for a hands-on owner ----

export interface Reading {
  dept: string;
  line: string;
  link: QueueLink;
  /** Something here looks wrong. */
  flag?: boolean;
}

/** One line from each department, with where to look further. */
export function departmentReadings(state: GameState): Reading[] {
  const us = state.userTeam;
  const counts = rosterCount(state, us);
  const injured = teamPlayerIds(state, us).filter((id) => state.players[id].injury).length;
  const cap = state.settings.capRules === "off" ? null : capSummary(state, us).space;
  const cash = cashBalance(state);
  const o = state.office;
  const memos = o?.memos.filter((m) => m.status === "open").length ?? 0;
  const tasks = o?.tasks.filter((t) => t.status === "open").length ?? 0;
  const searches = openSearches(state, us).length;
  const out: Reading[] = [
    { dept: "Roster", line: `${counts.roster} on the roster, ${counts.ps} on the practice squad, ${counts.ir} on injured reserve.`, link: { screen: "Roster" } },
    { dept: "Medical", line: injured ? `${injured} player${injured > 1 ? "s" : ""} hurt.` : "Everyone is healthy.", link: { screen: "Clubhouse" }, flag: injured >= 8 },
    { dept: "Cap", line: cap === null ? "No cap in this game." : `${money(cap)} in cap space.`, link: { screen: "Cap" }, flag: cap !== null && cap < 0 },
    { dept: "Coaching staff", line: searches ? `${searches} job${searches > 1 ? "s" : ""} open.` : "Every job filled.", link: { screen: "Staff" }, flag: searches > 0 },
    { dept: "Scouting", line: state.college ? `${money(budgetLeft(state))} of the scouting budget left.` : "Scouting starts with the college season.", link: { screen: "Scouting" } },
    { dept: "Finance", line: `${money(cash)} in club cash.`, link: { screen: "Business", tab: "Books" }, flag: cash < 0 },
    { dept: "Fans and press", line: `Fans ${state.pressure.fans}/100, press ${state.pressure.media}/100.`, link: { screen: "Media" }, flag: state.pressure.fans < 30 },
    { dept: "Front office", line: `${memos} memo${memos === 1 ? "" : "s"} open, ${tasks} task${tasks === 1 ? "" : "s"} in progress.`, link: { screen: "Front office" } },
  ];
  return out;
}

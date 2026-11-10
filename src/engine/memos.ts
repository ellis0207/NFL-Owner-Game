// The owner's desk: decision memos from the staff, the monthly management
// meeting and the tasks it hands out, and the record of how the club is run
// (incidents, monthly trends, executive reviews, and whether the owner's
// decisions add up to the priorities they set).
//
// It also carries out what the owner delegated: the GM answering trade calls,
// the coaches filling staff jobs, the revenue staff setting prices and signing
// sponsors, stadium operations taking bookings, and the CFO refinancing loans.
import { resolveIncident } from "./departments";
import { budgetVsActual, books } from "./books";
import { answerOffer, business, PRICING_OPENS, post, setBudget, setNextSeasonPrices } from "./business";
import { delegateSearch, openSearches } from "./carousel";
import { staff } from "./coaches";
import { localDeals, LOCAL_CATS, signLocalOffer } from "./commerce";
import { leagueYear } from "./contracts";
import { gmTrust } from "./culture";
import { addDays, daysBetween, shortDate, weekday } from "./dates";
import { acceptLoan, debt } from "./debt";
import {
  addMemo, AREAS, mode, noteDecision, office, officeMood, openMemos, report, sendPriority, weeklyDigest,
} from "./delegation";
import {
  bindExecs, deputy, EXEC_KEYS, EXEC_ROLES, execBoost, execLeaves, execRole, execs, execsNewYear, openExecSearch, poachTarget, retainExec, SEARCH_FIRMS, signer,
} from "./executives";
import { approveSigning, market } from "./freeagency";
import { money, news } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { mediaState } from "./outlets";
import { owner } from "./ownership";
import { decideRoom, roomProposals } from "./positionCoaches";
import { gaussian, rngFor } from "./rng";
import { teamStaff } from "./staff";
import { settle, workplaceMonthly } from "./workplace";
import { standings, winPct } from "./standings";
import { acceptOffer, declineOffer, tradeBalance, trades } from "./trades";
import type { Dept, ExecRole, GameState, LedgerCat, Memo, OfferTerms, OfficeTask, TradeDeal } from "./types";

const M = 1_000_000;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v * 10) / 10));

// Search fees and severance go on the books as professional fees; hires and firings go in the audit trail.
bindExecs((state, amount, note) => post(state, "professional", amount, note), (state, area, what, amount) => noteDecision(state, area, what, amount));

function gm(state: GameState): string {
  const g = teamStaff(state.userTeam).GM;
  return g ? `${g.name}, General Manager` : "General Manager";
}
function hcName(state: GameState): string {
  const h = teamStaff(state.userTeam).HC;
  return h ? `${h.name}, head coach` : "Head coach";
}
function football(state: GameState): string {
  return execRole(state, "FOPS") ? signer(state, "FOPS") : gm(state);
}

// ---- Deciding memos ----

/** The owner decides a memo: the chosen option is carried out and the reason goes in the trail. */
export function decideMemo(state: GameState, id: string, choice: number, why = ""): string | null {
  const m = office(state).memos.find((x) => x.id === id);
  if (!m || (m.status !== "open" && m.status !== "researching")) return "That memo is closed.";
  const err = carryOut(state, m, choice);
  if (err) {
    m.status = "lapsed";
    m.notes.push(err);
    return err;
  }
  m.status = "decided";
  m.choice = choice;
  m.decided = state.date;
  noteDecision(state, m.area ? AREAS[m.area].label.toLowerCase() : m.kind, `${m.title}: ${m.options[choice].label}`, m.amount, m.from, "owner", why || undefined);
  // Executives notice whether their recommendations are taken.
  const role = roleOf(state, m);
  const e = role ? execRole(state, role) : undefined;
  if (e) e.satisfaction = clamp(e.satisfaction + (choice === m.recommend ? 1.5 : -2));
  if (!role && (m.area === "signings" || m.area === "trades" || m.kind === "coachReview") && state.media) {
    state.media.coach = clamp(state.media.coach + (choice === m.recommend ? 0.5 : -0.5));
  }
  // The GM keeps score of whether the owner backs the football staff's calls.
  if (m.area === "signings" || m.area === "trades") gmTrust(state, choice === m.recommend ? 1 : -3, choice === m.recommend ? undefined : `You overruled the GM on ${m.title.toLowerCase()}.`);
  return null;
}

function roleOf(state: GameState, m: Memo): ExecRole | undefined {
  return EXEC_KEYS.find((r) => m.from.startsWith(execRole(state, r)?.name ?? "\u0000") || m.from.startsWith(deputy(state, r)?.name ?? "\u0000"));
}

function carryOut(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  switch (m.kind) {
    case "signing":
      return choice === 0 ? approveSigning(state, p.player as string, p.terms as OfferTerms) : null;
    case "street":
      return choice === 0 ? approveSigning(state, p.player as string, null, p.price as number) : null;
    case "trade": {
      if (choice === 0) {
        const r = acceptOffer(state, p.offer as string);
        return r.ok ? null : r.text;
      }
      declineOffer(state, p.offer as string);
      return null;
    }
    case "pricing": {
      const opts = p.prices as [number, number][];
      return setNextSeasonPrices(state, opts[choice][0], opts[choice][1]);
    }
    case "refinance":
      return choice === 0 ? acceptLoan(state, p.offer as string) : null;
    case "retain": {
      const role = p.role as ExecRole;
      if (choice === 0) retainExec(state, role);
      else execLeaves(state, role, p.where as string);
      return null;
    }
    case "overrun": {
      if (choice === 0) setBudget(state, p.dept as Dept, business(state).budget[p.dept as Dept] - 1);
      return null;
    }
    case "coachReview": {
      const md = mediaState(state);
      md.coach = clamp(md.coach + [6, -1, -10][choice]);
      if (choice === 2) news(state, `Reports: ${TEAM_BY_ID[state.userTeam].name} quietly gauging interest in head coaching candidates`);
      return null;
    }
    case "execReview": {
      if (choice === 1) {
        const role = p.weakest as ExecRole;
        const r = openExecSearch(state, role, SEARCH_FIRMS[1].id);
        return typeof r === "string" ? r : null;
      }
      return null;
    }
    case "complaint":
    case "dispute":
      return settle(state, m, choice);
    case "incident":
      return resolveIncident(state, p, choice);
    default:
      return null;
  }
}

/** Send a memo back for more work: it returns in two days with what the staff found. */
export function researchMemo(state: GameState, id: string): string | null {
  const m = office(state).memos.find((x) => x.id === id);
  if (!m || m.status !== "open") return "That memo isn't waiting on you.";
  if (m.notes.some((n) => n.startsWith("Research"))) return "The staff already went back over this one.";
  m.status = "researching";
  m.until = addDays(state.date, 2);
  // The clock keeps running on deals other people can take; internal matters wait.
  if (!["signing", "street", "trade"].includes(m.kind)) m.deadline = addDays(m.deadline, 2);
  return null;
}

function research(state: GameState, m: Memo): void {
  const rng = rngFor(state.seed, `research:${m.id}`);
  const p = m.payload ?? {};
  let note: string;
  if (m.kind === "signing" || m.kind === "street") {
    const id = p.player as string;
    const fa = market(state)[id];
    const rivals = fa?.offers.filter((o) => o.team !== state.userTeam).length ?? 0;
    note = `Research: ${rivals ? `${rivals} other team${rivals > 1 ? "s are" : " is"} in on ${PLAYER_BY_ID[id].name} now.` : `No other offers for ${PLAYER_BY_ID[id].name} yet.`} ` +
      (fa && m.amount ? (m.amount > fa.ask ? "Our number is above what the agent is asking." : "Our number is at or under the agent's ask.") : "");
  } else if (m.kind === "trade") {
    note = `Research: the scouts rewatched the players involved. ${rng() < 0.5 ? "Nothing changes our view." : "One medical question came back clean."}`;
  } else if (m.kind === "refinance" || m.kind === "pricing") {
    note = `Research: ${signer(state, m.kind === "refinance" ? "CFO" : "CRO")} ran it again with the latest numbers. ${rng() < 0.6 ? "The recommendation stands." : "It's closer than the memo suggests, but the recommendation stands."}`;
  } else note = "Research: the staff went back over it; no change to the recommendation.";
  m.notes.push(note);
  m.status = "open";
  delete m.until;
}

// ---- What the staff writes up or does on its own ----

function delegatedTrades(state: GameState): void {
  const o = office(state);
  const how = mode(state, "trades");
  if (how === "owner") return;
  const seen = (o.seen ??= []);
  for (const offer of trades(state).offers) {
    if (offer.status !== "open" || seen.includes(offer.id)) continue;
    seen.push(offer.id);
    const view = tradeBalance(state, "gm", offer as TradeDeal, 1);
    const good = view.gain > 0;
    const them = TEAM_BY_ID[offer.teams[0]];
    if (how === "delegate") {
      const r = good ? acceptOffer(state, offer.id) : (declineOffer(state, offer.id), { ok: true, text: "" });
      report(state, "trades", gm(state), `${good && r.ok ? "Accepted" : "Turned down"} a trade offer from the ${them.name}`,
        good && r.ok ? "It adds more than it costs us, by our board." : good ? r.text : "It costs more than it brings back, by our board.", { exception: good && r.ok });
      continue;
    }
    addMemo(state, {
      kind: "trade", area: "trades", from: gm(state), title: `Trade offer from the ${them.name}`,
      problem: offer.note || `The ${them.name} called with an offer.`,
      proposal: good ? "Accept it." : "Turn it down.",
      options: [{ label: "Accept", effect: "The trade goes through today if it's still legal." }, { label: "Decline", effect: "We pass." }],
      risks: ["Every player in a trade carries some medical and fit risk."],
      budget: "The cap effects are on the Trades page.",
      recommend: good ? 0 : 1, conditions: good ? "The value adds up on our board." : "By our board we'd be giving up more than we get.",
      deadline: offer.expires, ifLate: "The offer expires.", payload: { offer: offer.id },
    });
  }
  if (seen.length > 200) seen.splice(0, seen.length - 200);
}

function delegatedCoaching(state: GameState): void {
  if (mode(state, "coaching") !== "delegate") return;
  for (const s of openSearches(state, state.userTeam)) {
    if (s.delegated) continue;
    const r = delegateSearch(state, s.role);
    if (r.ok) report(state, "coaching", hcName(state), `Running the ${s.role} search`, r.text);
  }
  for (const p of roomProposals(state)) {
    const r = decideRoom(state, p.id, "approve");
    if (r.ok) report(state, "coaching", hcName(state), "Hired a position coach", r.text);
  }
}

function delegatedEvents(state: GameState): void {
  if (mode(state, "events") !== "delegate") return;
  for (const ev of business(state).events) {
    if (ev.status !== "offered") continue;
    const err = answerOffer(state, ev.id, true);
    report(state, "events", signer(state, "SOD"), `Booked ${ev.name}`, err ?? `${shortDate(ev.date)}, expected to net ${money(ev.low)} to ${money(ev.high)}.`);
  }
}

function delegatedSponsors(state: GameState): void {
  if (mode(state, "sponsors") !== "delegate") return;
  const l = localDeals(state);
  if (!l.window || !l.offers.length) return;
  for (const cat of [...new Set(l.offers.map((o) => o.cat))]) {
    const best = l.offers.filter((o) => o.cat === cat).sort((a, b) => b.value * Math.min(b.years, 4) - a.value * Math.min(a.years, 4))[0];
    if (signLocalOffer(state, best.id)) continue;
    report(state, "sponsors", signer(state, "CRO"), `Signed ${best.partner}`, `${LOCAL_CATS[cat].label}: ${best.years} years at ${money(best.value)} a year.`, { amount: best.value });
  }
}

/** The revenue staff's price proposal for next season: winning and full stands support a rise. */
function priceOptions(state: GameState): [number, number][] {
  const r = standings(state)[state.userTeam];
  const wp = r ? winPct(r.w, r.l, r.t) : 0.5;
  const rec = Math.max(0.97, Math.min(1.08, 1.03 + (wp - 0.5) * 0.1 + (state.pressure.fans - 50) / 1000 + execBoost(state, "CRO") * 0.005));
  const round = (x: number) => Math.round(x * 100) / 100;
  return [[round(rec), round(rec + 0.01)], [1, 1], [round(rec + 0.04), round(rec + 0.05)]];
}

function delegatedPricing(state: GameState): void {
  const how = mode(state, "pricing");
  const b = business(state);
  if (how === "owner" || !PRICING_OPENS || state.date !== addDays(PRICING_OPENS, 3) || b.next || b.renewal) return;
  const opts = priceOptions(state);
  const pct = (x: number) => `${x >= 1 ? "+" : ""}${Math.round((x - 1) * 100)}%`;
  if (how === "delegate") {
    setNextSeasonPrices(state, opts[0][0], opts[0][1]);
    report(state, "pricing", signer(state, "CRO"), `Set ${RULES.season + 1} ticket prices`, `Season tickets ${pct(opts[0][0])}, suites and clubs ${pct(opts[0][1])}.`);
    return;
  }
  addMemo(state, {
    kind: "pricing", area: "pricing", from: signer(state, "CRO"), title: `${RULES.season + 1} ticket prices`,
    problem: `Renewal notices go out once prices are set. We have about ${b.holders.toLocaleString("en-US")} season-ticket holders.`,
    proposal: `Season tickets ${pct(opts[0][0])}, suites and clubs ${pct(opts[0][1])}`,
    options: [
      { label: `Raise ${pct(opts[0][0])}`, effect: "In line with how the season went and the league's usual rise.", evidence: "estimate" },
      { label: "Hold prices", effect: "Holders appreciate it; we give up some revenue.", evidence: "estimate" },
      { label: `Raise ${pct(opts[2][0])}`, effect: "More revenue per seat, but fewer renewals and an unhappy fan base.", evidence: "opinion" },
    ],
    risks: ["A big rise after a bad season costs renewals and goodwill.", "Holding prices leaves money on the table if demand is strong."],
    budget: "The budget assumes the usual 3% rise.", recommend: 0,
    deadline: addDays(state.date, 10), ifLate: "We go with the recommendation.", payload: { prices: opts },
  });
}

function delegatedFinancing(state: GameState): void {
  const how = mode(state, "financing");
  if (how === "owner") return;
  const d = debt(state);
  const byLoan = new Map<string, typeof d.offers>();
  for (const o of d.offers) if (o.purpose === "refinance" && o.refinances) byLoan.set(o.refinances, [...(byLoan.get(o.refinances) ?? []), o]);
  for (const [loan, offers] of byLoan) {
    const best = offers.slice().sort((a, b) => a.rate + a.fee / a.years - (b.rate + b.fee / b.years))[0];
    if (how === "delegate" && best.amount <= office(state).limits.debt) {
      const err = acceptLoan(state, best.id);
      report(state, "financing", signer(state, "CFO"), `Refinanced with ${best.lender}`, err ?? `${money(best.amount)} over ${best.years} years at ${(best.rate * 100).toFixed(2)}%${best.kind === "floating" ? " over the market rate" : ""}.`, { amount: best.amount });
      continue;
    }
    if (openMemos(state).some((m) => m.payload?.loan === loan)) continue;
    const old = d.loans.find((l) => l.id === loan);
    addMemo(state, {
      kind: "refinance", area: "financing", from: signer(state, "CFO"), title: `Refinance the ${old?.lender ?? ""} loan`,
      problem: `${money(old?.balance ?? best.amount)} comes due ${old ? shortDate(old.maturity) + " " + old.maturity.slice(0, 4) : "soon"}. ${offers.length} lender${offers.length > 1 ? "s have" : " has"} sent terms.`,
      proposal: `${best.lender}: ${best.years} years, ${best.kind}, ${(best.rate * 100).toFixed(2)}%${best.kind === "floating" ? " over the market rate" : ""}, ${(best.fee * 100).toFixed(2)}% fee`,
      amount: best.amount, comparables: offers.filter((o) => o !== best).map((o) => `${o.lender}: ${(o.rate * 100).toFixed(2)}%, ${o.years} years`),
      options: [{ label: "Take the best terms", effect: "The new loan pays off the old one today." }, { label: "Wait", effect: "We can ask again; if it matures unpaid, cash, then the credit line, then you cover it." }],
      risks: [best.kind === "floating" ? "Floating debt costs more if rates rise." : "Fixed debt can't be cheaply repaid early."],
      budget: "Interest is in the plan at today's rates.", recommend: 0,
      deadline: best.expires, ifLate: "The terms expire.", payload: { offer: best.id, loan },
    });
  }
}

// ---- Memos the staff raises on its own ----

const DEPT_CATS: Dept[] = ["marketing", "community", "medical", "facilities", "scouts"];

/** A department running well over its budget gets a memo from the CFO. */
function overruns(state: GameState): void {
  const year = leagueYear(state.date);
  for (const row of budgetVsActual(state, year)) {
    if (!DEPT_CATS.includes(row.cat as Dept)) continue;
    // Costs are negative: an overrun is spending more than 12% (and $1M) past the plan to date.
    if (row.toDate >= 0 || row.variance > 0.12 * row.toDate || row.variance > -1 * M) continue;
    if (business(state).budget[row.cat as Dept] === 0) continue;
    if (office(state).memos.some((m) => m.kind === "overrun" && m.payload?.dept === row.cat && m.payload?.year === year)) continue;
    addMemo(state, {
      kind: "overrun", from: signer(state, "CFO"), title: `${cap(row.cat)} is over budget`,
      problem: `${cap(row.cat)} has spent ${money(-row.actual)} so far against ${money(-row.toDate)} planned to date, and is on course to finish ${money(row.plan - row.projected)} over.`,
      proposal: "Cut the department back one budget level for the rest of the year.", amount: row.projected - row.plan,
      options: [{ label: "Cut back a level", effect: "Spending drops from next month; so does what the department delivers." }, { label: "Accept the overrun", effect: "We keep spending and miss the budget." }],
      risks: ["Cuts mid-year are felt by the people who use the department."], budget: `Plan for the year: ${money(-row.plan)}.`,
      recommend: owner(state).weights.profit >= 3 ? 0 : 1, deadline: addDays(state.date, 14), ifLate: "Spending carries on as it is.",
      payload: { dept: row.cat, year },
    });
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Other clubs come for our best people once a year. */
function poaching(state: GameState): void {
  for (const role of EXEC_KEYS) {
    const where = poachTarget(state, role);
    const e = execRole(state, role);
    if (!where || !e) continue;
    addMemo(state, {
      kind: "retain", from: signer(state, "PRES"), title: `Keep ${e.name}?`,
      problem: `${e.name}, our ${EXEC_ROLES[role].label.toLowerCase()}, has been offered the job of ${where}.`,
      proposal: "Match it with a raise and an extra year.", amount: Math.round((e.contract?.salary ?? 0) * 0.25),
      options: [{ label: "Give a raise and an extra year", effect: "Pay goes up 25%; they stay." }, { label: "Let them go", effect: `The deputy, ${deputy(state, role)?.name ?? "nobody"}, acts in the job until you hire.` }],
      risks: ["Losing a good executive mid-year sets the department back."], budget: "The raise comes out of the business office budget.",
      recommend: 0, deadline: addDays(state.date, 7), ifLate: "They take the other job.", payload: { role, where },
    });
  }
}

/** Two days after the regular season, football operations sizes up the head coach. */
function coachReview(state: GameState): void {
  const r = standings(state)[state.userTeam];
  if (!r) return;
  const exp = Math.round((staff(state).expect[state.userTeam] ?? 0.5) * 17);
  const wins = r.w + r.t / 2;
  const verdict = wins >= exp + 2 ? "beat expectations clearly" : wins >= exp - 1 ? "about met expectations" : "fell short of expectations";
  addMemo(state, {
    kind: "coachReview", from: football(state), title: `${hcName(state).split(",")[0]}'s season`,
    problem: `We went ${r.w}-${r.l}${r.t ? `-${r.t}` : ""} with a roster that looked like about ${exp} wins going in. The staff ${verdict}.`,
    proposal: wins >= exp - 1 ? "Back the head coach publicly going into the offseason." : "Make it clear next season has to be better.",
    options: [
      { label: "Back the coach", effect: "The coach and the room know where they stand." },
      { label: "Set expectations", effect: "A frank talk about next season, kept private." },
      { label: "Start looking around", effect: "Quiet calls about replacements. It will leak." },
    ],
    risks: ["Mixed signals hurt the coach's standing with the players."], budget: "No cost unless the staff changes (Staff page).",
    recommend: wins >= exp - 1 ? 0 : 1, deadline: addDays(state.date, 10), ifLate: "Nothing is said, which says something too.",
  });
}

// ---- Executive reviews ----

/** One season's score for each executive, from what their department delivered. */
export function execScores(state: GameState, year: number): Partial<Record<ExecRole, { score: number; text: string }>> {
  const rows = new Map<LedgerCat, { plan: number; actual: number }>();
  for (const r of budgetVsActual(state, year)) rows.set(r.cat, { plan: r.plan, actual: r.actual });
  const o = office(state);
  const inYear = (d: string) => leagueYear(d) === year;
  const incidents = (k: string) => o.incidents.filter((i) => i.kind === k && inYear(i.date)).length;
  const vs = (cat: LedgerCat, good: "more" | "less") => {
    const r = rows.get(cat);
    if (!r || !r.plan) return 0;
    const miss = (r.actual - r.plan) / Math.abs(r.plan);
    return good === "more" ? miss : miss;
  };
  const trend = o.trends.filter((t) => t.month.startsWith(String(year)) || t.month.startsWith(String(year + 1)));
  const fanMove = trend.length >= 2 ? trend[trend.length - 1].fans - trend[0].fans : 0;
  const close = books(state).closed.find((c) => c.year === year);
  const out: Partial<Record<ExecRole, { score: number; text: string }>> = {};
  const set = (role: ExecRole, score: number, text: string) => { if (execRole(state, role) || deputy(state, role)) out[role] = { score: Math.round(clamp(score, 5, 99)), text }; };
  const forecastMiss = close && close.planOperating ? (close.operating - close.planOperating) / Math.max(10 * M, Math.abs(close.planOperating)) : 0;
  set("CFO", 60 + forecastMiss * 120 - debt(state).tests.filter((t) => !t.ok && inYear(t.date)).length * 12, close ? `Operating income ${forecastMiss >= 0 ? "beat" : "missed"} the budget by ${money(Math.abs(close.operating - close.planOperating))}.` : "No full year closed yet.");
  set("CRO", 60 + vs("sponsorship", "more") * 400, `Sponsorship ${vs("sponsorship", "more") >= 0 ? "ahead of" : "behind"} plan by ${Math.abs(vs("sponsorship", "more") * 100).toFixed(1)}%.`);
  set("COO", 60 - vs("businessOps", "less") * 300 - incidents("operations") * 5, `Business office costs ${vs("businessOps", "less") <= 0 ? "under" : "over"} plan; ${incidents("operations")} operations incident${incidents("operations") === 1 ? "" : "s"}.`);
  set("GC", 72 - incidents("compliance") * 14, `${incidents("compliance")} compliance matter${incidents("compliance") === 1 ? "" : "s"} this year.`);
  set("SOD", 68 - incidents("operations") * 10 + business(state).events.filter((e) => e.status === "held" && inYear(e.date)).length, `${incidents("operations")} game-day or venue problem${incidents("operations") === 1 ? "" : "s"}.`);
  set("MKT", 60 + fanMove * 1.5, `Fan sentiment ${fanMove >= 0 ? "up" : "down"} ${Math.abs(Math.round(fanMove))} points over the year.`);
  set("CTO", 72 - incidents("systems") * 14, `${incidents("systems")} systems incident${incidents("systems") === 1 ? "" : "s"}.`);
  const r = standings(state)[state.userTeam];
  if (r) set("FOPS", 60 + ((r.w + r.t / 2) - (staff(state).expect[state.userTeam] ?? 0.5) * 17) * 5, `The team went ${r.w}-${r.l}${r.t ? `-${r.t}` : ""}.`);
  const others = Object.values(out).map((v) => v!.score);
  set("PRES", others.length ? others.reduce((a, b) => a + b, 0) / others.length : 60, "The business side as a whole.");
  return out;
}

/** At the close of each league year: reviews for every executive, growth and renewals. */
function yearEnd(state: GameState, prev: number): void {
  if (!state.execs) return;
  const scores = execScores(state, prev);
  const lines: string[] = [];
  let weakest: { role: ExecRole; score: number } | null = null;
  for (const role of EXEC_KEYS) {
    const s = scores[role];
    const e = execRole(state, role);
    if (!s || !e) continue;
    e.reviews.unshift({ year: prev, score: s.score, text: s.text });
    e.reviews = e.reviews.slice(0, 10);
    lines.push(`${EXEC_ROLES[role].label}, ${e.name}: ${s.score} (${s.text})`);
    if (!weakest || s.score < weakest.score) weakest = { role, score: s.score };
  }
  execsNewYear(state);
  if (!lines.length) return;
  addMemo(state, {
    kind: "execReview", from: signer(state, "PRES"), title: `${prev} executive reviews`,
    problem: lines.join("\n"), proposal: weakest && weakest.score < 45 ? `Look for a new ${EXEC_ROLES[weakest.role].label.toLowerCase()}.` : "Keep the team together.",
    options: [{ label: "Accept the reviews", effect: "Everyone stays." }, { label: weakest ? `Search for a new ${EXEC_ROLES[weakest.role].label.toLowerCase()}` : "Open a search", effect: "A search firm brings candidates; the current holder keeps the job until you hire." }],
    risks: ["Turnover at the top costs fees, severance and the club's name as an employer."], budget: "Searches cost a third of first-year pay at the top firm.",
    recommend: weakest && weakest.score < 45 ? 1 : 0, deadline: addDays(state.date, 21), ifLate: "The reviews stand.", payload: { weakest: weakest?.role },
  });
}

// ---- Meetings and tasks ----

export const TASKS: Record<string, { label: string; who: ExecRole | "GM"; days: number; what: string }> = {
  savings: { label: "Find cost savings", who: "COO", days: 45, what: "Trim the business office for the rest of the league year." },
  sponsorPush: { label: "Push for new sponsors", who: "CRO", days: 45, what: "Sell the open inventory: signage, digital, community partners." },
  bookingPush: { label: "Book more stadium events", who: "SOD", days: 60, what: "Chase promoters for open dates." },
  compliance: { label: "Run a compliance review", who: "GC", days: 30, what: "Policies, contracts and training, so trouble is less likely for a year." },
  refinancing: { label: "Lay out refinancing options", who: "CFO", days: 21, what: "What our loans would cost to refinance today." },
  rosterReport: { label: "Report on the roster", who: "GM", days: 7, what: "Where the roster is thin and what it would cost to fix." },
};

/** The owner hands a task to the executive accountable for it. */
export function assignTask(state: GameState, kind: string): string | null {
  const t = TASKS[kind];
  const o = office(state);
  if (!t) return "No such task.";
  if (o.tasks.some((x) => x.kind === kind && x.status === "open")) return "That's already being worked on.";
  if (t.who !== "GM" && !execRole(state, t.who) && !deputy(state, t.who)) return `Nobody is in the ${EXEC_ROLES[t.who].label.toLowerCase()} job.`;
  o.tasks.unshift({ id: `task-${state.date}-${o.tasks.length}`, title: t.label, kind, who: t.who, set: state.date, due: addDays(state.date, t.days), status: "open" });
  o.tasks = o.tasks.slice(0, 60);
  noteDecision(state, "tasks", `Asked for: ${t.label.toLowerCase()}`, undefined, "Owner", "owner");
  return null;
}

function finishTask(state: GameState, t: OfficeTask): void {
  const o = office(state);
  const boost = t.who === "GM" ? 0 : execBoost(state, t.who);
  const rng = rngFor(state.seed, `task:${t.id}`);
  const who = t.who === "GM" ? gm(state) : signer(state, t.who);
  const year = leagueYear(state.date);
  let result: string;
  switch (t.kind) {
    case "savings": {
      const rate = Math.max(0.005, 0.02 + 0.02 * boost + gaussian(rng) * 0.005);
      o.savings = { year, rate: Math.round(rate * 1000) / 1000 };
      result = `Found savings of about ${(rate * 100).toFixed(1)}% of the business office budget through the end of the league year.`;
      break;
    }
    case "sponsorPush": {
      const amount = Math.round(Math.max(0, (1.2 + 1.5 * boost + gaussian(rng) * 0.6) * M) / 10_000) * 10_000;
      if (amount) post(state, "sponsorship", amount, "Short-term partnerships from the sales push");
      result = amount ? `Closed ${money(amount)} of short-term partnerships.` : "Came up empty; the market is soft.";
      break;
    }
    case "bookingPush": {
      o.bookingPush = addDays(state.date, 120);
      const amount = Math.round(Math.max(0, (0.6 + 0.8 * boost + gaussian(rng) * 0.4) * M) / 10_000) * 10_000;
      if (amount) post(state, "events", amount, "Extra bookings: corporate and community events");
      result = amount ? `Filled open dates with corporate and community events worth ${money(amount)}.` : "No new bookings stuck.";
      break;
    }
    case "compliance":
      o.compliance = addDays(state.date, 365);
      post(state, "professional", -Math.round(0.25 * M), "Compliance review");
      result = "Finished the review ($250K in outside counsel). Trouble should be rarer for a year.";
      break;
    case "refinancing": {
      const loans = debt(state).loans.filter((l) => !l.repaid);
      result = loans.length ? `We have ${loans.length} loan${loans.length > 1 ? "s" : ""} out. Lenders would likely refinance at ${boost > 0.2 ? "slightly better than" : boost < -0.2 ? "slightly worse than" : "about"} today's terms. Request terms on the Business page under Financing if you want them.` : "We have no term loans to refinance.";
      break;
    }
    default: {
      const r = standings(state)[state.userTeam];
      result = `We're ${r ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "between seasons"}. The thinnest spots and their costs are on the Roster and Free Agency pages; I'd look at the positions where we start a backup.`;
    }
  }
  t.status = "done";
  t.result = result;
  sendPriority(state, "business", who, `Done: ${t.title.toLowerCase()}`, result, 1);
}

/** The monthly management meeting: each department's view, the disagreements, and the minutes. */
export function holdMeeting(state: GameState): void {
  const o = office(state);
  const topics: string[] = [];
  const minutes: string[] = [];
  const tasks: string[] = [];
  const year = leagueYear(state.date);
  const rows = budgetVsActual(state, year);
  const op = rows.reduce((t, r) => t + r.variance, 0);
  topics.push("The budget");
  minutes.push(`${signer(state, "CFO")}: we're ${money(Math.abs(op))} ${op >= 0 ? "ahead of" : "behind"} the plan for the year to date.` +
    (op < -3 * M ? ` ${signer(state, "COO").split(",")[0]} thinks a savings drive would help; ${signer(state, "CRO").split(",")[0]} warns cuts to marketing would cost renewals.` : ""));
  if (op < -3 * M) tasks.push("savings");
  const l = state.business && localDeals(state);
  if (l && (l.window || l.vacant.length)) {
    topics.push("Sponsors");
    minutes.push(`${signer(state, "CRO")}: ${l.window ? `the renewal window is open with ${l.offers.length} offers on the table.` : `${l.vacant.length} categories sit empty.`}`);
    tasks.push("sponsorPush");
  }
  const d = state.debt ? debt(state) : null;
  const due = d?.loans.filter((x) => !x.repaid && daysBetween(state.date, x.maturity) <= 365) ?? [];
  if (due.length) {
    topics.push("Debt");
    minutes.push(`${signer(state, "CFO")}: ${due.length} loan${due.length > 1 ? "s" : ""} mature within a year.`);
    tasks.push("refinancing");
  }
  const recent = o.incidents.filter((i) => i.date >= addDays(state.date, -90));
  if (recent.length) {
    topics.push("Incidents");
    minutes.push(`${signer(state, "GC")}: ${recent.length} incident${recent.length > 1 ? "s" : ""} in the last three months. ${recent.some((i) => i.kind === "compliance") ? "A compliance review is overdue." : ""}`);
    if (recent.some((i) => i.kind === "compliance")) tasks.push("compliance");
  }
  const r = standings(state)[state.userTeam];
  topics.push("Football");
  minutes.push(`${football(state)}: ${r && r.w + r.l + r.t ? `we're ${r.w}-${r.l}${r.t ? `-${r.t}` : ""}.` : "the roster work goes on."}`);
  if (state.date < RULES.keyDates.regularSeasonStart) tasks.push("bookingPush");
  o.meetings.unshift({ date: state.date, topics, minutes, tasks });
  o.meetings = o.meetings.slice(0, 24);
}

// ---- Incidents and the monthly record ----

function incidents(state: GameState): void {
  const o = office(state);
  const rng = rngFor(state.seed, `incidents:${state.date}`);
  const review = o.compliance && o.compliance >= state.date ? 0.5 : 1;
  const kinds: { kind: "compliance" | "operations" | "systems"; role: ExecRole; p: number; texts: string[]; cost: [number, number] }[] = [
    { kind: "compliance", role: "GC", p: 0.04 * review, texts: ["A vendor contract dispute went to arbitration.", "The league fined the club over a reporting lapse.", "A former employee filed a complaint."], cost: [0.2, 1.5] },
    { kind: "operations", role: "SOD", p: 0.05, texts: ["A concourse leak closed concession stands for a game.", "A power outage delayed the gates opening.", "A vendor's staffing shortfall left lines out the door."], cost: [0.1, 0.8] },
    { kind: "systems", role: "CTO", p: 0.03, texts: ["The ticketing system went down during a presale.", "A phishing attack reached the business office.", "Scanners failed at two gates on game day."], cost: [0.1, 1.2] },
  ];
  for (const k of kinds) {
    // A strong executive in the job makes trouble rarer; a vacancy makes it likelier.
    if (rng() > k.p * (1 - 0.6 * execBoost(state, k.role))) continue;
    const text = k.texts[Math.floor(rng() * k.texts.length)];
    const cost = Math.round((k.cost[0] + rng() * (k.cost[1] - k.cost[0])) * M / 10_000) * 10_000;
    o.incidents.unshift({ date: state.date, kind: k.kind, text, cost });
    o.incidents = o.incidents.slice(0, 60);
    post(state, "professional", -cost, text);
    if (k.kind !== "compliance") state.pressure.fans = clamp(state.pressure.fans - 1);
    sendPriority(state, "business", signer(state, k.role), cap(k.kind) + " incident", `${text} It cost us about ${money(cost)}.`, 2);
  }
}

function snapshot(state: GameState): void {
  const o = office(state);
  const month = state.date.slice(0, 7);
  if (o.trends.some((t) => t.month === month)) return;
  const md = state.media;
  const rel = md ? Object.values(md.rel) : [];
  const people = state.execs ? Object.values(execs(state).people).filter((e) => e.role) : [];
  o.trends.push({
    month, fans: Math.round(state.pressure.fans), media: Math.round(50 + (rel.length ? rel.reduce((a, b) => a + b, 0) / rel.length : 0)),
    coach: Math.round(md?.coach ?? 60), staff: Math.round(people.length ? people.reduce((t, e) => t + e.satisfaction, 0) / people.length : 60),
  });
  o.trends = o.trends.slice(-72);
}

// ---- How the club is run, in summary ----

/** Turnover and tenure at the top, and what departures have cost. */
export function stability(state: GameState): { avgTenure: number; departures: number; cost: number; reorgs: number } {
  const x = execs(state);
  const people = Object.values(x.people).filter((e) => e.role && e.hired);
  const avg = people.length ? people.reduce((t, e) => t + daysBetween(e.hired!, state.date) / 365, 0) / people.length : 0;
  const recent = x.departures.filter((d) => d.date >= addDays(state.date, -730));
  return { avgTenure: Math.round(avg * 10) / 10, departures: recent.length, cost: recent.reduce((t, d) => t + d.cost, 0), reorgs: x.reorgs };
}

/** Whether the owner's decisions over the last year match the priorities they set. */
export function consistency(state: GameState): { score: number; notes: string[] } {
  const o = office(state);
  const w = owner(state).weights;
  const notes: string[] = [];
  const since = addDays(state.date, -365);
  const switches = o.trail.filter((t) => t.date >= since && t.area === "decision rights").length;
  let score = 85;
  if (switches >= 4) {
    score -= Math.min(25, (switches - 3) * 5);
    notes.push(`You changed who decides what ${switches} times this year; the staff can't tell how you want to work.`);
  }
  const fired = execs(state).departures.filter((d) => d.date >= since && d.why === "fired").length;
  if (fired >= 2) {
    score -= fired * 6;
    notes.push(`${fired} executives let go in a year.`);
  }
  const b = state.business;
  if (b) {
    const levels = DEPT_CATS.reduce((t, d) => t + b.budget[d], 0) / DEPT_CATS.length;
    if (w.profit >= 4 && levels >= 2) { score -= 10; notes.push("Profit is a top priority, but the departments run on above-average budgets."); }
    if (w.community >= 4 && b.budget.community <= 0) { score -= 10; notes.push("You say the community matters most, but its budget is lean."); }
    const rise = b.priceLog.find((p) => p.date >= since && / up (\d+)%/.test(p.text));
    const pct = rise ? Number(/ up (\d+)%/.exec(rise.text)![1]) : 0;
    if (w.community >= 4 && pct >= 6) { score -= 8; notes.push(`A ${pct}% ticket increase sits awkwardly with putting the community first.`); }
    if (w.titles >= 4 && b.budget.medical === 0) { score -= 8; notes.push("Titles come first, yet the medical budget is lean."); }
  }
  if (!notes.length) notes.push("Your decisions this year line up with the priorities you set.");
  return { score: Math.max(0, Math.min(100, score)), notes };
}

/** The Today page's first lines: what needs the owner now. */
export function briefing(state: GameState): string[] {
  if (!state.office) return [];
  const out: string[] = [];
  const open = openMemos(state).filter((m) => m.status === "open");
  const soon = open.filter((m) => m.deadline <= addDays(state.date, 2));
  if (open.length) out.push(`${open.length} decision memo${open.length > 1 ? "s" : ""} on your desk${soon.length ? `, ${soon.length} due within two days` : ""}.`);
  const due = office(state).tasks.filter((t) => t.status === "open" && t.due <= addDays(state.date, 7));
  if (due.length) out.push(`Due this week: ${due.map((t) => t.title.toLowerCase()).join(", ")}.`);
  const vacant = EXEC_KEYS.filter((r) => !EXEC_ROLES[r].optional && !execRole(state, r));
  if (vacant.length) out.push(`Open jobs: ${vacant.map((r) => EXEC_ROLES[r].label.toLowerCase()).join(", ")} (deputies acting).`);
  const inc = office(state).incidents[0];
  if (inc && inc.date >= addDays(state.date, -7)) out.push(`This week: ${inc.text}`);
  return out;
}

// ---- The day ----

export function officeDaily(state: GameState): void {
  if (!state.office || !state.execs) return;
  const o = office(state);
  const year = leagueYear(state.date);
  if (o.year === undefined) o.year = year;
  if (year > o.year) {
    yearEnd(state, o.year);
    o.year = year;
  }
  // Memos back from research, and memos whose time ran out.
  for (const m of openMemos(state)) {
    if (m.status === "researching" && m.until && m.until <= state.date) research(state, m);
    if (stale(state, m)) {
      m.status = "lapsed";
      m.notes.push("No longer available.");
      continue;
    }
    if (m.status === "open" && m.deadline < state.date) lapse(state, m);
  }
  delegatedTrades(state);
  delegatedCoaching(state);
  delegatedEvents(state);
  delegatedSponsors(state);
  delegatedPricing(state);
  delegatedFinancing(state);
  for (const t of o.tasks) if (t.status === "open" && t.due <= state.date) finishTask(state, t);
  weeklyDigest(state);
  // A president of football operations keeps the head coach and the owner on the same page.
  if (weekday(state.date) === "Tuesday" && state.media && execRole(state, "FOPS")) state.media.coach = clamp(state.media.coach + 0.3 + 0.4 * execBoost(state, "FOPS"));
  if (state.date === addDays(RULES.keyDates.regularSeasonEnd, 2)) coachReview(state);
  if (state.date.endsWith("-01")) {
    officeMood(state);
    workplaceMonthly(state);
    incidents(state);
    snapshot(state);
    overruns(state);
    holdMeeting(state);
    // Good stadium operations shows in how fans feel about game days.
    if (state.date >= RULES.keyDates.regularSeasonStart && state.date <= addDays(RULES.keyDates.regularSeasonEnd, 1)) state.pressure.fans = clamp(state.pressure.fans + 0.4 * execBoost(state, "SOD"));
    // Executives get calls from other clubs once a year, in the spring.
    if (state.date.slice(5, 7) === "04") poaching(state);
  }
}

function stale(state: GameState, m: Memo): boolean {
  const p = m.payload ?? {};
  if (m.kind === "signing" || m.kind === "street") {
    const fa = market(state)[p.player as string];
    // In the negotiating window a market player is still under his old contract, so only the market's status counts.
    return !fa || fa.status !== "open" || (m.kind === "street" && state.players[p.player as string]?.status !== "fa");
  }
  if (m.kind === "trade") return trades(state).offers.find((x) => x.id === p.offer)?.status !== "open";
  if (m.kind === "refinance") return !debt(state).offers.some((x) => x.id === p.offer);
  if (m.kind === "pricing") return !!business(state).next || !!business(state).renewal;
  if (m.kind === "retain") return !execRole(state, p.role as ExecRole);
  return false;
}

/** A memo the owner never answered: the staff falls back on its default, and the author notices. */
function lapse(state: GameState, m: Memo): void {
  m.status = "lapsed";
  m.notes.push(`Past the deadline: ${m.ifLate}`);
  if (m.kind === "pricing") carryOut(state, m, m.recommend);
  if (m.kind === "retain") carryOut(state, m, 1);
  if (m.kind === "complaint") carryOut(state, m, 2);
  if (m.kind === "incident") carryOut(state, m, m.recommend);
  if (m.kind === "trade") declineOffer(state, m.payload?.offer as string);
  noteDecision(state, m.area ? AREAS[m.area].label.toLowerCase() : m.kind, `${m.title}: no answer by the deadline`, m.amount, m.from, "policy", m.ifLate);
  const role = roleOf(state, m);
  const e = role ? execRole(state, role) : undefined;
  if (e) e.satisfaction = clamp(e.satisfaction - 3);
  else if (state.media && (m.area === "signings" || m.area === "trades" || m.kind === "coachReview")) state.media.coach = clamp(state.media.coach - 1);
  if (m.area === "signings" || m.area === "trades") gmTrust(state, -2);
}

// The club's compliance office and the league's oversight of every club:
// transaction filings, policy certifications, the yearly cap audit, funding
// guaranteed pay with the league, trade physicals, and league investigations
// with findings, a chance to respond, sanctions and appeals. Other clubs'
// cases are made up and run on their own; the league disciplines one to three
// clubs in a typical year.
import { post } from "./business";
import { addDeadMoney, teamPlayerIds } from "./cap";
import { dealOf, leagueYear } from "./contracts";
import { startCrisis } from "./crisis";
import { addDays, daysBetween } from "./dates";
import { DRAFT_YEAR } from "./draft";
import { money, news, send } from "./inbox";
import { BASE_SEASON, PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { capScale } from "./market";
import { FIRST_NAMES, LAST_NAMES } from "./names";
import { rngFor } from "./rng";
import { pickId, pickOwner, pickUsed } from "./trades";
import type { ComplianceState, GameState, LeagueCase, TradeDeal } from "./types";

export const STAFF_LEVELS: { label: string; what: string; cost: number }[] = [
  { label: "The GM's assistant", what: "Paperwork is filed between other jobs; nobody owns the rules.", cost: 0 },
  { label: "A compliance officer", what: "One person reads every filing and keeps the calendar of league deadlines.", cost: 350_000 },
  { label: "A compliance department", what: "An officer and staff: filings, certifications and training run on their own.", cost: 1_100_000 },
  { label: "A department with outside counsel", what: "Everything above, with a league-rules law firm on call for audits and investigations.", cost: 2_300_000 },
];

export const CASE_KINDS: Record<string, { label: string; what: string }> = {
  tampering: { label: "Tampering", what: "Contact with another club's player, coach or executive before the rules allow it." },
  injuryReport: { label: "Injury reports", what: "Practice and game status reports that didn't match what the club knew." },
  equipment: { label: "Equipment and game operations", what: "Headsets, footballs, the sideline or the game-day staff outside the rules." },
  scouting: { label: "Scouting methods", what: "Recording or gathering information on opponents in ways the league prohibits." },
  cap: { label: "Cap circumvention", what: "Pay or promises kept off the books to get around the salary cap." },
  workplace: { label: "Workplace conduct", what: "Complaints about how the club treats employees, under the league's personal conduct policy." },
  reporting: { label: "Reporting", what: "Filings, ownership reports or disclosures that were late, wrong or missing." },
};

const STAGE_DAYS: Record<string, [number, number]> = { inquiry: [14, 28], interviews: [21, 45], findings: [10, 10], sanctioned: [7, 7], appeal: [21, 35] };

export function compliance(state: GameState): ComplianceState {
  const c = (state.compliance ??= { leagueCases: [] } as unknown as ComplianceState);
  c.leagueCases ??= [];
  c.staff ??= 1;
  c.filings ??= [];
  c.certified ??= [];
  c.funding ??= "letter";
  c.escrow ??= 0;
  c.audits ??= [];
  c.forfeited ??= [];
  c.strikes ??= 0;
  c.physicals ??= [];
  c.log ??= [];
  if (!c.officer) {
    const rng = rngFor(state.seed, "complianceOfficer");
    c.officer = `${FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}`;
  }
  return c;
}

function note(state: GameState, text: string): void {
  const c = compliance(state);
  c.log.unshift({ date: state.date, text });
  c.log.length = Math.min(c.log.length, 60);
}

function from(state: GameState): string {
  const c = compliance(state);
  return c.staff ? `${c.officer}, Compliance` : "Football Operations";
}

export function setComplianceStaff(state: GameState, level: number): string | null {
  const c = compliance(state);
  if (level < 0 || level >= STAFF_LEVELS.length) return "No such staffing level.";
  if (level === c.staff) return null;
  c.staff = level;
  note(state, `Compliance staffing set to ${STAFF_LEVELS[level].label.toLowerCase()} (${money(STAFF_LEVELS[level].cost)} a year).`);
  return null;
}

/** Training for coaches, scouts and staff: a year of fewer avoidable violations. */
export function holdTraining(state: GameState): string | null {
  const c = compliance(state);
  if (c.trained && daysBetween(c.trained, state.date) < 180) return "The staff was trained less than six months ago.";
  const cost = 120_000 + 60_000 * c.staff;
  post(state, "professional", -cost, "League-rules training for coaches and staff");
  c.trained = state.date;
  note(state, `Coaches, scouts and staff went through league-rules training (${money(cost)}). The sign-in sheets are on file.`);
  return null;
}

export function trainedNow(state: GameState): boolean {
  const t = compliance(state).trained;
  return !!t && daysBetween(t, state.date) < 365;
}

/** How likely the club is to break a rule it could have avoided, against a typical club (1). */
export function violationRisk(state: GameState): number {
  const c = compliance(state);
  const review = state.legal?.review ? 0.9 : 1;
  return (1.15 - 0.15 * c.staff) * (trainedNow(state) ? 0.7 : 1) * review * (1 + 0.25 * c.strikes);
}

// ---- Guaranteed pay funding ----

/** Guaranteed salary and bonus the club still owes in later league years. */
export function futureGuarantees(state: GameState, team = state.userTeam): number {
  const year = leagueYear(state.date);
  let total = 0;
  for (const id of teamPlayerIds(state, team)) {
    const d = dealOf(state, id);
    if (!d) continue;
    for (const y of d.years) if (y.year > year && !y.void) total += y.guaranteed;
  }
  return total;
}

/**
 * The league's funding rule: a club funds the guaranteed pay it owes in later
 * years, in cash deposited with the league or with a letter of credit that
 * costs a fee. Clubs with a low debt load fund half.
 */
export function fundingRequired(state: GameState): number {
  const debt = state.debt ? (state.debt.loans ?? []).reduce((t, l) => t + (l.balance ?? 0), 0) : 0;
  const share = debt < 200_000_000 * capScale(state, leagueYear(state.date)) ? 0.5 : 1;
  return Math.round((futureGuarantees(state) * share) / 100_000) * 100_000;
}

export const LETTER_FEE = 0.0075;

export function setFunding(state: GameState, how: "cash" | "letter"): string | null {
  const c = compliance(state);
  if (c.funding === how) return null;
  c.funding = how;
  note(state, how === "cash" ? "Guarantees will be funded in cash with the league from the 1st." : "Guarantees will be funded with a letter of credit from the 1st; the cash in escrow comes back.");
  return null;
}

function fundMonthly(state: GameState): void {
  const c = compliance(state);
  const need = fundingRequired(state);
  if (c.funding === "cash") {
    const move = need - c.escrow;
    if (Math.abs(move) >= 100_000) {
      post(state, "escrow", -move, move > 0 ? "Guaranteed pay deposited with the league" : "Escrow released as guarantees were paid");
      c.escrow = need;
    }
  } else {
    if (c.escrow) {
      post(state, "escrow", c.escrow, "Escrow returned: guarantees now backed by a letter of credit");
      c.escrow = 0;
    }
    if (need) post(state, "loanFees", -Math.round((need * LETTER_FEE) / 12), "Letter of credit for guaranteed pay");
  }
}

// ---- Filings and certifications ----

const LATE_ODDS = [0.05, 0.025, 0.012, 0.006];

function file(state: GameState, kind: string, due: string): void {
  const c = compliance(state);
  const rng = rngFor(state.seed, `filing:${kind}:${state.date}`);
  const late = rng() < LATE_ODDS[c.staff] * (trainedNow(state) ? 0.7 : 1);
  const f = { id: `${state.date}:${kind}`, kind, due, filed: late ? addDays(due, 1) : due, late, fine: late ? Math.round((25_000 + rng() * 75_000) / 5_000) * 5_000 : undefined };
  c.filings.unshift(f);
  c.filings.length = Math.min(c.filings.length, 80);
  if (late) {
    post(state, "fines", -f.fine!, `League fine: late filing (${kind})`);
    note(state, `The ${kind} filing went in a day late; the league fined the club ${money(f.fine!)}.`);
  }
}

function rosterFilings(state: GameState): void {
  const c = compliance(state);
  const now = teamPlayerIds(state, state.userTeam).slice().sort();
  const before = c.roster;
  c.roster = now;
  if (!before) return;
  const added = now.filter((id) => !before.includes(id)).length;
  const gone = before.filter((id) => !now.includes(id)).length;
  if (added + gone) file(state, `roster transactions (${added + gone})`, state.date);
}

/** The owner signs the year's policy acknowledgments and conflict disclosures. */
export function certify(state: GameState): string | null {
  const c = compliance(state);
  if (c.certified.includes(RULES.season)) return "This season's disclosures are already certified.";
  c.certified.push(RULES.season);
  note(state, `The ${RULES.season} policy acknowledgments, conflict disclosures and ownership certification were signed and filed.`);
  return null;
}

function certifications(state: GameState): void {
  const c = compliance(state);
  const y = RULES.season;
  // The game starts after the 2026 certifications were filed.
  if (y === BASE_SEASON || c.certified.includes(y)) return;
  if (state.date === `${y}-08-01`) {
    if (c.staff >= 2) certify(state);
    else send(state, "league", from(state), "League certifications due September 1",
      "Every owner signs the league's policy acknowledgments (gambling, conduct, integrity of the game) and discloses business ties to other clubs, players' agents and league vendors. Sign them on the Legal page before September 1.");
  }
  if (state.date === `${y}-09-01`) {
    post(state, "fines", -100_000, "League fine: certifications not filed");
    note(state, "The certifications weren't filed by September 1; the league fined the club $100K and filed them for us late.");
    c.certified.push(y);
  }
}

// ---- The cap audit ----

const AUDIT_FINDINGS = [
  "a workout bonus that was earned last season was still counted as unlikely",
  "a marketing appearance fee paid to a player was really compensation and belonged on the cap",
  "a roster bonus was dated after the day it was earned",
  "an incentive tied to team results was classified as a player incentive",
  "travel paid for a player's family wasn't reported as a benefit",
];

function capAudit(state: GameState): void {
  const c = compliance(state);
  const year = leagueYear(state.date) - 1;
  const rng = rngFor(state.seed, `capAudit:${year}`);
  const odds = 0.3 * (1.2 - 0.2 * c.staff) * (state.legal?.review ? 0.7 : 1) * (1 + 0.25 * c.strikes);
  const findings: string[] = [];
  if (rng() < odds) findings.push(AUDIT_FINDINGS[Math.floor(rng() * AUDIT_FINDINGS.length)]);
  if (rng() < odds * 0.3) findings.push(AUDIT_FINDINGS[Math.floor(rng() * AUDIT_FINDINGS.length)]);
  const capCharge = findings.length ? Math.round((300_000 + rng() * 900_000) * capScale(state, year) / 50_000) * 50_000 * findings.length : 0;
  const fine = findings.length ? 100_000 * findings.length : 0;
  c.audits.unshift({ year, date: state.date, findings, fine, capCharge });
  if (!findings.length) {
    send(state, "league", from(state), `League cap audit of ${year}: clean`, `The league's auditors went through every contract, bonus and payment from the ${year} league year and found nothing to correct.`);
    return;
  }
  addDeadMoney(state, state.userTeam, year + 2, capCharge);
  post(state, "fines", -fine, `League fine: ${year} cap audit`);
  note(state, `The ${year} cap audit found ${findings.length} problem${findings.length > 1 ? "s" : ""}: a ${money(capCharge)} charge on the ${year + 2} cap and a ${money(fine)} fine.`);
  send(state, "league", "League Office", `League cap audit of ${year}: corrections`,
    `The auditors found that ${findings.join(", and that ")}. The league charges ${money(capCharge)} against the ${year + 2} cap and fines the club ${money(fine)}. ` +
    "The findings went to the owner, the club president and the club's league representative." +
    (rng() < 0.08 * (1 + c.strikes) ? " The league has opened an investigation into whether this was deliberate." : ""));
  if (rng() < 0.08 * (1 + c.strikes)) openCase(state, state.userTeam, "cap", 2);
}

// ---- Investigations ----

export function ourCases(state: GameState): LeagueCase[] {
  return compliance(state).leagueCases.filter((x) => x.team === state.userTeam);
}

export function openCase(state: GameState, team: string, kind: string, severity?: number, why?: string): LeagueCase {
  const c = compliance(state);
  const rng = rngFor(state.seed, `case:${team}:${kind}:${state.date}`);
  const sev = severity ?? (rng() < 0.55 ? 1 : rng() < 0.75 ? 2 : 3);
  const k: LeagueCase = {
    id: `${state.date}:${team}:${kind}`, team, year: RULES.season, kind, opened: state.date, stage: "inquiry",
    evidence: Math.round((0.35 + rng() * 0.55) * 100) / 100, severity: sev,
    next: addDays(state.date, STAGE_DAYS.inquiry[0] + Math.floor(rng() * (STAGE_DAYS.inquiry[1] - STAGE_DAYS.inquiry[0]))),
    text: why ?? CASE_KINDS[kind].what,
  };
  if (team !== state.userTeam) k.response = rng() < 0.7 ? "cooperate" : rng() < 0.6 ? "limited" : "contest";
  c.leagueCases.unshift(k);
  c.leagueCases.length = Math.min(c.leagueCases.length, 120);
  if (team === state.userTeam) {
    send(state, "league", "League Office", `League inquiry: ${CASE_KINDS[kind].label.toLowerCase()}`,
      `The league office has opened an inquiry: ${k.text} It asks for documents and will interview staff. ` +
      "Choose on the Legal page whether we cooperate fully, give only what's required, or contest it. Club records are under a litigation hold.");
    note(state, `League inquiry opened: ${CASE_KINDS[kind].label.toLowerCase()}.`);
  } else if (sev >= 2) {
    news(state, `The league is investigating the ${teamLabel(team)} over ${CASE_KINDS[kind].label.toLowerCase()}`);
  }
  return k;
}

export function respondCase(state: GameState, id: string, response: LeagueCase["response"]): string | null {
  const k = compliance(state).leagueCases.find((x) => x.id === id);
  if (!k || k.team !== state.userTeam) return "No such case.";
  if (k.stage !== "inquiry" && k.stage !== "interviews") return "The league has already reached its findings.";
  k.response = response;
  if (response === "contest") post(state, "legal", -150_000 * (compliance(state).staff >= 3 ? 0.6 : 1), "Outside counsel: league investigation");
  note(state, `We told the league we will ${response === "cooperate" ? "cooperate fully" : response === "limited" ? "provide only what the rules require" : "contest the inquiry"}.`);
  return null;
}

/** A pick the league takes: the club's own pick in that round, in the first draft where it still holds it. */
export function forfeitPick(state: GameState, team: string, round: number): string | null {
  const c = compliance(state);
  const start = state.draft?.order ? DRAFT_YEAR + 1 : Math.max(DRAFT_YEAR, RULES.season + 1);
  for (let y = start; y <= start + 2; y++) {
    const id = pickId(y, round, team);
    if (pickOwner(state, id) === team && !pickUsed(state, id) && !c.forfeited.includes(id)) {
      c.forfeited.push(id);
      return id;
    }
  }
  return null;
}

export function isForfeited(state: GameState, id: string): boolean {
  return !!state.compliance?.forfeited?.includes(id);
}

function sanction(state: GameState, k: LeagueCase, rng: () => number): void {
  const c = compliance(state);
  const repeat = k.team === state.userTeam ? c.strikes : compliance(state).leagueCases.filter((x) => x.team === k.team && x.sanction && x.id !== k.id).length;
  const mult = (k.response === "cooperate" ? 0.75 : k.response === "limited" ? 1.25 : 1) * (1 + 0.5 * repeat);
  const sev = k.severity ?? 1;
  k.fine = Math.round(([250_000, 1_000_000, 4_000_000][sev - 1] * mult * (0.8 + rng() * 0.4)) / 50_000) * 50_000;
  const round = sev >= 3 ? (k.kind === "cap" || k.kind === "scouting" ? 1 : 2) : sev === 2 ? 5 : 0;
  const pick = round ? forfeitPick(state, k.team, round) : null;
  k.picks = pick ? [pick] : [];
  k.sanction = `${money(k.fine)} fine${pick ? ` and the forfeit of a ${pick.split("-")[0]} round-${round} pick` : ""}`;
  k.stage = "sanctioned";
  k.next = addDays(state.date, STAGE_DAYS.sanctioned[0]);
  if (k.team === state.userTeam) {
    c.strikes += 1;
    post(state, "fines", -k.fine, `League fine: ${CASE_KINDS[k.kind].label.toLowerCase()}`);
    send(state, "league", "League Office", `League discipline: ${CASE_KINDS[k.kind].label.toLowerCase()}`,
      `The league found a violation (${CASE_KINDS[k.kind].label.toLowerCase()}) and imposes a ${k.sanction}. ` +
      `${repeat ? "Earlier violations made it heavier. " : ""}The club may appeal to the commissioner within seven days. ` +
      "The findings went to the owner, the club president, the general counsel and the club's league representative.");
    note(state, `Sanctioned: ${k.sanction}.`);
    if (sev >= 3) startCrisis(state, "league", { title: "League discipline", text: `the league disciplined the club for ${CASE_KINDS[k.kind].label.toLowerCase()} (${k.sanction})`, fault: 0.8, severity: 2 });
  }
  news(state, `The league disciplines the ${teamLabel(k.team)} for ${CASE_KINDS[k.kind].label.toLowerCase()}: ${k.sanction}`);
}

/** Appeal a sanction to the commissioner (club discipline is heard by the league office). */
export function appealCase(state: GameState, id: string): string | null {
  const c = compliance(state);
  const k = c.leagueCases.find((x) => x.id === id);
  if (!k || k.team !== state.userTeam) return "No such case.";
  if (k.stage !== "sanctioned" || k.appealed) return "There is nothing to appeal.";
  k.appealed = true;
  k.stage = "appeal";
  const rng = rngFor(state.seed, `appeal:${k.id}`);
  k.next = addDays(state.date, STAGE_DAYS.appeal[0] + Math.floor(rng() * (STAGE_DAYS.appeal[1] - STAGE_DAYS.appeal[0])));
  post(state, "legal", -250_000 * (c.staff >= 3 ? 0.7 : 1), "Outside counsel: appeal to the commissioner");
  note(state, "We appealed the league's discipline to the commissioner.");
  return null;
}

function advanceCase(state: GameState, k: LeagueCase): void {
  const rng = rngFor(state.seed, `caseStep:${k.id}:${k.stage}`);
  const ours = k.team === state.userTeam;
  const span = (stage: string) => STAGE_DAYS[stage][0] + Math.floor(rng() * (STAGE_DAYS[stage][1] - STAGE_DAYS[stage][0]));
  if (k.stage === "inquiry") {
    k.stage = "interviews";
    k.next = addDays(state.date, span("interviews"));
    if (ours) note(state, `League investigators are interviewing staff about the ${CASE_KINDS[k.kind].label.toLowerCase()} inquiry.`);
  } else if (k.stage === "interviews") {
    k.stage = "findings";
    k.next = addDays(state.date, span("findings"));
    if (ours) send(state, "league", "League Office", "League findings: response invited",
      `The league has finished its interviews in the ${CASE_KINDS[k.kind].label.toLowerCase()} inquiry and will issue findings in ten days. The club may submit a written response before then.`);
  } else if (k.stage === "findings") {
    const records = ours && state.legal?.retention === "minimal" ? 0.08 : 0;
    const resp = ours ? (k.response ?? "cooperate") : k.response;
    k.response = resp;
    const evidence = (k.evidence ?? 0.5) + records - (resp === "contest" ? 0.12 : 0) + (resp === "limited" ? 0.04 : 0);
    if (rng() < evidence) sanction(state, k, rng);
    else {
      k.stage = "closed";
      k.outcome = "No violation found";
      if (ours) {
        send(state, "league", "League Office", "League inquiry closed", `The league closed its ${CASE_KINDS[k.kind].label.toLowerCase()} inquiry without finding a violation.`);
        note(state, `Inquiry closed: no violation found (${CASE_KINDS[k.kind].label.toLowerCase()}).`);
      }
    }
  } else if (k.stage === "sanctioned") {
    // Other clubs appeal now and then; ours only if the owner chose to.
    if (!ours && !k.appealed && rng() < 0.3) { k.appealed = true; k.stage = "appeal"; k.next = addDays(state.date, span("appeal")); return; }
    k.stage = "closed";
    k.outcome = k.sanction;
  } else if (k.stage === "appeal") {
    const odds = 0.3 - (k.response === "contest" ? 0.1 : 0);
    if (rng() < odds) {
      k.fine = Math.round((k.fine ?? 0) / 2 / 50_000) * 50_000;
      const c = compliance(state);
      c.forfeited = c.forfeited.filter((p) => !(k.picks ?? []).includes(p));
      k.outcome = `Reduced on appeal to a ${money(k.fine)} fine`;
      if (ours) post(state, "fines", k.fine, "League fine reduced on appeal");
      news(state, `The commissioner reduces the ${teamLabel(k.team)}' penalty on appeal`);
    } else k.outcome = `Upheld on appeal: ${k.sanction}`;
    k.stage = "closed";
    if (ours) send(state, "league", "League Office", "Appeal decided", `The commissioner decided our appeal: ${k.outcome.toLowerCase()}.`);
  }
}

/** Sanctions the league handed out in a season, every club. */
export function sanctionsIn(state: GameState, season: number): LeagueCase[] {
  return compliance(state).leagueCases.filter((x) => x.year === season && x.sanction);
}

// ---- Trade physicals ----

/**
 * A trade involving our club isn't final until the players pass physicals
 * with the team receiving them. A player who is hurt can fail, and a failed
 * physical voids the trade. Returns why, or null when everyone passed.
 */
export function tradePhysicals(state: GameState, deal: TradeDeal, tradeId: string): string | null {
  if (!deal.teams.includes(state.userTeam)) return null;
  const c = compliance(state);
  for (const side of [0, 1] as const) {
    const to = deal.teams[1 - side];
    for (const a of deal.send[side]) {
      if (a.kind !== "player") continue;
      const p = state.players[a.id];
      const inj = p?.injury;
      const hurt = inj && inj.returnDate > state.date;
      const rng = rngFor(state.seed, `physical:${tradeId}:${a.id}`);
      const odds = !hurt ? 0 : inj!.seasonEnding ? 0.8 : daysBetween(state.date, inj!.returnDate) > 28 ? 0.5 : 0.12;
      const passed = rng() >= odds;
      const name = PLAYER_BY_ID[a.id]?.name ?? a.id;
      const why = passed ? (hurt ? `passed despite a ${inj!.type.toLowerCase()}` : "passed") : `failed: the ${teamLabel(to)} doctors wouldn't clear a ${inj!.type.toLowerCase()}`;
      c.physicals.unshift({ trade: tradeId, player: a.id, team: to, passed, date: state.date, note: why });
      c.physicals.length = Math.min(c.physicals.length, 40);
      if (!passed) return `${name} ${why}`;
    }
  }
  return null;
}

// ---- The day ----

function lastSanction(state: GameState): string | undefined {
  return ourCases(state).find((x) => x.sanction)?.opened;
}

export function complianceDaily(state: GameState): void {
  const c = compliance(state);
  const rng = rngFor(state.seed, `compliance:${state.date}`);
  rosterFilings(state);
  certifications(state);
  if (state.date.endsWith("-01")) {
    const cost = STAFF_LEVELS[c.staff].cost;
    if (cost) post(state, "professional", -Math.round(cost / 12), "Compliance office");
    if (state.business) fundMonthly(state);
    // Our own violations that better staffing and training avoid.
    if (rng() < 0.012 * violationRisk(state)) {
      const kinds = ["injuryReport", "equipment", "scouting", "workplace", "reporting"];
      openCase(state, state.userTeam, kinds[Math.floor(rng() * kinds.length)]);
    }
  }
  const K = RULES.keyDates;
  if (state.date === `${leagueYear(state.date)}-03-01`) file(state, "ownership and debt report", state.date);
  if (state.date === `${leagueYear(state.date)}-06-15` && state.business) capAudit(state);
  // Signing another club's free agent the moment the market opens invites a tampering look.
  if (K && state.date >= K.negotiatingWindowOpens && state.date <= addDays(K.negotiatingWindowOpens, 3)) {
    const expiring = state.league?.expiring ?? {};
    for (const s of state.signings) {
      if (s.date !== state.date || s.team !== state.userTeam || !expiring[s.player] || expiring[s.player] === state.userTeam) continue;
      if (rngFor(state.seed, `tamperLook:${s.id}`)() < 0.05 * violationRisk(state)) openCase(state, state.userTeam, "tampering", undefined, `Contact with ${PLAYER_BY_ID[s.player]?.name ?? "a player"} before the negotiating window opened.`);
    }
  }
  // Other clubs: about three inquiries a year leaguewide.
  if (rng() < 3 / 365) {
    const others = TEAMS.filter((t) => t.id !== state.userTeam);
    const team = others[Math.floor(rng() * others.length)].id;
    const kinds = Object.keys(CASE_KINDS);
    openCase(state, team, kinds[Math.floor(rng() * kinds.length)]);
  }
  for (const k of c.leagueCases) if (k.stage !== "closed" && k.next && state.date >= k.next) advanceCase(state, k);
  // A clean record for two years takes a strike off.
  if (state.date.endsWith("-05-01") && c.strikes) {
    const last = lastSanction(state);
    if (!last || daysBetween(last, state.date) > 730) c.strikes -= 1;
  }
}

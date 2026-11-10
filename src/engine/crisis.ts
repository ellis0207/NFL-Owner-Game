// The crisis playbook. When something goes wrong (a league finding, a
// safety incident at the stadium, a data breach, a staff misconduct
// allegation) the owner runs the response: who is on the crisis team, what
// we say first, whether the facts come from an internal or an independent
// review, who speaks and when, who gets briefed (sponsors, staff, the
// league), and what we fix. The events are made up. Saying more than we
// know, or less than the truth, costs more when the facts come out, and
// trust comes back over years with clean conduct, not with advertising.
import { post } from "./business";
import { culture } from "./culture";
import { addDays, daysBetween } from "./dates";
import { trustHit } from "./fans";
import { money, news, send } from "./inbox";
import { openMatter } from "./legal";
import { rngFor } from "./rng";
import { standingState } from "./standing";
import type { Crisis, CrisisState, GameState } from "./types";

export const CRISIS_ROLES: Record<string, string> = {
  legal: "General counsel: privilege, reporting duties and exposure",
  comms: "Communications: statements, timing and the press",
  hr: "Human resources: employees, complaints and confidentiality",
  security: "Security: safety, evidence and law enforcement",
  exec: "Club president: decisions and the owner's calendar",
};

/** Each step of the playbook, its choices and what each tends to do. */
export const PLAYBOOK: { key: string; label: string; options: Record<string, string> }[] = [
  { key: "response", label: "First response", options: {
    safety: "Safety first: help anyone affected, report what the law requires, say only what we know",
    wait: "Hold statements until the facts are in",
    deny: "Deny it: the story is wrong",
  } },
  { key: "review", label: "Fact-finding", options: {
    internal: "Internal review by our own staff: quick and cheap, less believed",
    independent: "Independent investigation by an outside firm: slower and costly, believed",
  } },
  { key: "spokesperson", label: "Who speaks", options: {
    owner: "The owner", president: "The club president", statement: "A written statement only",
  } },
  { key: "disclosure", label: "What we disclose", options: {
    full: "Release the findings, with names protected", summary: "Release a summary", none: "Keep the findings private",
  } },
  { key: "sponsors", label: "Partners", options: { brief: "Brief sponsors before the press does", wait: "Answer sponsors when they ask" } },
  { key: "staff", label: "Employees", options: { brief: "Tell the staff what we can, and protect complainants", none: "Say nothing inside the building" } },
  { key: "league", label: "League office", options: { inform: "Inform the league and cooperate", none: "Handle it ourselves" } },
];

const KINDS: { kind: string; title: string; text: string; fault: [number, number]; legal?: string }[] = [
  { kind: "safety", title: "Fans hurt at the stadium", text: "a railing gave way in the upper deck after the game and several fans were taken to hospital", fault: [0.3, 0.9], legal: "fan injury claims" },
  { kind: "breach", title: "Fan data exposed", text: "a ticketing vendor's system exposed season-ticket members' names, addresses and payment details", fault: [0.2, 0.7], legal: "data breach class action" },
  { kind: "misconduct", title: "Allegations against a staff member", text: "former employees describe a senior business staff member mistreating people under him for years", fault: [0.3, 1], legal: "employment claims" },
  { kind: "player", title: "A player's arrest", text: "one of our players was arrested overnight after an incident at a nightclub", fault: [0.1, 0.5] },
  { kind: "sponsor", title: "A sponsor scandal", text: "one of our sponsors is accused of fraud, and our logo is on its campaign", fault: [0, 0.3] },
];

export function crises(state: GameState): CrisisState {
  const c = (state.crisis ??= { crises: [], team: ["legal", "comms", "exec"], firm: false, scar: 0, log: [] });
  return c;
}

export function setCrisisTeam(state: GameState, roles: string[], firm: boolean): void {
  const c = crises(state);
  c.team = roles.filter((r) => CRISIS_ROLES[r]);
  c.firm = firm;
}

export function openCrises(state: GameState): Crisis[] {
  return crises(state).crises.filter((x) => x.stage !== "resolved");
}

/** Start a crisis now (league findings, incidents elsewhere in the game, or the random events below). */
export function startCrisis(state: GameState, kind: string, opts: { title?: string; text?: string; fault?: number; severity?: number } = {}): Crisis {
  const c = crises(state);
  const rng = rngFor(state.seed, `crisis:${kind}:${state.date}`);
  const k = KINDS.find((x) => x.kind === kind);
  const x: Crisis = {
    id: `${state.date}:${kind}`, kind, date: state.date,
    title: opts.title ?? k?.title ?? "A crisis", text: opts.text ?? k?.text ?? "",
    fault: opts.fault ?? (k ? k.fault[0] + rng() * (k.fault[1] - k.fault[0]) : 0.5),
    severity: opts.severity ?? 1 + Math.floor(rng() * 3), stage: "open", plan: {},
  };
  c.crises.unshift(x);
  c.crises.length = Math.min(c.crises.length, 20);
  send(state, "league", "Crisis team", `Crisis: ${x.title}`,
    `Early this morning ${x.text}. The crisis team (${c.team.map((r) => CRISIS_ROLES[r].split(":")[0].toLowerCase()).join(", ") || "nobody assigned"}) is assembled. ` +
    "Work through the playbook on the Legal page: the first response is due today, and every step we skip is decided by default.");
  news(state, `${x.title}: ${x.text}`);
  return x;
}

/** The owner's choice for one step of the playbook. */
export function decideCrisis(state: GameState, id: string, step: string, choice: string): string | null {
  const x = crises(state).crises.find((c) => c.id === id);
  const s = PLAYBOOK.find((p) => p.key === step);
  if (!x || !s || !s.options[choice]) return "No such choice.";
  if (x.stage === "resolved") return "This crisis is over.";
  if (x.plan[step]) return "Already decided.";
  x.plan[step] = choice;
  if (step === "review") {
    const independent = choice === "independent";
    x.stage = "review";
    x.reviewDue = addDays(state.date, independent ? 45 : 14);
    post(state, "professional", -(independent ? 750_000 : 100_000) * (1 + 0.5 * (x.severity - 1)), independent ? "Independent investigation" : "Internal review");
  }
  if (step === "response" && choice === "safety" && x.kind === "safety") post(state, "venue", -250_000, "Help for injured fans and their families");
  return null;
}

/** Money for policy changes, training, restitution or repairs after the findings. */
export function fundRemediation(state: GameState, id: string, amount: number): string | null {
  const x = crises(state).crises.find((c) => c.id === id);
  if (!x || !x.findings) return "Wait for the findings.";
  if (x.remediation) return "Already funded.";
  x.remediation = amount;
  post(state, "professional", -amount, `Remediation: ${x.title.toLowerCase()}`);
  crises(state).log.unshift({ date: state.date, text: `Funded ${money(amount)} of fixes after ${x.title.toLowerCase()}.` });
  return null;
}

function bump(n: number, d: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n + d));
}

/** The facts come back and the public, partners, staff and league judge what we said against what happened. */
function finish(state: GameState, x: Crisis): void {
  const c = crises(state);
  const rng = rngFor(state.seed, `crisisEnd:${x.id}`);
  const p = { response: "wait", review: "internal", spokesperson: "statement", disclosure: "summary", sponsors: "wait", staff: "none", league: "none", ...x.plan };
  const atFault = x.fault > 0.5;
  const sev = x.severity;
  // Credibility: what we said against what turned out to be true.
  let fans = -2 * sev * x.fault;
  if (p.response === "deny" && atFault) fans -= 6 * sev;
  if (p.response === "deny" && !atFault) fans += 1;
  if (p.response === "safety") fans += 2;
  if (p.review === "independent") fans += 2;
  if (p.disclosure === "full") fans += atFault ? 2 : 1;
  if (p.disclosure === "none" && atFault) fans -= 3;
  if (p.spokesperson === "owner") fans += atFault ? 1.5 : 0.5;
  if (c.firm) fans += 1;
  if (c.team.includes("comms")) fans += 0.5;
  const scar = Math.max(0, atFault ? sev * (p.response === "deny" ? 4 : 2) - (p.review === "independent" ? 1 : 0) : 0);
  trustHit(state, Math.round(fans * 10) / 10, scar, `${x.title}: ${atFault ? "the club was at fault" : "the club was cleared"}`);
  c.scar = bump(c.scar, scar, 0, 40);
  const cul = culture(state);
  cul.rel.sponsors = bump(cul.rel.sponsors, (p.sponsors === "brief" ? 2 : -2 * sev) - (atFault ? 2 : 0));
  cul.rel.community = bump(cul.rel.community, fans / 2);
  cul.fairness = bump(cul.fairness, p.staff === "brief" ? 3 : x.kind === "misconduct" ? -6 : -1);
  if (p.staff === "none" && c.team.includes("hr") === false && rng() < 0.3) cul.leaks.unshift({ date: state.date, text: `Staff talked to reporters about ${x.title.toLowerCase()}.` });
  const st = standingState(state);
  const required = x.kind === "misconduct" || x.kind === "player" || x.kind === "safety";
  st.league = bump(st.league, p.league === "inform" ? 3 : required ? -8 : 0);
  if (p.league !== "inform" && required) post(state, "fines", -250_000 * sev, `League fine: ${x.title.toLowerCase()} not reported`);
  st.incidents.unshift({ date: state.date, text: x.title, good: !atFault });
  st.incidents = st.incidents.slice(0, 30);
  const k = KINDS.find((y) => y.kind === x.kind);
  if (k?.legal && atFault) openMatter(state, k.legal, x.kind === "breach" ? "Season-ticket members" : x.kind === "safety" ? "Injured fans" : "Former employees", (1_000_000 + rng() * 4_000_000) * sev, x.fault);
  x.findings = atFault
    ? `The ${p.review === "independent" ? "independent investigation" : "internal review"} found the club at fault${sev >= 3 ? ", seriously" : ""}.`
    : `The ${p.review === "independent" ? "independent investigation" : "internal review"} found the club acted properly.`;
  x.outcome = p.response === "deny" && atFault ? "Our denial fell apart when the findings came out." : atFault ? "We owned it; recovery depends on what we fix." : "The club was cleared.";
  x.stage = "resolved";
  c.log.unshift({ date: state.date, text: `${x.title}: ${x.findings} ${x.outcome}` });
  c.log.length = Math.min(c.log.length, 40);
  send(state, "league", "Crisis team", `Findings: ${x.title}`, `${x.findings} ${x.outcome}${atFault ? " Funding fixes (policies, training, restitution or repairs) speeds the recovery." : ""}`);
}

export function crisisDaily(state: GameState): void {
  const c = crises(state);
  for (const x of c.crises) {
    if (x.stage === "resolved") continue;
    // Steps left undecided for a week take the default.
    if (x.stage === "open" && daysBetween(x.date, state.date) >= 7 && !x.plan.review) decideCrisis(state, x.id, "review", "internal");
    if (x.stage === "review" && x.reviewDue && state.date >= x.reviewDue) finish(state, x);
  }
  // Lasting damage heals with time and clean conduct; funded fixes speed it up.
  if (state.date.endsWith("-01") && c.scar > 0) {
    const fixed = c.crises.some((x) => x.remediation && daysBetween(x.date, state.date) < 730);
    const clean = !c.crises.some((x) => x.fault > 0.5 && daysBetween(x.date, state.date) < 365);
    c.scar = Math.max(0, Math.round((c.scar - (clean ? 0.4 : 0.1) - (fixed ? 0.3 : 0)) * 10) / 10);
  }
  // Rare events: about one every two seasons.
  const rng = rngFor(state.seed, `crisisRoll:${state.date}`);
  if (state.business && rng() < 1 / 730 && !openCrises(state).length) {
    const k = KINDS[Math.floor(rng() * KINDS.length)];
    startCrisis(state, k.kind);
  }
}

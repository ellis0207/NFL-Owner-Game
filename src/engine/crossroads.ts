// Crossroads: the few decisions a year where the club's systems pull against
// each other and the owner has to pick a side. Each one comes as a memo with
// the people who have a stake in it speaking for themselves: the GM, the head
// coach, the money people, the partners, the fans, sometimes the player. They
// don't agree, and each says what they'll do if overruled. Whoever loses the
// argument remembers it: the GM's trust, an executive's satisfaction, the
// partners' mood, the fans' trust and a star's morale all move with the
// choice, on top of what the choice itself does to the roster or the books.
// A season later the owner gets a letter on how it turned out, and the side
// that was proven right says so.
//
// The occasions:
// - star: a franchise player one or two seasons from free agency (spring).
// - coach: a losing season ends (the day after the regular season).
// - build: one big project the cash can carry, and two departments want it (spring).
// - payout: the books close with cash to spare and partners who want some (May-June).
import { hurt } from "./difficulty";
import { cashBalance, ownerCash } from "./business";
import { reserveTarget } from "./books";
import { staff } from "./coaches";
import { dealOf, lastYear, leagueYear, salaryCap } from "./contracts";
import { gmTrust } from "./culture";
import { addDays, ageOn, shortDate } from "./dates";
import { addMemo } from "./delegation";
import { execRole, signer } from "./executives";
import { fireStaff } from "./carousel";
import { trustHit } from "./fans";
import { money, news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID } from "./league";
import { marketPrice } from "./market";
import { extensionEligibility, openTalks, talksFor } from "./negotiation";
import { extendCoach, remember } from "./people";
import { posOf } from "./clubhouse";
import { projectTerms, PROJECT_BY_ID, projects, startProject } from "./projects";
import { rngFor } from "./rng";
import { history } from "./seasons";
import { teamStaff } from "./staff";
import { standings, winPct } from "./standings";
import { toggleBlock } from "./trades";
import type { CrossKind, CrossOutcome, CrossroadsState, ExecRole, GameState, Memo, Partner, Voice } from "./types";

const M = 1_000_000;
/** On the roster: in camp in the offseason, active in season. */
const ROSTER = new Set(["active", "camp"]);
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));

export function crossroads(state: GameState): CrossroadsState {
  return (state.crossroads ??= { last: {}, outcomes: [] });
}

export type Wants = "cash" | "winning" | "value";

/** What a partner cares about most (made up, fixed by the seed): money back, winning, or what the club is worth. Funds lean to money, celebrities to winning. */
export function partnerWants(state: GameState, p: Partner): Wants {
  const r = rngFor(state.seed, `wants:${p.id}`)();
  return p.kind === "fund" ? (r < 0.6 ? "cash" : "value") : p.kind === "celebrity" ? (r < 0.7 ? "winning" : "cash") : r < 0.4 ? "winning" : r < 0.7 ? "value" : "cash";
}

export const WANTS_WORD = { cash: "money back", winning: "winning", value: "what the club is worth" } as const;

// ---- Voices ----

export function gmVoice(state: GameState): { who: string; name: string } {
  const g = teamStaff(state.userTeam).GM;
  return { who: g ? `${g.name}, general manager` : "The general manager", name: g?.name ?? "" };
}
function hcVoice(state: GameState): { who: string; name: string; id?: string } {
  const h = teamStaff(state.userTeam).HC;
  return { who: h ? `${h.name}, head coach` : "The head coach", name: h?.name ?? "", id: h?.id };
}
export function execVoice(state: GameState, role: ExecRole): { who: string; name: string } {
  return { who: signer(state, role), name: execRole(state, role)?.name ?? "" };
}

/** The partners speak as one voice for the side most of their stake leans to; the loudest one is named. */
export function partnersVoice(state: GameState, sideFor: (w: Wants) => number, says: (lead: Partner) => string, ifOverruled: string): Voice | null {
  const ps = state.investors?.partners ?? [];
  if (!ps.length) return null;
  const weight: Record<number, number> = {};
  for (const p of ps) weight[sideFor(partnerWants(state, p))] = (weight[sideFor(partnerWants(state, p))] ?? 0) + p.pct;
  const side = Number(Object.entries(weight).sort((a, b) => b[1] - a[1])[0][0]);
  const lead = [...ps].filter((p) => sideFor(partnerWants(state, p)) === side).sort((a, b) => b.pct - a.pct)[0];
  return { kind: "partners", who: `The limited partners (${lead.name} speaking)`, role: "Partners", side, says: says(lead), ifOverruled };
}

function fansVoice(side: number, says: string): Voice {
  return { kind: "fans", who: "The fan base", role: "Fans", side, says, ifOverruled: "Season-ticket holders and the radio callers will hold it against you." };
}

// ---- The occasions ----

/** Our best player heading toward free agency: young enough to pay, good enough that the market will. */
export function starCandidate(state: GameState): { id: string; apy: number; share: number } | null {
  const us = state.userTeam;
  const year = leagueYear(state.date);
  const cap = salaryCap(state, year + 1);
  let best: { id: string; apy: number; share: number } | null = null;
  for (const [id, ps] of Object.entries(state.players)) {
    if (ps.team !== us || !ROSTER.has(ps.status) || !PLAYER_BY_ID[id]) continue;
    const deal = dealOf(state, id);
    const end = lastYear(deal);
    if (end == null || end > year + 1) continue;
    const age = ageOn(PLAYER_BY_ID[id]?.birthDate ?? null, state.date) ?? 27;
    if (age > 30 || state.negotiations[id]?.status === "open") continue;
    if (!extensionEligibility(state, id).ok) continue;
    const apy = marketPrice(state, id, year + 1).apy;
    const share = apy / cap;
    // The quarterback is the one that decides a franchise; anyone else has to be worth a lot more.
    const bar = posOf(state, id) === "QB" ? 0.09 : 0.12;
    if (share >= bar && (!best || apy > best.apy)) best = { id, apy, share };
  }
  return best;
}

function starMemo(state: GameState, id: string, apy: number, share: number): void {
  const p = PLAYER_BY_ID[id];
  const name = p.name;
  const last = name.split(" ").slice(-1)[0];
  const pos = posOf(state, id);
  const year = leagueYear(state.date);
  const g = gmVoice(state), h = hcVoice(state), cfo = execVoice(state, "CFO");
  const left = (lastYear(dealOf(state, id)) ?? year) - year;
  const guaranteed = Math.round(apy * 2.4 / M) * M;
  const voices: Voice[] = [
    { kind: "coach", who: h.who, role: "Head coach", ref: h.id, side: 0, says: `"We don't find another ${last}. Every week I game-plan around him. Pay the man and let's go win."`, ifOverruled: "The coach takes it as a vote of no confidence in the season ahead." },
    { kind: "gm", who: g.who, role: "General manager", side: 1, says: `"I'd play out ${left ? "the next two years" : "this year"} and use the tag if we have to. At ${Math.round(share * 100)}% of the cap, every dollar we hand ${last} comes out of the other 52."`, ifOverruled: "The GM thinks you're running the cap from the owner's box." },
    { kind: "exec", who: cfo.who, role: "CFO", side: 1, says: `"The guarantee alone is about ${money(guaranteed)}. That's cash out the door whether he plays or not, and it lands while we're carrying the other commitments."`, ifOverruled: "The CFO stops putting cash warnings in writing." },
    { kind: "player", who: `${name}, ${pos}`, role: "The player", ref: id, side: 0, says: `"I want to be here. But I've watched what the market pays, and I'm not playing for less than I'm worth."`, ifOverruled: "He hears that the club doesn't see him as a cornerstone." },
    fansVoice(0, `The talk shows have one topic: "Pay ${last}." A jersey with his number is the best seller in the store.`),
    { kind: "exec", who: "The pro scouting department", role: "Pro scouting", side: 2, says: `"Three teams have asked about him already. His value will never be higher than it is right now: that's two first-round picks, maybe more, and a younger roster."`, ifOverruled: "The scouts' trade board goes back in the drawer, and they wonder why they built it." },
  ];
  const pv = partnersVoice(state, (w) => (w === "winning" ? 0 : w === "cash" ? 1 : 2),
    (lead) => partnerWants(state, lead) === "winning" ? `"We didn't buy in to watch someone else's quarterback win."` : partnerWants(state, lead) === "cash" ? `"A guarantee that size is a distribution we'll never see."` : `"Sell high. A player at peak value is an asset; in two years he's a contract."`,
    "Partners who lose the argument call each other, then their lawyers.");
  if (pv) voices.push(pv);
  addMemo(state, {
    kind: "general", area: "signings", from: g.who,
    title: `${name}: pay him, wait, or move him`,
    problem: `${name} is ${left ? "two seasons" : "one season"} from free agency and his camp wants a deal that makes him one of the best-paid ${pos === "QB" ? "quarterbacks" : `players at his position`} in the league: about ${money(apy)} a year, ${Math.round(share * 100)}% of the cap. The building is split.`,
    proposal: "Decide the club's line before his camp goes public.",
    amount: apy,
    options: [
      { label: "Pay him", effect: `The GM opens extension talks with orders to get it done at the top of the market (up to ${money(Math.round(apy * 1.05))} a year).` },
      { label: "Play it out", effect: "No talks for now. The tag is there next spring; he plays for his next deal." },
      { label: "Shop him", effect: "He goes on the trade block. Teams will call with picks; the locker room will notice." },
    ],
    risks: ["A long guarantee for a player who gets hurt is dead money for years.", "A star who feels low-balled can hold out, or play his way to another team."],
    budget: `About ${money(apy)} a year against the cap, ${money(guaranteed)} or more guaranteed.`,
    recommend: 1, conditions: "The GM's view; the coach disagrees.",
    deadline: addDays(state.date, 10),
    ifLate: "Silence is an answer: his agent tells the press the club won't commit.",
    voices, stakes: "Whatever you pick, someone in the building loses this argument.",
    payload: { crossroads: "star", player: id, apy },
  });
}

function coachMemo(state: GameState, w: number, l: number, promised = false): boolean {
  const h = hcVoice(state);
  if (!h.id) return false;
  const c = staff(state).people[h.id];
  const g = gmVoice(state), pres = execVoice(state, "PRES");
  const years = Math.max(1, RULES.season - (teamStaff(state.userTeam).HC?.hiredYear ?? RULES.season) + 1);
  const owed = c?.contract && c.contract.through > RULES.season ? c.contract.salary * (c.contract.through - RULES.season) * (c.contract.guaranteed ?? 1) : 0;
  const voices: Voice[] = [
    { kind: "gm", who: g.who, role: "General manager", side: 1, says: `"He's ${years === 1 ? "had one year" : `had ${years} years`} with a roster I built. Give him one more with a clear line: make the playoffs or we part ways. Changing coaches again sets the young players back another year."`, ifOverruled: "If you fire his coach, the GM knows he's next in line." },
    { kind: "exec", who: pres.who, role: "President", side: 0, says: `"Renewals open in six weeks. A ${w}-${l} season with nothing changed is the hardest sell there is.${owed ? ` Yes, we'd owe him ${money(owed)}. Empty seats cost more.` : ""}"`, ifOverruled: "The business side plans for a soft renewal season and says so in the budget." },
    fansVoice(0, `Fans are flying a banner over the practice field. The radio poll says ${55 + Math.round((0.5 - w / Math.max(1, w + l)) * 60)}% want a change.`),
    { kind: "player", who: "The locker room (the team captains)", role: "Players", side: 2, says: `"He hasn't lost the room. We let him down as much as he let us down. Give him a real contract: a lame-duck coach loses a locker room by October."`, ifOverruled: "The players who backed him feel it; a few of them say so on the Huddle." },
  ];
  const pv = partnersVoice(state, (want) => (want === "winning" ? 0 : want === "cash" ? 1 : 1),
    (lead) => partnerWants(state, lead) === "winning" ? `"${w}-${l}. What are we waiting for?"` : `"Paying two head coaches at once is a luxury, and the club's value doesn't move on one season."`,
    "Partners who lose the argument call each other, then their lawyers.");
  if (pv) voices.push(pv);
  addMemo(state, {
    kind: "general", area: "coaching", from: g.who,
    title: `After ${w}-${l}: what happens to ${h.name}?`,
    problem: `The season ended ${w}-${l}.${promised ? " A year ago you said playoffs or changes, in public. We missed." : ""} The coach's future is the question everyone in town is asking, and every hour without an answer is a story.`,
    proposal: "Decide the coach's future before the carousel starts.",
    amount: owed || undefined,
    options: [
      { label: "Fire him", effect: `He's let go today${owed ? ` with ${money(owed)} still owed` : ""} and the search opens.` },
      { label: "One more year, or else", effect: "He stays with a public line: playoffs next season or he's out. Fans hear it; so does he." },
      { label: "Extend him", effect: "Two more years at a raise. A clear statement that the club believes in him; the fan base won't like it." },
    ],
    risks: ["A coach on an ultimatum coaches scared, or gets the room's best year.", "A new coach brings a new scheme: some of the roster won't fit."],
    budget: owed ? `${money(owed)} owed if fired.` : "Nothing owed if fired.",
    recommend: 1, conditions: "The GM's view; the business side and the fans disagree.",
    deadline: addDays(state.date, 4),
    ifLate: "The coach stays by default, and the story becomes that the owner couldn't decide.",
    voices, stakes: "A losing season has to cost somebody something.",
    payload: { crossroads: "coach", coach: h.id, w, l },
  });
  return true;
}

/** Spring: the biggest stadium project and the training-facility build, with cash for only one of them. */
function buildMemo(state: GameState): boolean {
  const run = projects(state);
  if (run.some((p) => !p.opened)) return false;
  const stadium = ["clubs", "concourse", "boards"].map((id) => ({ id, t: projectTerms(state, id) })).find((x) => !x.t.blocked && x.t.ours > 0);
  const team = ["facility", "recovery"].map((id) => ({ id, t: projectTerms(state, id) })).find((x) => !x.t.blocked && x.t.ours > 0);
  if (!stadium || !team) return false;
  const cash = cashBalance(state);
  // Only a real choice when the cash covers one comfortably and not both.
  if (cash < Math.max(stadium.t.ours, team.t.ours) * 0.9 || cash > (stadium.t.ours + team.t.ours) * 1.6) return false;
  const cro = execVoice(state, "CRO"), cfo = execVoice(state, "CFO"), h = hcVoice(state), g = gmVoice(state);
  const sd = PROJECT_BY_ID[stadium.id], td = PROJECT_BY_ID[team.id];
  const voices: Voice[] = [
    { kind: "exec", who: cro.who, role: "Revenue", side: 0, says: `"${sd.title} pays for itself. Premium buyers are on a waiting list and sponsors want the inventory. This is money we leave on the table every season we wait."`, ifOverruled: "The revenue team misses its number next year and points at this memo." },
    { kind: "coach", who: h.who, role: "Head coach", side: 1, says: `"Free agents tour the building. Ours is the worst they'll see. ${td.title.split(":")[0]} is the difference between a player picking us and picking someone else."`, ifOverruled: "The coach tells his agents' friends the owner cares more about suites than players." },
    { kind: "gm", who: g.who, role: "General manager", side: 1, says: `"I'm with the coach. Players talk, and they talk about where they train."`, ifOverruled: "The GM files it under things the owner doesn't understand about players." },
    { kind: "exec", who: cfo.who, role: "CFO", side: 2, says: `"We have ${money(cash)} in the bank. Either project takes most of it. I'd keep the cushion: a bad season, a downturn, or a capital call and we're borrowing at the worst moment."`, ifOverruled: "The CFO adds a line to the risk report with your name on it." },
  ];
  const pv = partnersVoice(state, (want) => (want === "cash" ? 2 : want === "value" ? 0 : 1),
    (lead) => partnerWants(state, lead) === "cash" ? `"Keep it, or better, distribute it."` : partnerWants(state, lead) === "value" ? `"Premium seating is what buyers pay for when they value a club."` : `"Build what wins."`,
    "Partners who lose the argument call each other, then their lawyers.");
  if (pv) voices.push(pv);
  addMemo(state, {
    kind: "general", from: execVoice(state, "PRES").who,
    title: "One project this spring: the stadium or the training facility",
    problem: `There's money for one big build this offseason, not both. ${sd.title} costs us ${money(stadium.t.ours)}; ${td.title.toLowerCase()} costs ${money(team.t.ours)}. We have ${money(cash)}.`,
    proposal: "Pick the build, or keep the cash.",
    amount: Math.max(stadium.t.ours, team.t.ours),
    options: [
      { label: "Build the stadium project", effect: `${sd.title}: ${sd.what}` },
      { label: "Build the training facility", effect: `${td.title}: ${td.what}` },
      { label: "Keep the cash", effect: "Neither. The cash stays in the bank for whatever comes next." },
    ],
    risks: ["Construction runs over.", "A cash-thin club borrows on the lender's terms, not its own."],
    budget: `${money(stadium.t.ours)} or ${money(team.t.ours)}, 20% down and the rest monthly.`,
    recommend: 0, conditions: "The business side's view; football and finance disagree.",
    deadline: addDays(state.date, 14),
    ifLate: "Nothing gets built this year, and both departments feel ignored.",
    voices, stakes: "Revenue, football and the balance sheet all want the same dollars.",
    payload: { crossroads: "build", stadium: stadium.id, team: team.id },
  });
  return true;
}

function payoutMemo(state: GameState): boolean {
  const ps = state.investors?.partners ?? [];
  // Someone has to be asking: a partner who wants money back.
  if (!ps.some((p) => partnerWants(state, p) === "cash")) return false;
  const cash = cashBalance(state);
  // What's above the reserve policy, with a season's cushion on top, is what the partners can ask for.
  const reserve = reserveTarget(state) + 40 * M * (salaryCap(state, leagueYear(state.date)) / salaryCap(undefined, 2026));
  if (cash < reserve * 1.3) return false;
  const amount = Math.round((cash - reserve) * 0.5 / M) * M;
  if (amount < 10 * M) return false;
  const cfo = execVoice(state, "CFO"), g = gmVoice(state), cro = execVoice(state, "CRO");
  const voices: Voice[] = [
    { kind: "exec", who: cfo.who, role: "CFO", side: 1, says: `"Half of that, at most. We'd go into the season with ${money(cash - amount)}. One bad break and we're calling capital back from the same people we paid."`, ifOverruled: "The CFO adds a line to the risk report with your name on it." },
    { kind: "gm", who: g.who, role: "General manager", side: 2, says: `"Every dollar that goes out the door is a dollar I can't put in a signing bonus. Our guarantees have to be funded up front; I need that room."`, ifOverruled: "The GM brings it up every time a free agent picks someone else." },
    { kind: "exec", who: cro.who, role: "Revenue", side: 2, says: `"We have projects with paybacks under five years. A distribution earns nothing."`, ifOverruled: "The revenue team's next pitch starts with this decision." },
  ];
  const pv = partnersVoice(state, (want) => (want === "cash" ? 0 : want === "value" ? 1 : 2),
    (lead) => partnerWants(state, lead) === "cash" ? `"We've funded every call. It's our turn. The whole ${money(amount)}."` : partnerWants(state, lead) === "value" ? `"Something back, and keep building."` : `"Put it on the field."`,
    "Partners who lose the argument call each other, then their lawyers.");
  if (pv) voices.unshift(pv);
  const lead = [...ps].filter((p) => partnerWants(state, p) === "cash").sort((a, b) => b.pct - a.pct)[0];
  addMemo(state, {
    kind: "general", area: "financing", from: cfo.who,
    title: "The partners want a distribution",
    problem: `The books closed with ${money(cash)} in cash. ${lead.name}, who cares most about ${WANTS_WORD[partnerWants(state, lead)]}, is asking for ${money(amount)} to go out to the owners. Football and the business side have plans for the same money.`,
    proposal: "Decide how much goes back to the owners.",
    amount,
    options: [
      { label: `Pay ${money(amount)}`, effect: "Every partner gets their share; the owner's share goes to the owner." },
      { label: `Pay ${money(Math.round(amount / 2 / M) * M)}`, effect: "Half: something back, a cushion kept." },
      { label: "Pay nothing, reinvest", effect: "The cash stays with the club for football and projects." },
    ],
    risks: ["A thin cushion means borrowing when the economy turns.", "Unhappy partners look for the exit, and their stakes go to buyers you didn't choose."],
    budget: `${money(amount)} out of ${money(cash)}.`,
    recommend: 1, conditions: "The CFO's view; the partners and the football side disagree.",
    deadline: addDays(state.date, 14),
    ifLate: "No distribution. The partners hear that as a no.",
    voices, stakes: "The people who own the club and the people who run it want different things from the same cash.",
    payload: { crossroads: "payout", amount },
  });
  return true;
}

// ---- Deciding ----

/** Carry out a crossroads memo, then make every voice live with how it came out. */
export function resolveCrossroadsMemo(state: GameState, m: Memo, choice: number): string | null {
  const p = m.payload ?? {};
  const kind = p.crossroads as CrossKind;
  let result: string | null = null;
  if (kind === "star") {
    const id = p.player as string;
    const apy = Number(p.apy ?? 0);
    if (choice === 0) {
      const t = talksFor(state, state.userTeam, id);
      if (!t.ok) return t.reason ?? "We can't talk contract with him right now.";
      openTalks(state, state.userTeam, id, t.kind, "gm", { goal: "sign", maxApy: Math.round(apy * 1.05) });
    } else if (choice === 2) {
      toggleBlock(state, id);
      news(state, "trades", `${TEAM_BY_ID[state.userTeam].name} are listening to offers for ${PLAYER_BY_ID[id].name}, according to people around the league`);
    }
  } else if (kind === "coach") {
    const id = p.coach as string;
    const c = staff(state).people[id];
    if (!c || c.team !== state.userTeam) return "He's no longer our coach.";
    if (choice === 0) {
      const r = fireStaff(state, id);
      if (!r.ok) return r.text;
      result = r.text;
    } else if (choice === 1) {
      crossroads(state).ultimatum = { coach: id, season: RULES.season + 1 };
      news(state, "coaching", `${TEAM_BY_ID[state.userTeam].name} owner on ${c.name}: playoffs next season, or changes`);
    } else {
      const salary = Math.round((c.contract?.salary ?? 6 * M) * 1.1);
      const r = extendCoach(state, id, 2, salary, 1, 0);
      if (!r.ok) return r.text;
      result = r.text;
    }
  } else if (kind === "build") {
    if (choice < 2) {
      const r = startProject(state, String(choice === 0 ? p.stadium : p.team));
      if (!r.startsWith("Work starts")) return r;
      result = r;
    }
  } else if (kind === "payout") {
    const total = choice === 0 ? Number(p.amount) : choice === 1 ? Math.round(Number(p.amount) / 2 / M) * M : 0;
    if (total > 0) {
      const err = ownerCash(state, -total);
      if (err) return err;
    }
  }
  settleVoices(state, m, choice);
  record(state, m, choice);
  void result;
  return null;
}

/** Every voice in the memo lives with the outcome: backed or overruled, by how much they had on it. */
export function settleVoices(state: GameState, m: Memo, choice: number): void {
  const label = m.options[choice].label.toLowerCase();
  for (const v of m.voices ?? []) {
    const won = v.side === choice;
    const name = v.who.split(",")[0];
    if (v.kind === "gm") {
      gmTrust(state, won ? 2 : -6, won ? undefined : `You went against the GM on ${m.title.toLowerCase()}.`);
      remember(state, name, won ? `Backed on ${m.title.toLowerCase()}` : `Overruled on ${m.title.toLowerCase()}: you chose to ${label}`, won ? 1.5 : -3);
    } else if (v.kind === "coach") {
      remember(state, name, won ? `Backed on ${m.title.toLowerCase()}` : `Overruled on ${m.title.toLowerCase()}`, won ? 1.5 : -3);
      if (state.media) state.media.coach = clamp(state.media.coach + (won ? 1 : -2));
    } else if (v.kind === "exec") {
      remember(state, name, won ? `Backed on ${m.title.toLowerCase()}` : `Overruled on ${m.title.toLowerCase()}`, won ? 1 : -2.5);
      const role = (["CFO", "CRO", "PRES"] as ExecRole[]).find((r) => execRole(state, r)?.name === name);
      const e = role ? execRole(state, role) : undefined;
      if (e) e.satisfaction = clamp(e.satisfaction + hurt(state, won ? 2 : -6));
    } else if (v.kind === "partners") {
      for (const p of state.investors?.partners ?? []) {
        // Each partner judges by what they want, not by the group's voice.
        const agree = partnerSide(m, partnerWants(state, p)) === choice;
        p.mood = clamp(p.mood + hurt(state, agree ? 4 : -9));
        if (!agree) p.complaints += 1;
      }
    } else if (v.kind === "fans") {
      trustHit(state, won ? 1.5 : -3, won ? 0 : 0.5, won ? undefined : `${m.title}: the owner went the other way.`);
    } else if (v.kind === "player" && v.ref && state.players[v.ref]) {
      const ps = state.players[v.ref];
      ps.morale = clamp((ps.morale ?? 70) + hurt(state, won ? 8 : -18));
    } else if (v.kind === "player") {
      // The room as a whole: a little for everyone on the roster.
      for (const ps of Object.values(state.players)) if (ps.team === state.userTeam && ROSTER.has(ps.status)) ps.morale = clamp((ps.morale ?? 70) + hurt(state, won ? 2 : -4));
    }
  }
  const losers = (m.voices ?? []).filter((v) => v.side !== choice).map((v) => v.role.toLowerCase());
  if (losers.length) m.notes.push(`Overruled: ${losers.join(", ")}. They'll remember.`);
}

/** Which option a partner with these wants backs on this memo (the same mapping the voice used). */
function partnerSide(m: Memo, w: Wants): number {
  // A board meeting: the partners who asked back the pledge, the rest would rather hear a plan.
  if (m.payload?.board) return w === m.payload.ask ? 0 : 1;
  const kind = m.payload?.crossroads as CrossKind;
  if (kind === "star") return w === "winning" ? 0 : w === "cash" ? 1 : 2;
  if (kind === "coach") return w === "winning" ? 0 : 1;
  if (kind === "build") return w === "cash" ? 2 : w === "value" ? 0 : 1;
  return w === "cash" ? 0 : w === "value" ? 1 : 2;
}

function record(state: GameState, m: Memo, choice: number): void {
  const x = crossroads(state);
  const kind = m.payload?.crossroads as CrossKind;
  const y = Number(state.date.slice(0, 4));
  const season = Number(state.date.slice(5, 7)) >= 9 ? y + 1 : y;
  const rec = standings(state)[state.userTeam];
  x.outcomes.unshift({
    memo: m.id, kind, title: m.title, date: state.date, choice, label: m.options[choice].label, season,
    sides: (m.voices ?? []).map((v) => ({ who: v.who, role: v.role, kind: v.kind, side: v.side })),
    before: { wp: rec ? winPct(rec.w, rec.l, rec.t) : 0.5, cash: cashBalance(state) },
    ref: (m.payload?.player ?? m.payload?.coach) as string | undefined,
  });
  x.outcomes = x.outcomes.slice(0, 40);
}

/** A memo nobody answered: everyone who argued feels ignored. */
export function lapseCrossroads(state: GameState, m: Memo): void {
  for (const v of m.voices ?? []) {
    if (v.kind === "gm") gmTrust(state, -2, `Your silence on ${m.title.toLowerCase()} was noticed.`);
    else if (v.kind === "fans") trustHit(state, -1.5, 0, `${m.title}: no answer from the owner.`);
    else if (v.kind === "partners") for (const p of state.investors?.partners ?? []) p.mood = clamp(p.mood - 4);
    else remember(state, v.who.split(",")[0], `No answer on ${m.title.toLowerCase()}`, -1);
  }
}

// ---- A season later ----

/** Who the season proved right, in a sentence, and which side that was. */
function verdict(state: GameState, o: CrossOutcome): { text: string; right: number } | null {
  const h = history(state);
  const s = h.seasons.find((x) => x.season === o.season);
  if (!s) return null;
  const r = s.records[state.userTeam] ?? [0, 0, 0];
  const wp = winPct(r[0], r[1], r[2] ?? 0);
  const made = !!s.playoffs[state.userTeam];
  const line = `${o.season}: ${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ""}${made ? ", in the playoffs" : ", no playoffs"}.`;
  if (o.kind === "coach") {
    if (o.choice === 0) return { text: `${line} ${wp > o.before.wp + 0.1 ? "The change worked." : "The new staff didn't turn it around."}`, right: wp > o.before.wp + 0.1 ? 0 : 1 };
    return { text: `${line} ${made ? "Sticking with him paid off." : "He didn't deliver."}`, right: made ? o.choice : 0 };
  }
  if (o.kind === "star") {
    const row = o.ref ? (h.stats[o.ref] ?? []).find((x) => x.season === o.season && x.team === state.userTeam) : undefined;
    const games = row ? Number(row.g ?? row.games ?? 0) : 0;
    const name = o.ref ? PLAYER_BY_ID[o.ref]?.name ?? "He" : "He";
    const stayed = o.ref ? state.players[o.ref]?.team === state.userTeam : false;
    if (o.choice === 2 && !stayed) return { text: `${line} ${name} is gone; the team ${made ? "won anyway" : "felt it"}.`, right: made ? 2 : 0 };
    return { text: `${line} ${name} played ${games} games for us.`, right: games >= 13 && wp >= 0.5 ? 0 : 1 };
  }
  if (o.kind === "build") return { text: `${line} Cash now ${money(cashBalance(state))}, against ${money(o.before.cash)} when you chose.`, right: cashBalance(state) < 50 * M ? 2 : o.choice };
  return { text: `${line} Cash now ${money(cashBalance(state))}, against ${money(o.before.cash)} when you chose.`, right: cashBalance(state) < 40 * M ? 1 : o.choice };
}

function followUps(state: GameState): void {
  for (const o of crossroads(state).outcomes) {
    if (o.verdict) continue;
    const v = verdict(state, o);
    if (!v) continue;
    o.verdict = v.text;
    const right = o.sides.filter((s) => s.side === v.right);
    const proven = right.filter((s) => s.side !== o.choice);
    let body = `A season ago you chose to ${o.label.toLowerCase()} (${shortDate(o.date)}). ${v.text}`;
    if (v.right === o.choice) body += ` Those who backed you look right: ${right.map((s) => s.role.toLowerCase()).join(", ") || "you, mostly"}.`;
    else body += ` The people you overruled were right, and they know it: ${proven.map((s) => s.role.toLowerCase()).join(", ") || "the staff"}.`;
    for (const s of proven) {
      const name = s.who.split(",")[0];
      remember(state, name, `Proved right on ${o.title.toLowerCase()}`, -1);
      if (s.kind === "gm") gmTrust(state, -2, "The GM was right, and you overruled him.");
      if (s.kind === "partners") for (const p of state.investors?.partners ?? []) p.mood = clamp(p.mood - 3);
    }
    send(state, "business", "Front office", `One year on: ${o.title}`, body);
  }
}

const inPlayoffs = (state: GameState) => Object.values(state.playoffTeams ?? {}).some((g) => g.home === state.userTeam || g.away === state.userTeam);

/**
 * The day after the regular season. A coach kept on a playoffs-or-else line
 * either made it (and says thanks) or the promise comes due; otherwise a
 * losing season puts him on the desk.
 */
function blackMonday(state: GameState): boolean {
  const x = crossroads(state);
  const r = standings(state)[state.userTeam];
  if (!r) return false;
  const u = x.ultimatum && x.ultimatum.season === RULES.season ? x.ultimatum : undefined;
  if (u) {
    delete x.ultimatum;
    const c = staff(state).people[u.coach];
    if (!c || c.team !== state.userTeam || c.role !== "HC") return false;
    if (inPlayoffs(state)) {
      send(state, "staff", c.name, "We made it", "You gave me a year and a line to clear. We cleared it. Thank you for the patience.");
      remember(state, c.name, "Kept his job by making the playoffs", 2);
      return false;
    }
    // The owner said it in public; the town remembers the line either way.
    trustHit(state, -1, 0, "The owner's playoffs-or-else line, a year later.");
    return coachMemo(state, r.w, r.l, true);
  }
  return r.w < r.l && coachMemo(state, r.w, r.l);
}

// ---- Each day ----

export function crossroadsDaily(state: GameState): void {
  if (state.tenure && state.tenure.role !== "control") return;
  const x = crossroads(state);
  const md = state.date.slice(5);
  if (md === "05-20") followUps(state);
  // One at a time: a crossroads deserves the owner's attention to itself.
  if ((state.office?.memos ?? []).some((m) => m.status === "open" && m.payload?.crossroads)) return;
  const year = state.date.slice(0, 4);
  const fresh = (k: CrossKind) => !x.last[k] || x.last[k] < addDays(state.date, -300);
  const mark = (k: CrossKind) => { x.last[k] = state.date; };
  // The day after the regular season: a losing year, or a promise come due, puts the coach on the desk.
  if (state.date === addDays(RULES.keyDates.regularSeasonEnd, 1)) {
    if (fresh("coach") && blackMonday(state)) mark("coach");
    return;
  }
  if (md >= "03-01" && md <= "05-10" && fresh("build") && rngFor(state.seed, `cx-build:${state.date}`)() < 0.04) {
    if (buildMemo(state)) mark("build");
    return;
  }
  if (md >= "03-20" && md <= "06-20" && fresh("star") && rngFor(state.seed, `cx-star:${state.date}`)() < 0.05) {
    const s = starCandidate(state);
    if (s) {
      starMemo(state, s.id, s.apy, s.share);
      mark("star");
    }
    return;
  }
  if (md >= "05-05" && md <= "06-30" && fresh("payout") && rngFor(state.seed, `cx-pay:${year}:${state.date}`)() < 0.05) {
    if (payoutMemo(state)) mark("payout");
  }
}

/** Partners in a crossroads lean by what they want; the Ownership page shows it in words. */
export function wantsWord(state: GameState, p: Partner): string {
  return `Cares most about ${WANTS_WORD[partnerWants(state, p)]}`;
}

/** The record of the big calls: what was chosen, who was overruled, and how it turned out. */
export function crossroadsLog(state: GameState): CrossOutcome[] {
  return state.crossroads?.outcomes ?? [];
}


/** Tests: put one kind of crossroads on the desk now, whatever the calendar says. */
export function forceCrossroads(state: GameState, kind: CrossKind): Memo | null {
  const before = new Set((state.office?.memos ?? []).map((m) => m.id));
  if (kind === "star") {
    const s = starCandidate(state);
    if (s) starMemo(state, s.id, s.apy, s.share);
    else {
      const year = leagueYear(state.date);
      const id = Object.keys(state.players).filter((x) => state.players[x].team === state.userTeam && ROSTER.has(state.players[x].status) && PLAYER_BY_ID[x] && extensionEligibility(state, x).ok)
        .sort((a, b) => marketPrice(state, b, year + 1).apy - marketPrice(state, a, year + 1).apy)[0];
      const apy = marketPrice(state, id, year + 1).apy;
      starMemo(state, id, apy, apy / salaryCap(state, year + 1));
    }
  } else if (kind === "coach") coachMemo(state, 5, 12);
  else if (kind === "build") buildMemo(state);
  else payoutMemo(state);
  return (state.office?.memos ?? []).find((m) => !before.has(m.id)) ?? null;
}

/** Tests: judge every decided crossroads whose season is in the books. */
export function judgeCrossroads(state: GameState): void {
  followUps(state);
}

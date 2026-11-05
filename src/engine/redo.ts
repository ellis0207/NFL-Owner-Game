// Players who outplay their contracts ask to redo them before they run out.
// The real pattern: a starter whose market has jumped well past his pay (a
// rookie-deal star after his third season, a veteran whose position's market
// took off) has his agent ask for a new deal in the spring, with years still
// left on the old one. Most of these get done, many before camp. A player who
// is turned down can skip the voluntary spring program, and the hardest cases
// hold in or hold out of camp. Under the CBA a drafted player can't sign a
// new deal until after his third regular season, camp holdouts are fined
// every day, and a team can't waive fines for a player on his rookie deal.
// Since the 2020 CBA's fines, regular-season holdouts have been very rare.
import { agentFor, changeMorale, changeTrust, priorities } from "./agents";
import { capScale, marketPrice, marketView, teamValue } from "./market";
import { dealOf, dealYearsLeft, leagueYear } from "./contracts";
import { addDays, daysBetween, shortDate } from "./dates";
import { money, news, send } from "./inbox";
import { lockedSpace } from "./capplan";
import { PLAYER_BY_ID, RULES, TEAMS, teamLabel } from "./league";
import { openTalks, STARTERS } from "./negotiation";
import { depthChart } from "./roster";
import { rngFor } from "./rng";
import { trades } from "./trades";
import type { GameState, Position, RedoAsk } from "./types";

/** The ask goes in about ten days into the new league year, after free agency's first wave sets the market. */
function askDate(): string {
  return addDays(RULES.keyDates.newLeagueYear, 10);
}

/** Whether a player can ask for a new deal now, and why not. */
export function redoEligible(state: GameState, id: string): boolean {
  const ps = state.players[id];
  if (!ps?.team || ps.status === "fa" || ps.status === "ps") return false;
  const deal = dealOf(state, id);
  if (!deal || deal.kind === "minimum" || deal.kind === "franchise" || deal.kind === "transition") return false;
  const year = leagueYear(state.date);
  // A veteran with one year left is up for an ordinary extension. A rookie-deal star asks with a year left
  // (and the fifth-year option still to come): his market is far past the rookie scale.
  if (dealYearsLeft(deal, year) < (deal.kind === "rookie" ? 1 : 2)) return false;
  // Nobody asks to redo a deal in its first year: he signed it.
  if (daysBetween(deal.signed, state.date) < 365) return false;
  // Drafted players can't sign a new deal until after their third regular season.
  if (deal.kind === "rookie" && PLAYER_BY_ID[id].yearsExp < 3) return false;
  return true;
}

/** An open ask from one of our players or theirs this league year. */
export function openAsk(state: GameState, id: string): RedoAsk | undefined {
  const r = state.players[id]?.redo;
  return r && r.year === leagueYear(state.date) && !r.settled ? r : undefined;
}

function starters(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const t of TEAMS) {
    for (const [pos, list] of Object.entries(depthChart(state, t.id))) list.slice(0, STARTERS[pos as Position] ?? 1).forEach((x) => ids.add(x));
  }
  return ids;
}

function makeAsks(state: GameState): void {
  const year = leagueYear(state.date);
  const playing = starters(state);
  for (const id of Object.keys(state.players)) {
    if (!playing.has(id) || !redoEligible(state, id)) continue;
    const deal = dealOf(state, id)!;
    const price = marketPrice(state, id, year).apy;
    if (price < 10_000_000 * capScale(state, year)) continue;
    const underpaid = price / Math.max(1, deal.apy);
    if (underpaid < 1.4) continue;
    const pr = priorities(id);
    const rng = rngFor(state.seed, `redo:${year}:${id}`);
    const push = 0.45 * pr.money + 0.35 * pr.ego + Math.min(0.35, (underpaid - 1.4) * 0.1) - 0.3 * pr.loyalty;
    if (push < 0.3 || rng() > 0.55) continue;
    // How hard his camp pushes: most are patient, some skip the voluntary spring work, a few threaten camp.
    const stance: RedoAsk["stance"] = push > 0.62 && rng() < 0.6 ? "camp" : push > 0.48 ? "spring" : "patient";
    const team = state.players[id].team!;
    const ask: RedoAsk = { year, asked: state.date, stance, apy: Math.round(price / 100_000) * 100_000 };
    state.players[id].redo = ask;
    const p = PLAYER_BY_ID[id];
    news(state, `${p.name}'s camp wants a new contract from the ${teamLabel(team)} with ${dealYearsLeft(deal, year)} years left on his deal`);
    if (team === state.userTeam) {
      const threat = stance === "camp" ? `If there's no new deal by camp, ${p.name.split(" ").slice(-1)[0]} won't practice.`
        : stance === "spring" ? "Until there's progress, he'll train on his own instead of attending the voluntary spring program."
        : "He'll keep working while we talk, but he expects a real offer.";
      send(state, "staff", agentFor(id).name, `${p.name} wants a new deal`,
        `${p.name} has outplayed the contract he's on, and his market is now about ${money(ask.apy)} a year. We'd like to redo the deal now rather than wait for it to run out. ${threat} ` +
        "You can open talks from his player page, promise talks after the season, or tell us no.");
    } else cpuAnswer(state, team, id, ask);
  }
}

/** A front office settles most asks: a player it values near his price, with room in next year's books, gets talks. */
function cpuAnswer(state: GameState, team: string, id: string, ask: RedoAsk): void {
  const year = leagueYear(state.date);
  const v = teamValue(state, team, id, year);
  const room = Math.min(lockedSpace(state, team, year), lockedSpace(state, team, year + 1));
  const deal = dealOf(state, id)!;
  if (v >= ask.apy * 0.85 && room >= ask.apy - deal.apy) {
    openTalks(state, team, id, "extension", "gm", { goal: "sign" });
    return;
  }
  ask.answer = "refused";
}

/** The owner promises talks once the season is over: he plays without a fuss, but expects the call. */
export function promiseTalks(state: GameState, id: string): string {
  const ask = openAsk(state, id);
  if (!ask) return "There's no open request.";
  ask.answer = "promised";
  ask.stance = "patient";
  changeMorale(state, id, 3);
  return `${agentFor(id).name}: "We'll hold you to that. He'll be at everything this spring and summer."`;
}

/** The owner says no. He'll play out the deal, and his camp pushes as hard as it said it would. */
export function refuseAsk(state: GameState, id: string): string {
  const ask = openAsk(state, id);
  if (!ask) return "There's no open request.";
  ask.answer = "refused";
  changeMorale(state, id, -8);
  changeTrust(state, agentFor(id).id, state.players[id].team!, -4);
  return `${agentFor(id).name}: "Understood. We'll do what we have to do."`;
}

/** How the ask plays out in the spring program: the plan the player follows, if the ask changes it. */
export function redoSpring(state: GameState, id: string): "away" | undefined {
  const ask = openAsk(state, id);
  return ask && ask.stance !== "patient" ? "away" : undefined;
}

/** At camp: a player who threatened camp and has no deal holds in, or (rarely now) holds out. */
export function redoCamp(state: GameState, id: string): "holdout" | "holdin" | undefined {
  const ask = openAsk(state, id);
  if (!ask || ask.stance !== "camp") return undefined;
  const rng = rngFor(state.seed, `redo-camp:${id}:${ask.year}`);
  if (rng() > 0.8) return undefined;
  return rng() < 0.3 ? "holdout" : "holdin";
}

/** In season: the rare holdout that runs past Week 1 ends within a few weeks, as the game checks add up. */
function endLongHoldouts(state: GameState): void {
  if (state.date <= RULES.keyDates.regularSeasonStart || state.date > RULES.keyDates.regularSeasonEnd) return;
  for (const [id, ps] of Object.entries(state.players)) {
    if (ps.holdout?.kind !== "holdout") continue;
    const rng = rngFor(state.seed, `holdout-week:${id}:${state.date}`);
    if (rng() > 0.05) continue;
    delete ps.holdout;
    changeMorale(state, id, -5);
    news(state, `${PLAYER_BY_ID[id].name} ends his holdout and reports to the ${teamLabel(ps.team!)}`);
  }
}

/** A promise not kept, or an ask left hanging, lands at the next year's ask date. */
function settleOldAsks(state: GameState): void {
  const year = leagueYear(state.date);
  for (const [id, ps] of Object.entries(state.players)) {
    const r = ps.redo;
    if (!r || r.year >= year) continue;
    if (!r.settled && r.answer === "promised" && ps.team) {
      changeMorale(state, id, -15);
      changeTrust(state, agentFor(id).id, ps.team, -8);
      if (ps.team === state.userTeam) {
        send(state, "staff", agentFor(id).name, `About that promise`,
          `We were told there'd be talks on ${PLAYER_BY_ID[id].name}'s deal after the season, and the phone never rang. That's noted.`);
      }
    }
    delete ps.redo;
  }
}

export function redoDaily(state: GameState): void {
  endLongHoldouts(state);
  if (state.date !== askDate()) return;
  settleOldAsks(state);
  makeAsks(state);
}

/** A new deal settles the ask (called when any extension is signed). */
export function settleAsk(state: GameState, id: string): void {
  const r = state.players[id]?.redo;
  if (r) r.settled = state.date;
}

/** Owner-facing line for the player page. */
export function askLine(state: GameState, id: string): string | null {
  const ask = openAsk(state, id);
  if (!ask) return null;
  const how = ask.stance === "camp" ? "and threatens to stay off the field at camp" : ask.stance === "spring" ? "and is skipping voluntary spring work" : "but is patient for now";
  const answer = ask.answer === "promised" ? " We promised talks after the season." : ask.answer === "refused" ? " We said no." : "";
  return `Asked on ${shortDate(ask.asked)} to redo his deal at about ${money(ask.apy)} a year, ${how}.${answer}`;
}

/** Players who keep asking with no answer start asking out instead. */
export function redoStandoff(state: GameState, id: string): boolean {
  const ask = openAsk(state, id);
  return !!ask && ask.answer === "refused" && marketView(state, id) >= 84 && !trades(state).requests[id];
}

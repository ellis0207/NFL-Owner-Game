// Planning a later year's cap the way front offices do, and the league's
// compliance deadline. A future year can look over the cap on paper: real
// teams, the Eagles above all, carry big future numbers and fix them with
// restructures and cuts before the next league year. What they can't fix is
// money that is already locked in: bonus proration and guaranteed salary.
// Every team has to be under the cap at 4 PM ET on the first day of the new
// league year, and from then on the league rejects any contract that would
// put it over. No team has ever missed the deadline; the CBA lets the league
// fine a team, void its contracts and take picks if one did.
import { capHit, capLimit, capSummary, deadMoney, releaseCost, teamPlayerIds, yearsExpIn } from "./cap";
import { dealOf, lastYear, leagueYearStart, minimumSalary, salaryCap } from "./contracts";
import { addDays, shortDate } from "./dates";
import { money, send } from "./inbox";
import { RULES } from "./league";
import { comply, gmOf } from "./offseason";
import type { GameState } from "./types";

/**
 * Cap room in a later league year once a front office has done everything it
 * can: each player either cut (if that saves money) or his base salary above
 * the minimum restructured (a quarter of it stays on that year), whichever
 * frees more. What's left is the locked money, plus a roster's worth of
 * minimum salaries. Below zero, no amount of work gets the team under in time.
 */
// Worked out once a day per team and year: it's a planning number, and trade talks ask for it often.
let cacheDate = "";
const cache = new Map<string, number>();

export function lockedSpace(state: GameState, team: string, year: number): number {
  if (state.settings.capRules !== "real") return Infinity;
  if (cacheDate !== state.date) { cache.clear(); cacheDate = state.date; }
  const key = `${state.seed}:${team}:${year}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const v = computeLocked(state, team, year);
  cache.set(key, v);
  return v;
}

function computeLocked(state: GameState, team: string, year: number): number {
  const date = addDays(leagueYearStart(year), 1);
  let locked = 0;
  let kept = 0;
  for (const id of teamPlayerIds(state, team)) {
    if (state.players[id].status === "ps") continue;
    const deal = dealOf(state, id);
    const y = deal?.years.find((x) => x.year === year);
    if (!deal || !y) continue;
    // A deal that ends the year before: all of its void-year money lands on this year at once.
    if (y.void) {
      if (lastYear(deal) === year - 1) locked += deal.years.filter((x) => x.void && x.year >= year).reduce((sum, x) => sum + x.proration, 0);
      continue;
    }
    const hit = capHit(id, year, state);
    const min = minimumSalary(yearsExpIn(id, year), year);
    // Cutting a player near the minimum saves nothing: someone else at the minimum takes his spot.
    const cut = hit > 2 * min ? releaseCost(id, state, { date }).savingsThisYear : 0;
    const convert = 0.75 * Math.max(0, y.base - min);
    const freed = Math.max(0, cut, convert);
    locked += hit - freed;
    if (freed < hit * 0.9) kept++;
  }
  // The rest of a 51-man roster at about the minimum, and a cushion for the draft class and in-season moves.
  const filler = Math.max(0, 51 - kept) * minimumSalary(1, year);
  const cushion = 0.05 * salaryCap(state, year);
  return capLimit(team, year, state) - deadMoney(state, team, year) - locked - filler - cushion;
}

/**
 * The owner's side of the deadline. The GM warns when next year's books are
 * over, and if we are still over on the first day of the league year he makes
 * the moves himself: restructures, then pay cuts, then releases.
 */
export function capDeadlineDaily(state: GameState): void {
  if (state.settings.capRules !== "real") return;
  const K = RULES.keyDates;
  const team = state.userTeam;
  const next = RULES.season + 1;
  const warn = [addDays(K.newLeagueYear, -30), addDays(K.newLeagueYear, -7)];
  if (warn.includes(state.date)) {
    const s = capSummary(state, team, next);
    if (s.space >= 0) return;
    send(state, "staff", gmOf(team), "We're over next year's cap",
      `Counting our top 51, we're ${money(-s.space)} over the ${next} cap. Every team has to be under it by 4 PM ET on ${shortDate(K.newLeagueYear)}, ` +
      `when the league year opens. We can restructure, ask for pay cuts or release players from the Contracts page; whatever is left on the day, I'll take care of.`);
    return;
  }
  if (state.date !== K.newLeagueYear) return;
  const before = capSummary(state, team);
  if (before.space >= 0) return;
  comply(state, team, 46);
  const after = capSummary(state, team);
  send(state, "staff", gmOf(team), "Getting under the cap",
    `We opened the league year ${money(-before.space)} over the cap, so I made the moves to get us compliant before the 4 PM deadline. ` +
    (after.space >= 0 ? `We're ${money(after.space)} under now; the news wire has the details.`
      : `Even after every move I could make we're still ${money(-after.space)} over, and the league won't approve a signing until we're under.`));
}

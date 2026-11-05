// Conditional draft picks. Real trades often send a pick that moves up a round
// if something happens: the player traded plays enough snaps, reaches a stat
// mark, the team makes the playoffs, or the player gets extended. A first can
// also be protected: if it lands in the top N, the team keeps it and sends next
// year's first instead. Each condition settles on a fixed day (after the Super
// Bowl for a season's play, at the new league year for an extension, when the
// draft order is set for protection), and the pick becomes an ordinary pick.
import { madePlayoffs, seasonOf } from "./incentives";
import { dealOf } from "./contracts";
import { addDays } from "./dates";
import { news, send } from "./inbox";
import { PLAYER_BY_ID, RULES, teamLabel } from "./league";
import { chartValue, outlook, parsePick, pickId, pickLabel, pickOverall, pickOwner, pickUsed, pickValue, picksOf, projectedSlot, trades } from "./trades";
import type { ConditionalPick, GameState, PickCondition, Position, TradeAsset, TradeDeal } from "./types";

const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/** The stat a player's position is usually measured by in a condition, with a typical mark. */
export function statMark(pos: Position): { kind: PickCondition["kind"]; threshold: number } | null {
  if (pos === "QB") return { kind: "passYds", threshold: 3500 };
  if (pos === "RB") return { kind: "rushYds", threshold: 900 };
  if (pos === "WR") return { kind: "recYds", threshold: 900 };
  if (pos === "TE") return { kind: "recYds", threshold: 600 };
  if (pos === "EDGE" || pos === "IDL") return { kind: "sacks", threshold: 7 };
  return null;
}

/** The season a condition traded today turns on: this one while it's being played, otherwise the next. */
export function conditionSeason(state: GameState): number {
  return state.date <= RULES.keyDates.regularSeasonEnd ? RULES.season : RULES.season + 1;
}

/** Plain words for a condition, from the receiving side's point of view. */
export function describeCondition(_state: GameState, pick: string, c: PickCondition): string {
  const { round } = parsePick(pick);
  const up = ORD[Math.max(1, round - 1)];
  const name = c.player ? PLAYER_BY_ID[c.player]?.name ?? "the player" : "";
  if (c.kind === "protect") return `top-${c.threshold} protected (otherwise next year's 1st)`;
  if (c.kind === "snaps") return `becomes a ${up} if ${name} plays ${Math.round(c.threshold * 100)}% of snaps`;
  if (c.kind === "playoffs") return `becomes a ${up} if the team makes the playoffs`;
  if (c.kind === "extend") return `becomes a ${up} if ${name} signs an extension`;
  const label = c.kind === "passYds" ? "passing yards" : c.kind === "rushYds" ? "rushing yards" : c.kind === "recYds" ? "receiving yards" : "sacks";
  return `becomes a ${up} if ${name} reaches ${c.threshold.toLocaleString("en-US")} ${label}`;
}

/** Why a condition can't go on a pick in this deal, or null if it can. */
export function conditionProblem(state: GameState, deal: TradeDeal, side: 0 | 1, a: TradeAsset): string | null {
  if (a.kind !== "pick" || !a.cond) return null;
  const c = a.cond;
  const { year, round } = parsePick(a.pick);
  if (c.kind === "protect") return round === 1 ? null : "Only a 1st-round pick can be protected.";
  if (round === 1) return "A 1st can only carry protection, not an upgrade.";
  // The condition has to settle before the pick is used.
  if (year <= conditionSeason(state)) return `The ${year} pick is used before the condition can settle.`;
  if (c.kind === "playoffs") return null;
  // It has to turn on a player the pick's sender is getting in this trade.
  const incoming = deal.send[1 - side].filter((x) => x.kind === "player").map((x) => (x as { id: string }).id);
  return c.player && incoming.includes(c.player) ? null : "The condition has to be about a player coming to the team sending the pick.";
}

/** How likely a condition is to be met, as a front office would guess it from what it can see. */
function chance(state: GameState, sender: string, pick: string, c: PickCondition): number {
  const last = state.date > RULES.keyDates.regularSeasonEnd ? RULES.season : RULES.season - 1;
  if (c.kind === "protect") {
    const slot = projectedSlot(state, parsePick(pick).from, parsePick(pick).year);
    return slot <= c.threshold ? 0.7 : slot <= c.threshold + 6 ? 0.3 : 0.08;
  }
  if (c.kind === "playoffs") return Math.max(0.05, Math.min(0.95, ((outlook(state)[sender] ?? 0.5) - 0.38) * 2.6));
  if (c.kind === "extend") return 0.45;
  const s = c.player ? seasonOf(state, c.player, last) : null;
  if (!s) return 0.3;
  const v = c.kind === "snaps" ? s.share : s.line[c.kind] ?? 0;
  return Math.max(0.05, Math.min(0.9, 0.5 + (v / Math.max(0.01, c.threshold) - 1) * 1.2));
}

/** What a conditional pick is worth: its value, plus the upgrade times the chance of getting it. */
export function conditionalValue(state: GameState, team: string, pick: string, c: PickCondition): number {
  const base = pickValue(state, team, pick);
  const sender = pickOwner(state, pick);
  const p = chance(state, sender, pick, c);
  if (c.kind === "protect") return base * (1 - p) + base * 0.8 * p; // a year later is worth a fifth less
  const ratio = chartValue(Math.max(1, (parsePick(pick).round - 2) * 32 + 16)) / chartValue((parsePick(pick).round - 1) * 32 + 16);
  return base * (1 + p * (ratio - 1));
}

/** Records the conditions on a trade's picks as it goes through. */
export function recordConditions(state: GameState, deal: TradeDeal): void {
  const ts = trades(state);
  for (const side of [0, 1] as const) {
    for (const a of deal.send[side]) {
      if (a.kind !== "pick" || !a.cond) continue;
      (ts.conditional ??= []).push({
        pick: a.pick, from: deal.teams[side], to: deal.teams[1 - side], cond: a.cond,
        season: a.cond.kind === "protect" ? parsePick(a.pick).year : conditionSeason(state), traded: state.date, status: "open",
      });
    }
  }
}

/** The open condition on a pick, if there is one. */
export function openCondition(state: GameState, pick: string): ConditionalPick | undefined {
  return trades(state).conditional?.find((c) => c.pick === pick && c.status === "open");
}

function met(state: GameState, c: ConditionalPick): boolean {
  const k = c.cond;
  if (k.kind === "playoffs") return madePlayoffs(state, c.from, c.season);
  if (k.kind === "extend") {
    const deal = k.player ? dealOf(state, k.player) : null;
    return !!deal && state.players[k.player!]?.team === c.from && deal.signed > c.traded && (deal.kind === "extension" || deal.kind === "veteran");
  }
  const s = k.player ? seasonOf(state, k.player, c.season) : null;
  if (!s) return false;
  return (k.kind === "snaps" ? s.share : s.line[k.kind] ?? 0) >= k.threshold;
}

/** Hands over the better pick: the sender's pick one round up in the same draft, its own if it still has it. */
function upgrade(state: GameState, c: ConditionalPick): string {
  const ts = trades(state);
  const { year, round } = parsePick(c.pick);
  const own = pickId(year, round - 1, c.from);
  const better = pickOwner(state, own) === c.from && !pickUsed(state, own) ? own
    : picksOf(state, c.from).find((x) => parsePick(x).year === year && parsePick(x).round === round - 1);
  if (!better || pickOwner(state, c.pick) !== c.to) return "but the sender had no pick a round higher to give";
  ts.picks[better] = c.to;
  ts.picks[c.pick] = c.from;
  return `so the ${teamLabel(c.to)} get ${pickLabel(state, better, c.to)} instead of ${pickLabel(state, c.pick, c.to)}`;
}

/** Protection: a 1st that lands in the protected range goes back, and next year's 1st goes instead. */
function protect(state: GameState, c: ConditionalPick): string {
  const ts = trades(state);
  const { year } = parsePick(c.pick);
  const next = pickId(year + 1, 1, c.from);
  if (pickOwner(state, next) !== c.from) return "but next year's 1st was already gone, so the pick conveys";
  ts.picks[c.pick] = c.from;
  ts.picks[next] = c.to;
  return `so the ${teamLabel(c.from)} keep it and send their ${year + 1} 1st to the ${teamLabel(c.to)}`;
}

function settle(state: GameState, c: ConditionalPick, ok: boolean, note: string): void {
  c.status = ok ? "met" : "missed";
  c.settled = state.date;
  c.note = note;
  const text = `Conditional pick: ${pickLabel(state, c.pick, c.to)} from the ${teamLabel(c.from)} (${describeCondition(state, c.pick, c.cond)}): ${ok ? "condition met" : "condition not met"}${note ? `, ${note}` : ""}`;
  news(state, text);
  if (c.from === state.userTeam || c.to === state.userTeam) send(state, "league", "League Office", "Conditional pick settled", `${text}.`);
}

export function conditionsDaily(state: GameState): void {
  const list = trades(state).conditional;
  if (!list?.length) return;
  for (const c of list) {
    if (c.status !== "open") continue;
    if (pickUsed(state, c.pick)) { c.status = "missed"; c.settled = state.date; continue; }
    if (c.cond.kind === "protect") {
      const overall = pickOverall(state, c.pick);
      if (overall === null) continue;
      const inRange = overall <= c.cond.threshold;
      settle(state, c, !inRange, inRange ? protect(state, c) : "the pick conveys");
      continue;
    }
    if (RULES.season !== c.season) continue;
    const day = c.cond.kind === "extend" ? RULES.keyDates.newLeagueYear : addDays(RULES.keyDates.superBowl, 1);
    if (state.date !== day) continue;
    const ok = met(state, c);
    settle(state, c, ok, ok ? upgrade(state, c) : "");
  }
}

/** CPU deals: about one in four that sends a day-two or day-three pick for a player ties it to how much he plays. */
export function maybeAddCondition(state: GameState, deal: TradeDeal, rng: () => number): void {
  if (rng() > 0.25) return;
  for (const side of [0, 1] as const) {
    const player = deal.send[1 - side].find((x) => x.kind === "player") as { kind: "player"; id: string } | undefined;
    if (!player) continue;
    const i = deal.send[side].findIndex((x) => x.kind === "pick" && parsePick(x.pick).round >= 3 && parsePick(x.pick).year > conditionSeason(state));
    if (i < 0) continue;
    const a = deal.send[side][i] as { kind: "pick"; pick: string };
    const stat = statMark(PLAYER_BY_ID[player.id].position);
    const cond: PickCondition = stat && rng() < 0.4 ? { ...stat, player: player.id } : { kind: "snaps", threshold: 0.5, player: player.id };
    deal.send[side][i] = { ...a, cond };
    return;
  }
}

/** The condition on a pick, in words, for pick lists. */
export function conditionNote(state: GameState, pick: string): string | null {
  const c = openCondition(state, pick);
  return c ? describeCondition(state, pick, c.cond) : null;
}


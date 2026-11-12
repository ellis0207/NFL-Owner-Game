// Cause and effect: the owner's big decisions, what followed right away, and
// what they led to later through other systems (a signing's seasons, a
// trade's verdict, a fired coach's successor). Shown as a report on Reports.

import { nextId } from "./ids";
import { leagueYear } from "./contracts";
import { addDays } from "./dates";
import { money } from "./inbox";
import { PLAYER_BY_ID, teamLabel } from "./league";
import { tradeOutcomes } from "./records";
import { history } from "./seasons";
import type { CauseEntry, GameState } from "./types";

const KEEP = 120;

export function causeLog(state: GameState): CauseEntry[] {
  return (state.causes ??= []);
}

/** Record a decision and its immediate effects. Returns its id, for later effects. */
export function cause(state: GameState, system: string, text: string, now: string[] = [], ref?: CauseEntry["ref"], forecast?: CauseEntry["forecast"]): string {
  const log = causeLog(state);
  const id = nextId(state, "cause");
  const entry: CauseEntry = { id, date: state.date, system, text, effects: now.map((t) => ({ date: state.date, text: t })), ref };
  if (forecast) {
    entry.forecast = forecast;
    entry.effects.push({ date: state.date, text: `Staff forecast (${forecast.option}): ${forecast.metric.toLowerCase()} ${show(forecast, forecast.low)} to ${show(forecast, forecast.high)}, most likely ${show(forecast, forecast.mid)}.` });
  }
  log.unshift(entry);
  if (log.length > KEEP) log.splice(KEEP);
  return id;
}

function show(f: NonNullable<CauseEntry["forecast"]>, n: number): string {
  return f.unit === "money" ? money(n) : f.unit === "wins" ? n.toFixed(1) : Math.round(n).toLocaleString("en-US");
}

const ATTRIBUTION = {
  direct: "This follows directly from the decision.",
  partial: "Part of the change comes from the decision; the season and the economy moved it too.",
  weak: "The record moves for many reasons; this is what happened, not what the decision caused.",
};

/**
 * Hold a decision's forecast up against the season that followed. What was
 * observed is stated as a fact; how much of it the decision caused is said
 * separately, by how directly the decision drives the number.
 */
function checkForecast(state: GameState, c: CauseEntry, season: number, done: { records: Record<string, number[]> }): void {
  const f = c.forecast;
  if (!f || c.outcome) return;
  let observed: number | null = null;
  let seen = "";
  if (f.measure === "teamWins") {
    const rec = done.records[state.userTeam];
    if (!rec) return;
    const w = rec[0] + (rec[2] ?? 0) / 2;
    observed = f.unit === "wins" && f.metric.startsWith("Wins added") ? w - f.baseline : w;
    seen = `the team won ${w} (${w - f.baseline >= 0 ? "+" : ""}${(w - f.baseline).toFixed(1)} on the season before)`;
  } else if (f.measure === "holders") {
    const h = state.business?.holders;
    if (h === undefined) return;
    observed = h;
    seen = `${h.toLocaleString("en-US")} season-ticket holders (${h - f.baseline >= 0 ? "+" : ""}${(h - f.baseline).toLocaleString("en-US")})`;
  } else if (f.measure === "interest") {
    // A full year of payments first.
    const end = addDays(c.date, 365);
    if (state.date < end) return;
    const paid = -(state.business?.ledger ?? []).filter((e) => e.cat === "interest" && e.date > c.date && e.date <= end && (!f.key || (e.note ?? "").includes(f.key))).reduce((t, e) => t + e.amount, 0);
    observed = paid;
    seen = `${money(paid)} in interest`;
  } else {
    const now = revenueNow(state);
    observed = now - f.baseline;
    seen = `the revenue lines moved ${money(observed)} on the year before`;
  }
  const within = observed >= f.low && observed <= f.high;
  const text = `${season}: forecast ${show(f, f.low)} to ${show(f, f.high)}; observed ${seen}. ${within ? "Inside the staff's range." : observed < f.low ? "Below the staff's range." : "Above the staff's range."} ${ATTRIBUTION[f.attribution]}`;
  c.outcome = { season, observed: Math.round(observed * 10) / 10, within, text };
  effect(state, c.id, text);
}

function revenueNow(state: GameState): number {
  const from = addDays(state.date, -365);
  let t = 0;
  for (const e of state.business?.ledger ?? []) if (e.date > from && (e.cat === "tickets" || e.cat === "premium" || e.cat === "concessions" || e.cat === "sponsorship")) t += e.amount;
  return Math.round(t);
}

/** Add a later effect to a recorded decision. */
export function effect(state: GameState, id: string, text: string): void {
  const c = causeLog(state).find((x) => x.id === id);
  if (c && !c.effects.some((e) => e.text === text)) c.effects.push({ date: state.date, text });
}

/** Each May, after the rollover, follow each recent decision into the season that just ended. */
function followUp(state: GameState): void {
  const season = leagueYear(state.date) - 1;
  const hist = history(state);
  const done = hist.seasons.find((s) => s.season === season);
  if (!done) return;
  for (const c of causeLog(state)) {
    if (c.forecast && !c.outcome && leagueYear(c.date) <= season) checkForecast(state, c, season, done);
    if (!c.ref || c.followed?.includes(season) || Number(c.date.slice(0, 4)) > season + 1) continue;
    if (leagueYear(c.date) > season) continue;
    (c.followed ??= []).push(season);
    if (c.ref.kind === "player") {
      const row = (hist.stats[c.ref.id] ?? []).find((s) => s.season === season && s.team === state.userTeam);
      const name = PLAYER_BY_ID[c.ref.id]?.name ?? "The player";
      const g = row ? Number(row.g ?? row.games ?? 0) : 0;
      effect(state, c.id, row ? `${season}: ${name} played ${g} game${g === 1 ? "" : "s"} for us.` : `${season}: ${name} didn't play for us.`);
    } else if (c.ref.kind === "trade") {
      const o = tradeOutcomes(state, state.userTeam).find((x) => x.trade.id === c.ref!.id);
      if (o) effect(state, c.id, `${season}: ${o.verdict}`);
    } else if (c.ref.kind === "coach") {
      const rec = done.records[state.userTeam];
      if (rec) effect(state, c.id, `${season}: the first season after, the team went ${rec[0]}-${rec[1]}${rec[2] ? `-${rec[2]}` : ""}${done.playoffs[state.userTeam] ? " and made the playoffs" : ""}.`);
      c.ref = undefined;
    } else if (c.ref.kind === "club") {
      const rec = done.records[c.ref.id];
      if (rec) effect(state, c.id, `${season}: the ${teamLabel(c.ref.id)} went ${rec[0]}-${rec[1]}.`);
    }
    // Follow a player or trade for three seasons.
    if (c.followed.length >= 3) c.ref = undefined;
  }
}

export function causesDaily(state: GameState): void {
  if (state.date.slice(5) === "05-16" && state.causes?.length) followUp(state);
}

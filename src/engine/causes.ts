// Cause and effect: the owner's big decisions, what followed right away, and
// what they led to later through other systems (a signing's seasons, a
// trade's verdict, a fired coach's successor). Shown as a report on Reports.

import { leagueYear } from "./contracts";
import { PLAYER_BY_ID, teamLabel } from "./league";
import { tradeOutcomes } from "./records";
import { history } from "./seasons";
import type { CauseEntry, GameState } from "./types";

const KEEP = 120;

export function causeLog(state: GameState): CauseEntry[] {
  return (state.causes ??= []);
}

/** Record a decision and its immediate effects. Returns its id, for later effects. */
export function cause(state: GameState, system: string, text: string, now: string[] = [], ref?: CauseEntry["ref"]): string {
  const log = causeLog(state);
  const id = `c${state.date}-${log.length}`;
  log.unshift({ id, date: state.date, system, text, effects: now.map((t) => ({ date: state.date, text: t })), ref });
  if (log.length > KEEP) log.splice(KEEP);
  return id;
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

// What finished Stadium Lab renovations (stadiumlab.ts) do to the building,
// read by the modules underneath it: the seats, roof and upkeep laid over
// STADIUM_BY_TEAM, the premium seats, parking and land the grounds model adds,
// the seats shut while work runs through a season, and the gate effects the
// projects add up. A leaf, so grounds.ts, projects.ts and construction.ts can
// read it without a loop.
import { TEAM_BY_ID } from "./league";
import { STADIUM_BY_TEAM } from "./stadiums";
import type { GameState, LabRenovation, StadiumLabState } from "./types";

export function stadiumLab(state: GameState): StadiumLabState {
  return (state.stadiumLab ??= { renovations: [], drafts: {} });
}

/** The game's roof for a Lab roof kind: a seating canopy still leaves the field open to the weather. */
export function gameRoof(lab: string): "open" | "dome" | "retractable" {
  return lab === "fixed" ? "dome" : lab === "retractable" ? "retractable" : "open";
}

/** Renovations finished at a building, oldest first. */
export function builtAt(state: GameState, building: string): LabRenovation[] {
  return (state.stadiumLab?.renovations ?? []).filter((r) => r.opened && r.at === building);
}

/** The renovation under way at a building, if any. */
export function underWay(state: GameState, building: string): LabRenovation | undefined {
  return state.stadiumLab?.renovations.find((r) => !r.opened && r.at === building);
}

/**
 * Lays finished renovations over the stadium table: seats and roof.
 * Runs at the end of bindConstruction, after the original buildings, moves,
 * new stadiums and leases are in place, so it always starts from them. Every
 * club in the building gets the new bowl (two clubs share MetLife and SoFi).
 */
export function bindStadiumLab(state: GameState): void {
  for (const r of state.stadiumLab?.renovations ?? []) {
    if (!r.opened) continue;
    for (const s of Object.values(STADIUM_BY_TEAM)) {
      if (s.name !== r.at) continue;
      s.capacity = r.capacity;
      s.roof = gameRoof(r.roof);
      const t = TEAM_BY_ID[s.team];
      if (t) t.roof = s.roof === "open" ? "outdoors" : s.roof === "dome" ? "dome" : "retractable";
    }
  }
}

/** A finished renovation's upkeep (a bigger bowl costs more to run, solar a little less), applied by bindLeases after it resets rent and upkeep. */
export function bindLabUpkeep(state: GameState): void {
  for (const r of state.stadiumLab?.renovations ?? []) {
    if (!r.opened || r.upkeep === 1) continue;
    for (const s of Object.values(STADIUM_BY_TEAM)) if (s.name === r.at) s.upkeep = Math.round(s.upkeep * r.upkeep);
  }
}

/** Premium seats our renovations added at the building we play in, open on a date. */
export function labPremium(state: GameState, date: string, team = state.userTeam): number {
  const here = STADIUM_BY_TEAM[team]?.name;
  return (state.stadiumLab?.renovations ?? []).filter((r) => r.at === here && r.opens <= date).reduce((t, r) => t + r.premium, 0);
}

/** Parking and land our renovations added at the building: spaces in our lots (garage share) and acres bought. */
export function labGrounds(state: GameState, date: string, team = state.userTeam): { surface: number; garage: number; acres: number; building?: { spaces: number; opens: string } } {
  const here = STADIUM_BY_TEAM[team]?.name;
  let surface = 0, garage = 0, acres = 0;
  let building: { spaces: number; opens: string } | undefined;
  for (const r of state.stadiumLab?.renovations ?? []) {
    if (r.at !== here) continue;
    if (r.opens <= date) { garage += r.garage; surface += r.spaces - r.garage; }
    else if (r.started <= date && r.spaces > 0) building = { spaces: r.spaces, opens: r.opens };
    if (r.started <= date) acres += r.acres;
  }
  return { surface, garage, acres, building };
}

/** Seats shut on a date while a renovation runs through a season (work in the offseason closes nothing that's sold). */
export function labClosure(state: GameState, date: string, team = state.userTeam): { seats: number; to: string; why: string } | undefined {
  const r = underWay(state, STADIUM_BY_TEAM[team]?.name ?? "");
  if (!r || r.closed <= 0 || date < r.started || date >= r.opens) return undefined;
  // The first summer's work is done before the preseason; seasons after that play around it.
  if (date < `${r.started.slice(0, 4)}-08-01`) return undefined;
  return { seats: r.closed, to: r.opens, why: r.title };
}

/** Opened renovations' gate effects at the building we play in. */
export function labEffects(state: GameState): { demand: number; premium: number; perCap: number; sponsor: number } {
  const out = { demand: 0, premium: 0, perCap: 0, sponsor: 0 };
  const list = state.stadiumLab?.renovations;
  if (!list?.length) return out;
  const here = STADIUM_BY_TEAM[state.userTeam]?.name;
  for (const r of list) {
    if (!r.opened || r.at !== here) continue;
    out.demand += r.effect.demand;
    out.premium += r.effect.premium;
    out.perCap += r.effect.perCap;
    out.sponsor += r.effect.sponsor;
  }
  return out;
}

/** A renovation at our building already delivers (or is building) this project (projects.ts). */
export function labCovers(state: GameState, projectId: string): LabRenovation | undefined {
  const here = STADIUM_BY_TEAM[state.userTeam]?.name;
  return state.stadiumLab?.renovations.find((r) => r.at === here && r.covers.includes(projectId));
}

import { afterEach, describe, expect, it } from "vitest";
import { bindConstruction } from "../src/engine/construction";
import { bindExpansion, forceExpansion, forceOpen, expansion } from "../src/engine/expansion";
import { facilities } from "../src/engine/facilities";
import { groundsModel, seatsOn } from "../src/engine/grounds";
import { RULES } from "../src/engine/league";
import { projectEffects, projectTerms } from "../src/engine/projects";
import { labDraft, labQuote, labVenue, startRenovation, stadiumLabDaily } from "../src/engine/stadiumlab";
import { STADIUM_BY_TEAM } from "../src/engine/stadiums";
import { parseSaveFile, toSaveFile } from "../src/save/codec";
import type { GameState } from "../src/engine/types";
import { stateAt } from "./fixtures";

const AT = "2027-02-20";

/** Puts the stadium table back the way a save without renovations has it. */
function reset(s: GameState): void {
  bindConstruction({ ...s, stadiumLab: undefined });
}

let last: GameState | undefined;
afterEach(() => { if (last) reset(last); last = undefined; });

function plan(s: GameState) {
  const view = labVenue(s);
  const d = labDraft(s, view);
  return { view, d: { ...d, capacity: d.capacity + 5000, suites: 20, wifi: true, amenities: true, board: "halo", plaza: true } };
}

describe("Stadium Lab renovations", () => {
  it("prices our building in the game's terms and starts with nothing to build", () => {
    const s = (last = stateAt("DET", 5, AT));
    const view = labVenue(s);
    expect(view.known).toBe(true);
    expect(view.built.capacity).toBe(STADIUM_BY_TEAM.DET.capacity);
    expect(labQuote(s, labDraft(s, view), view).blocked).toMatch(/Nothing/);
    const { d } = plan(s);
    const q = labQuote(s, d, view);
    expect(q.blocked).toBeUndefined();
    expect(q.cost).toBeGreaterThan(100e6);
    expect(q.opens.endsWith("-08-01")).toBe(true);
    expect(q.covers.sort()).toEqual(["boards", "concourse", "wifi"]);
    expect(q.effect.demand).toBeGreaterThan(0.1);
    expect(q.premium).toBe(400);
    expect(q.yearly).toBeGreaterThan(0);
  });

  it("pays monthly, closes seats in a season it runs through, and opens the new bowl", () => {
    const s = (last = stateAt("DET", 5, AT));
    const before = STADIUM_BY_TEAM.DET.capacity;
    const demand = projectEffects(s).gate.demand;
    const { d } = plan(s);
    const msg = startRenovation(s, d);
    expect(msg).toMatch(/Work starts/);
    const r = s.stadiumLab!.renovations[0];
    expect(r.paid).toBe(Math.round(r.cost * 0.2));
    expect(projectTerms(s, "wifi").blocked).toMatch(/renovation/);
    if (r.closed) {
      const season = `${r.started.slice(0, 4)}-09-15`;
      if (season < r.opens) expect(groundsModel(s, season).sections.some((x) => x.id === "work-lab")).toBe(true);
    }
    s.date = r.opens;
    stadiumLabDaily(s);
    expect(r.opened).toBe(true);
    expect(STADIUM_BY_TEAM.DET.capacity).toBe(before + 5000);
    expect(projectEffects(s).gate.demand).toBeGreaterThan(demand + 0.1);
    expect(seatsOn(groundsModel(s)).premium).toBeGreaterThan(Math.round((before + 5000) * 0.12) + 399);
    expect(facilities(s).parts.network.wear).toBe(0);
    // The next design starts from the renovated building.
    expect(labVenue(s).built.capacity).toBe(before + 5000);
    expect(labVenue(s).built.wifi).toBe(true);
    // A reload keeps the building as renovated.
    const back = parseSaveFile(JSON.stringify(toSaveFile(s)));
    expect(STADIUM_BY_TEAM.DET.capacity).toBe(before + 5000);
    reset(back);
    expect(STADIUM_BY_TEAM.DET.capacity).toBe(before);
  });

  it("models a building the Lab doesn't know, like an expansion club's", () => {
    const s = (last = stateAt("DET", 5, AT));
    forceExpansion(s, { joins: RULES.season + 1 });
    forceOpen(s);
    const id = expansion(s).clubs[0].id;
    const view = labVenue(s, id);
    expect(view.known).toBe(false);
    expect(view.model.capacity).toBe(STADIUM_BY_TEAM[id].capacity);
    expect(labQuote(s, { ...view.built, capacity: view.built.capacity + 2000 }, view).blocked).toBeDefined();
    bindExpansion({ ...s, expansion: undefined } as GameState);
    last = undefined;
  });

  it("won't build in a stadium we rent", () => {
    const s = (last = stateAt("DET", 5, AT));
    const was = STADIUM_BY_TEAM.DET.structure;
    STADIUM_BY_TEAM.DET.structure = "tenant";
    try {
      expect(labQuote(s, plan(s).d).blocked).toMatch(/rent/);
    } finally { STADIUM_BY_TEAM.DET.structure = was; }
  });
});

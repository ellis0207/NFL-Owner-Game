import { afterEach, describe, expect, it } from "vitest";
import { baseCost, bindConstruction, construction, constructionDaily, fastTrack } from "../src/engine/construction";
import { bindExpansion, forceExpansion, forceOpen, expansion } from "../src/engine/expansion";
import { facilities } from "../src/engine/facilities";
import { groundsImpact, groundsModel, leaseLot, leaseOffers, seatsOn } from "../src/engine/grounds";
import { parkingProfiles } from "../src/lab/parking-data.js";
import { RULES } from "../src/engine/league";
import { projectEffects, projectTerms } from "../src/engine/projects";
import { drawable, groundsScene, labDraft, labQuote, labVenue, newDesign, setNewDesign, startRenovation, stadiumLabDaily } from "../src/engine/stadiumlab";
import { labEffects } from "../src/engine/labstate";
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

  it("designs a new stadium in the Lab: the fit-out adds to its price and opens with the building", () => {
    const s = (last = stateAt("DET", 5, AT));
    fastTrack(s);
    const plainCost = baseCost(s, construction(s).plan!);
    reset(s);
    const t = (last = stateAt("DET", 5, AT));
    fastTrack(t, { lab: { suites: 40, board: "halo", plaza: true, amenities: true, shape: "horseshoe", facade: "glass", surface: "natural", roof: "fixed", capacity: 68000 } });
    const p = construction(t).plan!;
    expect(baseCost(t, p)).toBeGreaterThan(plainCost + 150e6);
    t.date = p.opens!;
    constructionDaily(t);
    expect(p.stage).toBe("open");
    expect(STADIUM_BY_TEAM.DET.name).toBe(p.name);
    expect(labEffects(t).demand).toBeGreaterThan(0.05);
    expect(seatsOn(groundsModel(t)).premium).toBeGreaterThanOrEqual(Math.round(STADIUM_BY_TEAM.DET.capacity * 0.12) + 800);
    expect(facilities(t).surface).toBe("grass");
    const view = labVenue(t);
    expect(view.known).toBe(false);
    expect(view.built.suites).toBe(40);
    expect(drawable(view, view.built).c.shape).toBe("horseshoe");
    expect(projectTerms(t, "boards").blocked).toMatch(/as designed/);
  });

  it("saves a design to the plan only in the design stage", () => {
    const s = (last = stateAt("DET", 5, AT));
    expect(setNewDesign(s, { capacity: 70000 } as never)).toMatch(/studies/);
    fastTrack(s);
    expect(newDesign(s)?.capacity).toBe(construction(s).plan!.capacity);
  });

  it("draws our grounds with a proposed garage or lease, and leases a named lot", () => {
    const s = (last = stateAt("DET", 5, AT));
    const offers = leaseOffers(s);
    expect(offers.length).toBeGreaterThan(1);
    expect(leaseOffers(s)).toEqual(offers);
    expect(offers.reduce((t, o) => t + o.spaces, 0)).toBeLessThanOrEqual(groundsModel(s).leasable + 100);
    // Closer lots cost more a space.
    const [near, far] = [offers[0], offers[offers.length - 1]];
    if (near.walk < far.walk) expect(near.rent / near.spaces).toBeGreaterThan(far.rent / far.spaces * 0.99);
    const lease = groundsImpact(s, { lease: near.id });
    expect(lease.yearly).toBe(near.rent);
    expect(lease.perGame).toBeGreaterThanOrEqual(0);
    const garage = groundsImpact(s, { garage: 2000 });
    expect(garage.cost).toBeGreaterThan(0);
    expect(garage.after.club).toBeGreaterThanOrEqual(garage.before.club);
    const { view } = groundsScene(s, { garage: 2000 });
    expect(parkingProfiles[view.model.id].facilities.some((f) => f.control === "proposed" && f.spaces === 2000)).toBe(true);
    expect(leaseLot(s, 0, near.id)).toBeNull();
    expect(leaseOffers(s).some((o) => o.id === near.id)).toBe(false);
    const lot = groundsModel(s).lots.find((l) => l.name === near.name)!;
    expect(lot.walk).toBe(near.walk);
    expect(lot.control).toBe("leased");
    groundsScene(s);
    expect(parkingProfiles[view.model.id].facilities.some((f) => f.control === "leased" && f.name === near.name)).toBe(true);
    expect(parkingProfiles[view.model.id].facilities.some((f) => f.control === "proposed")).toBe(false);
  });
});

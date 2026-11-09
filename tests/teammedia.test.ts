import { describe, expect, it } from "vitest";
import { nationalRevenue } from "../src/engine/business";
import { teamStaff } from "../src/engine/staff";
import {
  audienceLift, contentYear, defaultContentNet, nationalBreakdown, searchArchive, setShow, setSpokesperson, spokesperson, teamMedia, tvOutlook,
} from "../src/engine/teammedia";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("team media", () => {
  it("splits the national money and forecasts the next TV deals as a range", () => {
    const s = stateAt(TEAM, 7);
    const nb = nationalBreakdown(2026);
    expect(nb.total).toBeCloseTo(nationalRevenue(2026), 0);
    expect(nb.tv).toBeGreaterThan(nb.total * 0.5);
    expect(nb.tv + nb.licensing + nb.other).toBeCloseTo(nb.total, 0);
    const o = tvOutlook(s);
    expect(o.year).toBe(2030);
    expect(o.low).toBeLessThan(o.mid);
    expect(o.mid).toBeLessThan(o.high);
  });

  it("runs a content department, grows an audience and keeps an archive", () => {
    const s = stateAt(TEAM, 7);
    const t = teamMedia(s);
    expect(t.followers).not.toBe(t.followers0);
    expect(t.feed.length).toBeGreaterThan(0);
    expect(t.archive.length).toBeGreaterThan(20);
    expect(audienceLift(s)).toBeGreaterThan(0.7);
    expect(audienceLift(s)).toBeLessThan(1.5);
    // The default department roughly matches what the business budget already assumes.
    const c = contentYear(s, 2026);
    expect(Math.abs(c.cost - c.revenue - defaultContentNet(2026))).toBeLessThan(0.5e6);
    // A documentary costs more and earns nothing directly.
    setShow(s, "documentary", true);
    expect(contentYear(s, 2026).cost).toBeGreaterThan(c.cost + 2e6);
    // Search finds a headline by its words.
    const word = t.archive[0].headline.split(" ").find((w) => w.length > 4)!;
    expect(searchArchive(s, word).length).toBeGreaterThan(0);
    // The spokesperson answers for the club.
    setSpokesperson(s, "gm");
    expect(spokesperson(s).name).toBe(teamStaff(TEAM).GM?.name ?? s.ownerName);
  });
});

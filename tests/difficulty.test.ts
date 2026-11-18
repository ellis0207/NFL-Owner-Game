import { describe, expect, it } from "vitest";
import { applyDifficulty, hurt } from "../src/engine/difficulty";
import { culture, gmTrust } from "../src/engine/culture";
import { openTalks, talksFor } from "../src/engine/negotiation";
import { stateAt } from "./fixtures";

const TEAM = "NYG";

describe("difficulty", () => {
  it("a level sets scouting and the economy, and scales setbacks but not gains", () => {
    const s = stateAt(TEAM, 3, "2027-04-01");
    applyDifficulty(s.settings, "legend");
    expect(s.settings.scouting).toBe("foggy");
    expect(s.settings.economy).toBe("volatile");
    expect(hurt(s, -4)).toBe(-6);
    expect(hurt(s, 4)).toBe(4);
    const t = culture(s).gmTrust;
    gmTrust(s, -6);
    expect(culture(s).gmTrust).toBeCloseTo(t - 9, 0);
    applyDifficulty(s.settings, "rookie");
    expect(hurt(s, -10)).toBe(-6);
  }, 600_000);

  it("agents open higher with our club on harder levels", () => {
    const a = stateAt(TEAM, 3, "2027-04-01");
    const b = stateAt(TEAM, 3, "2027-04-01");
    applyDifficulty(b.settings, "legend");
    const id = Object.keys(a.players).find((x) => a.players[x].team === TEAM && a.players[x].status === "camp" && talksFor(a, TEAM, x).ok && !a.negotiations[x])!;
    const kind = talksFor(a, TEAM, id).kind;
    const na = openTalks(a, TEAM, id, kind, "owner");
    const nb = openTalks(b, TEAM, id, kind, "owner");
    expect(nb.ask).toBeCloseTo(na.ask * 1.08, -3);
    expect(nb.floor).toBeGreaterThan(na.floor);
  }, 600_000);
});

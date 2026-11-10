import { describe, expect, it } from "vitest";
import { business } from "../src/engine/business";
import {
  community, communityDaily, communityScore, decideGrant, disciplineCut, extraCost, loyaltyPull, ownerGift, servicesScore, setOversight, setProgram, setService,
} from "../src/engine/community";
import { fanBase } from "../src/engine/fans";
import { owner } from "../src/engine/ownership";
import { stateAt } from "./fixtures";

const TEAM = "DET";

describe("community and player services", () => {
  it("the foundation takes applications, gives grants and reports every year", () => {
    const s = stateAt(TEAM, 7);
    const c = community(s);
    expect(c.grants.length).toBeGreaterThan(5);
    expect(c.foundation.given).toBeGreaterThan(0);
    expect(c.appearances.count).toBeGreaterThan(0);
    // Defaults cost nothing beyond the community budget.
    expect(extraCost(s)).toBe(0);
    expect(communityScore(s)).toBeGreaterThanOrEqual(0);
    const pending = c.grants.find((g) => g.status === "pending");
    if (pending) {
      const bal = c.foundation.balance;
      expect(decideGrant(s, pending.id, true)).toBeNull();
      expect(c.foundation.balance).toBe(bal - pending.amount);
    }
    // A personal gift comes out of the owner's pocket, not the club's books.
    const liquid = owner(s).liquid;
    const ledger = business(s).ledger.length;
    expect(ownerGift(s, 1e6)).toBeNull();
    expect(owner(s).liquid).toBe(liquid - 1e6);
    expect(business(s).ledger.length).toBe(ledger);
  });

  it("more programs and services cost money and pay back in trust, loyalty and fewer incidents", () => {
    const s = stateAt(TEAM, 7);
    const trust = fanBase(s).trust;
    setProgram(s, "clinics", true);
    setProgram(s, "access", true);
    setService(s, "family", true);
    setService(s, "career", true);
    setOversight(s, 2);
    expect(extraCost(s)).toBeGreaterThan(1.5e6);
    expect(disciplineCut(s)).toBeGreaterThan(0);
    expect(loyaltyPull(s)).toBeGreaterThan(0);
    expect(servicesScore(s)).toBeGreaterThan(6.5);
    for (let m = 3; m <= 8; m++) {
      s.date = `2027-${String(m).padStart(2, "0")}-01`;
      communityDaily(s);
    }
    expect(fanBase(s).trust).toBeGreaterThan(trust - 1);
    expect(communityScore(s)).toBeGreaterThan(0);
    const spent = business(s).ledger.filter((e) => e.cat === "community" && e.note?.startsWith("Community programs")).length;
    expect(spent).toBeGreaterThanOrEqual(6);
  });
});

import { describe, expect, it } from "vitest";
import { teamPlayerIds } from "../src/engine/cap";
import { PLAYER_BY_ID, TEAMS } from "../src/engine/league";
import { marketView } from "../src/engine/market";
import { ability, perceivedAbility } from "../src/engine/staff";
import { canTradePlayer, cpuAnswer, playerValue, swapDeal } from "../src/engine/trades";
import type { TradeDeal } from "../src/engine/types";
import { stateAt } from "./fixtures";

// How CPU front offices value players in a trade, checked against the kind of
// offer no real club makes: a starter in his prime for a backup.
const US = "DET";

describe("CPU trade sense", () => {
  it("won't send a good starter away in the season for one of our backups", () => {
    const state = stateAt(US, 5, "tradeDeadline");
    const ours = teamPlayerIds(state, US).filter((id) => canTradePlayer(state, id).ok)
      .map((id) => ({ id, v: playerValue(state, "gm", US, id) }))
      .filter((x) => x.v.role < 1 && x.v.points > 0);
    let tried = 0;
    for (const t of TEAMS.map((x) => x.id).filter((x) => x !== US)) {
      const starter = teamPlayerIds(state, t)
        .filter((id) => canTradePlayer(state, id, US).ok && !["K", "P", "LS"].includes(PLAYER_BY_ID[id].position))
        .map((id) => ({ id, v: playerValue(state, "gm", t, id), mv: marketView(state, id) }))
        .filter((x) => x.v.role === 1 && x.mv >= 85)
        .sort((a, b) => b.mv - a.mv)[0];
      if (!starter) continue;
      // Our backups that are worth about what he is on paper, judged by his club.
      for (const b of ours.slice(0, 12)) {
        if (marketView(state, b.id) >= starter.mv - 3) continue;
        const deal: TradeDeal = { teams: [US, t], send: [[{ kind: "player", id: b.id }], [{ kind: "player", id: starter.id }]] };
        tried++;
        expect(cpuAnswer(state, deal).verdict, `${t} ${PLAYER_BY_ID[starter.id].name} for ${PLAYER_BY_ID[b.id].name}`).not.toBe("accept");
      }
    }
    expect(tried).toBeGreaterThan(30);
  });

  it("swaps a starter only for a player who starts for the club and stands about as high", () => {
    const state = stateAt(US, 5, "tradeDeadline");
    const cpu = TEAMS.map((x) => x.id).filter((x) => x !== US);
    for (let i = 0; i < cpu.length; i++) {
      for (const b of [US, cpu[(i + 7) % cpu.length]]) {
        const a = cpu[i];
        const deal = swapDeal(state, a, b, () => 0.5);
        if (!deal) continue;
        const x = deal.send[0].find((s) => s.kind === "player")!;
        const y = deal.send[1].find((s) => s.kind === "player")!;
        if (x.kind !== "player" || y.kind !== "player") continue;
        const mx = marketView(state, x.id), my = marketView(state, y.id);
        expect(Math.abs(mx - my)).toBeLessThanOrEqual(7);
        if (playerValue(state, "gm", a, x.id).role === 1) {
          expect(playerValue(state, "gm", a, y.id).role).toBe(1);
          expect(my).toBeGreaterThanOrEqual(mx - 4);
        }
      }
    }
  });

  it("reads a long-time veteran about the same as the rest of the league", () => {
    const state = stateAt(US, 5, "tradeDeadline");
    const vets = Object.keys(state.players).filter((id) => state.players[id].team && (PLAYER_BY_ID[id]?.yearsExp ?? 0) >= 8).slice(0, 300);
    let worst = 0;
    for (const id of vets) for (const t of ["CHI", "NYJ", "SEA"]) worst = Math.max(worst, Math.abs(perceivedAbility(state, id, `gm:${t}`, 60) - ability(state, id)));
    // A poor evaluator's error on a rookie can run past ten points; on a veteran it stays under seven.
    expect(worst).toBeLessThan(7);
  });
});

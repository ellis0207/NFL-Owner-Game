import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { business, cashBalance, DEPTS } from "../src/engine/business";
import { capSummary, teamPlayerIds } from "../src/engine/cap";
import { leagueYear } from "../src/engine/contracts";
import { execs } from "../src/engine/executives";
import { SCHEDULE, TEAMS } from "../src/engine/league";
import type { GameState, LedgerCat } from "../src/engine/types";
import { money } from "../src/ui/format";
import { tipCard } from "../src/ui/tips";
import { stateAt } from "./fixtures";

const TEAM = "DET";

function render(game: GameState, key: string): string | null {
  const card = tipCard(game, key);
  if (!card) return null;
  return renderToStaticMarkup(createElement(Fragment, null, card.title, card.sub, card.body, card.foot));
}

// renderToStaticMarkup escapes text; money strings carry no markup characters.
const plain = (html: string) => html.replace(/<[^>]+>/g, " ");

describe("hover cards", () => {
  const game = stateAt(TEAM, 7);
  const year = leagueYear(game.date);

  it("draws a card for every kind of thing from live state, and nothing for unknown ids", () => {
    const before = JSON.stringify(game);
    const player = teamPlayerIds(game, TEAM)[0];
    const coach = Object.values(game.staff!.people).find((c) => c.team === TEAM && c.role === "HC")!;
    const exec = Object.values(execs(game).people).find((e) => e.role)!;
    const played = SCHEDULE.find((g) => game.results[g.id])!;
    const keys = [
      `player:${player}`, `coach:${coach.id}`, `exec:${exec.id}`, `game:${played.id}`, "cash",
      `pnl:${year}:revenue`, `pnl:${year}:expenses`, `pnl:${year}:operating`,
      ...TEAMS.map((t) => `team:${t.id}`), ...TEAMS.map((t) => `cap:${t.id}`),
      ...(Object.keys(DEPTS) as string[]).map((d) => `dept:${d}`),
    ];
    for (const k of keys) expect(render(game, k), k).toBeTruthy();
    for (const k of ["player:nobody", "team:XXX", "coach:nobody", "exec:nobody", "ledger:nothing:2026", "game:nope", "bogus:1"]) expect(tipCard(game, k), k).toBeNull();
    // Looking never changes the game.
    expect(JSON.stringify(game)).toBe(before);
  });

  it("shows the same figures the pages show", () => {
    const cap = capSummary(game, TEAM);
    expect(plain(render(game, `cap:${TEAM}`)!)).toContain(money(cap.space));
    expect(plain(render(game, "cash")!)).toContain(money(cashBalance(game)));
    // A ledger line adds up to its payments.
    const cats = new Set(business(game).ledger.filter((e) => e.year === year).map((e) => e.cat));
    for (const cat of cats) {
      const total = business(game).ledger.filter((e) => e.year === year && e.cat === cat).reduce((t, e) => t + e.amount, 0);
      expect(plain(render(game, `ledger:${cat}:${year}`)!), cat).toContain(money(total));
    }
    expect(cats.size).toBeGreaterThan(10);
    expect(cats.has("players" as LedgerCat)).toBe(true);
  });
});

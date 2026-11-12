/**
 * Hover cards: any element carrying `data-tip="kind:arg[:arg]"` shows a card
 * about that thing when the mouse rests on it (or on a long press on a phone).
 * The card is drawn from live game state at the moment it opens (tips.tsx), so
 * it always matches what the full pages show. Plain `title` text gets the same
 * card look (TipLayer.tsx).
 */
export type TipKind =
  | "player" // player id
  | "team" // team id
  | "coach" // staff person id (coaches, GMs, scouts, trainers)
  | "exec" // business executive id
  | "cap" // team id, optional league year
  | "ledger" // ledger category, league year
  | "dept" // business department budget
  | "cash" // the club's cash on hand
  | "pnl" // league year, "revenue" | "expenses" | "operating"
  | "game"; // scheduled game id

export function tip(kind: TipKind, ...args: (string | number | undefined)[]): { "data-tip": string } {
  return { "data-tip": [kind, ...args.filter((a) => a !== undefined)].join(":") };
}

// Messages to the owner, the league news feed, and money formatting shared by the engine.
import type { GameState, InboxItem } from "./types";

export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${abs}`;
}

export function send(state: GameState, kind: InboxItem["kind"], from: string, title: string, body: string, gameId?: string): void {
  state.inbox.unshift({ id: `${state.date}-${state.inbox.length}`, date: state.date, kind, from, title, body, read: false, gameId });
}

/**
 * Where a league news line comes from. The media writes stories from the wire by topic (engine/media);
 * "games", "draft" and "college" are covered by their own desks, and "log" lines are already written up elsewhere.
 */
export type NewsTopic =
  | "coaching" | "contracts" | "freeagency" | "trades" | "league" | "labor" | "discipline" | "business" | "stadiums"
  | "relocation" | "ownership" | "frontoffice" | "honors" | "retirement" | "camp" | "draft" | "college" | "games" | "log";

export function news(state: GameState, topic: NewsTopic, text: string): void {
  state.news.unshift({ date: state.date, text, topic });
  if (state.news.length > 600) state.news.length = 600;
}

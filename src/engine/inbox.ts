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

export function news(state: GameState, text: string): void {
  state.news.unshift({ date: state.date, text });
  if (state.news.length > 300) state.news.length = 300;
}

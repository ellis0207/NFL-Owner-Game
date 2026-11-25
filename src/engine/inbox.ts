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
 * A letter whose ask already sits on the owner's decision queue (a press request, a booking, a trade call)
 * arrives filed as read: the queue is the to-do list, and the letter is there for the record.
 */
export function sendFiled(state: GameState, kind: InboxItem["kind"], from: string, title: string, body: string): void {
  send(state, kind, from, title, body);
  state.inbox[0].read = true;
}

/** A routine note held for the GM's weekly report, so the owner gets one letter a week rather than one per move. */
export function digest(state: GameState, desk: "roster" | "medical", line: string): void {
  (state.digest ??= []).push({ date: state.date, desk, line });
}

/** The held notes as report lines, by desk, and the queue emptied. */
export function takeDigest(state: GameState): string[] {
  const held = state.digest ?? [];
  if (!held.length) return [];
  state.digest = [];
  const out: string[] = [];
  const roster = held.filter((d) => d.desk === "roster").map((d) => d.line);
  const medical = held.filter((d) => d.desk === "medical").map((d) => d.line);
  if (roster.length) out.push(`Roster moves this week:\n${roster.map((l) => `- ${l}`).join("\n")}`);
  if (medical.length) out.push(`From the medical staff:\n${medical.map((l) => `- ${l}`).join("\n")}`);
  return out;
}

/**
 * Where a league news line comes from. The media writes stories from the wire by topic (engine/media);
 * "games", "draft" and "college" are covered by their own desks, and "log" lines are already written up elsewhere.
 */
export type NewsTopic =
  | "coaching" | "contracts" | "freeagency" | "trades" | "league" | "labor" | "discipline" | "business" | "stadiums"
  | "relocation" | "ownership" | "frontoffice" | "honors" | "retirement" | "camp" | "draft" | "college" | "games" | "media" | "log";

export function news(state: GameState, topic: NewsTopic, text: string): void {
  state.news.unshift({ date: state.date, text, topic });
  if (state.news.length > 600) state.news.length = 600;
}

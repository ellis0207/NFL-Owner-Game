import { useState } from "react";
import { shortDate } from "../../engine/dates";
import type { GameState } from "../../engine/types";
import { messagePriority } from "../../engine/desk";
import { useUi } from "../ui";

export function InboxScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const [urgent, setUrgent] = useState(false);
  // Urgent first puts unread messages that need a decision soon at the top.
  // "Most urgent first" ranks by kind, urgency, age and whether it's been read (desk.ts).
  const list = urgent ? game.inbox.slice().sort((a, b) => messagePriority(game, b).score - messagePriority(game, a).score) : game.inbox;
  const [open, setOpen] = useState<string | null>(game.inbox[0]?.id ?? null);
  function toggle(id: string) {
    const item = game.inbox.find((i) => i.id === id)!;
    if (!item.read) { item.read = true; changed(); }
    setOpen(open === id ? null : id);
  }
  function markAll() {
    game.inbox.forEach((i) => (i.read = true));
    changed();
  }
  return (
    <section className="panel stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Inbox</h2>
        <div className="btn-row">
          <button className="btn small" aria-pressed={urgent} onClick={() => setUrgent(!urgent)}>{urgent ? "Newest first" : "Urgent first"}</button>
          <button className="btn small" onClick={markAll}>Mark all read</button>
        </div>
      </div>
      {game.inbox.length === 0 && <p className="muted">No messages yet.</p>}
      <div>
        {list.map((m) => (
          <article key={m.id} className={`inbox-item ${m.read ? "" : "unread"}`}>
            <button className="head" onClick={() => toggle(m.id)} aria-expanded={open === m.id}>
              {!m.read && <span className="dot" aria-label="Unread" />}
              <span className="muted num">{shortDate(m.date)}</span>
              <span className="subject">{(m.priority ?? 1) >= 3 && !m.read ? "Urgent: " : ""}{m.title}</span>
              <span className="muted">{m.from}</span>
            </button>
            {open === m.id && <p className="body">{m.body}</p>}
            {open === m.id && m.gameId && game.results[m.gameId] && <div><button className="btn small" onClick={() => ui.openBox(m.gameId!)}>Box score</button></div>}
          </article>
        ))}
      </div>
    </section>
  );
}

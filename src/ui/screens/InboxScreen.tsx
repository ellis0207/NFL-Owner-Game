import { useState } from "react";
import { shortDate } from "../../engine/dates";
import type { GameState } from "../../engine/types";

export function InboxScreen({ game, changed }: { game: GameState; changed: () => void }) {
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
        <button className="btn small" onClick={markAll}>Mark all read</button>
      </div>
      {game.inbox.length === 0 && <p className="muted">No messages yet.</p>}
      <div>
        {game.inbox.map((m) => (
          <article key={m.id} className={`inbox-item ${m.read ? "" : "unread"}`}>
            <button className="head" onClick={() => toggle(m.id)} aria-expanded={open === m.id}>
              {!m.read && <span className="dot" aria-label="Unread" />}
              <span className="muted num">{shortDate(m.date)}</span>
              <span className="subject">{m.title}</span>
              <span className="muted">{m.from}</span>
            </button>
            {open === m.id && <p className="body">{m.body}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

import { useState } from "react";
import { SCHEDULE } from "../../engine/league";
import { gameTypeLabel } from "../../engine/season";
import type { GameState, ScheduledGame } from "../../engine/types";
import { Score } from "../Score";

const groupKey = (g: ScheduledGame) => (g.type === "POST" ? `POST-${g.round}` : `${g.type}-${g.week}`);

export function LeagueScreen({ game }: { game: GameState }) {
  const groups: { key: string; label: string; games: ScheduledGame[] }[] = [];
  for (const g of SCHEDULE) {
    const key = groupKey(g);
    let group = groups.find((x) => x.key === key);
    if (!group) groups.push((group = { key, label: g.type === "PRE" && g.week === 0 ? "HOF" : g.type === "PRE" ? `P${g.week}` : g.type === "REG" ? `${g.week}` : g.round!, games: [] }));
    group.games.push(g);
  }
  const current = groups.find((gr) => gr.games.some((g) => g.date >= game.date)) ?? groups[groups.length - 1];
  const [key, setKey] = useState(current.key);
  const shown = groups.find((g) => g.key === key)!;
  return (
    <section className="stack">
      <h2>League scoreboard</h2>
      <div className="tabs" role="group" aria-label="Week">
        {groups.map((g) => <button key={g.key} aria-pressed={g.key === key} onClick={() => setKey(g.key)}>{g.label}</button>)}
      </div>
      <h3>{gameTypeLabel(shown.games[0])}</h3>
      <div className="scores">{shown.games.map((g) => <Score key={g.id} game={game} id={g.id} />)}</div>
      {shown.games.every((g) => !g.away && !game.playoffTeams[g.id]) && <p className="muted">Matchups are set when the previous round ends.</p>}
    </section>
  );
}

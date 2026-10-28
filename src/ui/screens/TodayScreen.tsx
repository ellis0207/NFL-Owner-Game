import { addDays, shortDate } from "../../engine/dates";
import { GAMES_BY_DATE, SCHEDULE, teamLabel } from "../../engine/league";
import { injuryStatus } from "../../engine/injuries";
import { PLAYER_BY_ID } from "../../engine/league";
import { teamPlayerIds } from "../../engine/cap";
import { agenda, isSeasonOver } from "../../engine/season";
import { publicPulse } from "../../engine/negotiation";
import { useUi } from "../ui";
import { matchup } from "../../engine/standings";
import type { GameState } from "../../engine/types";
import type { Screen } from "../GameShell";
import { Score } from "../Score";

const KIND_LABEL = { game: "Game day", practice: "Practice", meeting: "Meeting", off: "Off", league: "League", travel: "Travel" };

export function TodayScreen({ game, go }: { game: GameState; go: (s: Screen) => void }) {
  const ui = useUi();
  const items = agenda(game);
  const yesterday = addDays(game.date, -1);
  const played = (GAMES_BY_DATE[yesterday] ?? []).filter((g) => game.results[g.id]);
  const todays = (GAMES_BY_DATE[game.date] ?? []).filter((g) => matchup(game, g));
  const unread = game.inbox.filter((i) => !i.read).slice(0, 3);
  const next = SCHEDULE.find((g) => g.date >= game.date && !game.results[g.id] && (() => {
    const m = matchup(game, g);
    return m && (m.home === game.userTeam || m.away === game.userTeam);
  })());

  return (
    <>
      {isSeasonOver(game) && game.champion && (
        <section className="panel champion">
          <span className="label">Super Bowl LXI champion</span>
          <span className="big">{teamLabel(game.champion)}</span>
          <p className="muted">The 2026 season is complete. The offseason (free agency, the draft and new contracts) is coming in a later update.</p>
        </section>
      )}
      <section className="panel stack">
        <h2>Today</h2>
        <div className="agenda">
          {items.length === 0 && <p className="muted">Nothing on the calendar.</p>}
          {items.map((a, i) => (
            <div key={i} className="agenda-item">
              <span className={`kind ${a.kind}`}>{KIND_LABEL[a.kind]}</span>
              <div><strong>{a.title}</strong>{a.detail && <div className="muted">{a.detail}</div>}</div>
            </div>
          ))}
        </div>
        {next && !items.some((a) => a.kind === "game") && (
          <p className="muted">Next game: {shortDate(next.date)}, {(() => {
            const m = matchup(game, next)!;
            return m.home === game.userTeam ? `vs ${teamLabel(m.away)}` : `at ${teamLabel(m.home)}`;
          })()}.</p>
        )}
      </section>
      {next && (() => {
        const report = teamPlayerIds(game, game.userTeam)
          .filter((id) => game.players[id].status === "active" || game.players[id].status === "camp")
          .map((id) => [id, injuryStatus(game, id, next.date)] as const)
          .filter(([, st]) => st);
        if (!report.length) return null;
        return (
          <section className="panel stack tight">
            <h2>Injury report</h2>
            <span className="muted">For {shortDate(next.date)}</span>
            {report.map(([id, st]) => (
              <div key={id}>
                <span className={st === "Out" ? "bad" : "warn"}>{st}</span>{" "}
                <button className="link" onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id].name}</button>{" "}
                <span className="muted">{PLAYER_BY_ID[id].position} · {game.players[id].injury!.type}</span>
              </div>
            ))}
          </section>
        );
      })()}
      {(() => {
        const ours = Object.values(game.negotiations).filter((n) => n.team === game.userTeam && n.status === "open");
        const waiting = ours.filter((n) => n.handler === "owner" && !n.pending);
        const holdouts = teamPlayerIds(game, game.userTeam).filter((id) => game.players[id].holdout);
        const pulse = publicPulse(game);
        return (
          <section className="panel stack tight">
            <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h2>Contracts</h2>
              <button className="btn small" onClick={() => go("Contracts")}>Open contracts</button>
            </div>
            {waiting.map((n) => (
              <div key={n.player}>
                <span className="warn">Our move</span>{" "}
                <button className="link" onClick={() => ui.openTalks(n.player)}>{PLAYER_BY_ID[n.player].name}</button>
                <span className="muted"> · the agent answered on {shortDate(n.rounds[n.rounds.length - 1].date)}</span>
              </div>
            ))}
            {ours.length > waiting.length && <span className="muted">{ours.length - waiting.length} other talks waiting on the other side or handled by the GM.</span>}
            {holdouts.map((id) => (
              <div key={id}>
                <span className="bad">{game.players[id].holdout!.kind === "holdout" ? "Holding out" : "Holding in"}</span>{" "}
                <button className="link" onClick={() => ui.openTalks(id)}>{PLAYER_BY_ID[id].name}</button>
              </div>
            ))}
            <span className="muted">{pulse.fans} {pulse.media}</span>
          </section>
        );
      })()}
      {unread.length > 0 && (
        <section className="panel stack">
          <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <h2>New in your inbox</h2>
            <button className="btn small" onClick={() => go("Inbox")}>Open inbox</button>
          </div>
          {unread.map((m) => (
            <div key={m.id}><strong>{m.title}</strong> <span className="muted">· {m.from}</span></div>
          ))}
        </section>
      )}
      {todays.length > 0 && (
        <section className="stack">
          <h3>Today's games</h3>
          <div className="scores">{todays.map((g) => <Score key={g.id} game={game} id={g.id} />)}</div>
        </section>
      )}
      {played.length > 0 && (
        <section className="stack">
          <h3>Yesterday's scores</h3>
          <div className="scores">{played.map((g) => <Score key={g.id} game={game} id={g.id} />)}</div>
        </section>
      )}
      {game.news.length > 0 && (
        <section className="panel stack">
          <h2>Around the league</h2>
          {game.news.slice(0, 8).map((n, i) => <div key={i}><span className="muted">{shortDate(n.date)}</span> · {n.text}</div>)}
        </section>
      )}
    </>
  );
}

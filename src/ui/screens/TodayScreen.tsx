import { addDays, shortDate } from "../../engine/dates";
import { GAMES_BY_DATE, SCHEDULE, teamLabel } from "../../engine/league";
import { injuryStatus } from "../../engine/injuries";
import { PLAYER_BY_ID } from "../../engine/league";
import { teamPlayerIds } from "../../engine/cap";
import { agenda, eventOutcome, isGameOver, isSeasonOver, upcomingKeyDates, type AgendaItem } from "../../engine/season";
import { publicPulse } from "../../engine/negotiation";
import { useUi } from "../ui";
import { matchup } from "../../engine/standings";
import type { GameState } from "../../engine/types";
import type { Screen } from "../GameShell";
import { Score } from "../Score";
import { gamesOn, latestPoll } from "../../engine/college";
import { budgetLeft, weeklyCost } from "../../engine/scouting";
import { money } from "../format";
import { CollegeScore } from "./CollegeScreen";
import { openQuestions } from "../../engine/press";
import { MEDIA_BY_ID } from "../../engine/outlets";
import { StoryCard } from "./MediaScreen";
import { business, cashBalance, gateForecast } from "../../engine/business";
import { fanMood } from "./BusinessScreen";

const KIND_LABEL = { game: "Game day", practice: "Practice", meeting: "Meeting", off: "Off", league: "League", travel: "Travel", draft: "Draft" };
const ACTION_LABEL: Record<NonNullable<AgendaItem["action"]>, string> = {
  game: "Simulate game", practice: "Run practice", meeting: "Hold meeting", review: "Review the 53", draft: "Go to the draft room",
};

interface Props {
  game: GameState;
  go: (s: Screen) => void;
  busy: boolean;
  /** Plays out one of today's events. */
  play: (id: string) => void;
}

export function TodayScreen({ game, go, busy, play }: Props) {
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
          <p className="muted">
            {isGameOver(game)
              ? "The draft is done and the rookies are in. This is as far as the game goes for now; your save keeps everything until the next update."
              : "The 2026 season is complete. The offseason runs through the draft: re-sign or tag our own free agents, chase other teams' players once free agency opens, then run the draft at the end of April."}
          </p>
        </section>
      )}
      {isSeasonOver(game) && !isGameOver(game) && (
        <section className="panel stack tight">
          <h2>Coming up</h2>
          {upcomingKeyDates(game).map((d) => (
            <div key={d.date + d.label}><strong>{shortDate(d.date)}</strong> <span className="muted">{d.label}</span></div>
          ))}
        </section>
      )}
      <section className="panel stack">
        <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h2>Today</h2>
          <button className="btn small" onClick={() => go("Calendar")}>Open calendar</button>
        </div>
        <div className="agenda">
          {items.length === 0 && <p className="muted">Nothing on the calendar.</p>}
          {items.map((a) => {
            const outcome = eventOutcome(game, a.id);
            const done = outcome !== undefined;
            return (
              <div key={a.id} className={`agenda-item${a.action ? " event" : ""}${done ? " done" : ""}`}>
                <span className={`kind ${a.kind}`}>{KIND_LABEL[a.kind]}</span>
                <div>
                  <strong>{a.title}</strong>{a.detail && <div className="muted">{a.detail}</div>}
                  {done && <div className="outcome">{outcome}</div>}
                  {!a.action && a.kind === "league" && <div className="muted">Happens when the day ends.</div>}
                </div>
                {a.action && !done && (
                  <button className={`btn small${a.action === "game" || a.action === "draft" ? " primary" : ""}`} disabled={busy || isGameOver(game)}
                    onClick={() => { if (a.action === "draft") return go("Draft"); play(a.id); if (a.action === "review") go("Roster"); }}>
                    {ACTION_LABEL[a.action]}
                  </button>
                )}
                {done && a.gameId && game.box[a.gameId] && (
                  <button className="btn small" onClick={() => ui.openBox(a.gameId!)}>Box score</button>
                )}
              </div>
            );
          })}
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
      <BusinessToday game={game} go={go} />
      <MediaToday game={game} go={go} />
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
      <CollegeToday game={game} go={go} />
      {game.news.length > 0 && (
        <section className="panel stack">
          <h2>Around the league</h2>
          {game.news.slice(0, 8).map((n, i) => <div key={i}><span className="muted">{shortDate(n.date)}</span> · {n.text}</div>)}
        </section>
      )}
    </>
  );
}

/** Requests for comment, and this morning's headlines. */
function MediaToday({ game, go }: { game: GameState; go: (s: Screen) => void }) {
  const asks = openQuestions(game);
  const stories = game.media?.stories ?? [];
  const latest = stories[0]?.date;
  // Our team first, then the biggest league stories.
  const today = latest ? stories.filter((s) => s.date >= addDays(latest, -1)) : [];
  const rank = (k: string) => ["owner", "trade", "signing", "rumor", "leak", "injury", "draft", "recap"].indexOf(k);
  const top = [...today].sort((a, b) => Number(b.teams?.includes(game.userTeam) ?? 0) - Number(a.teams?.includes(game.userTeam) ?? 0) || (rank(a.kind) < 0 ? 99 : rank(a.kind)) - (rank(b.kind) < 0 ? 99 : rank(b.kind))).slice(0, 5);
  if (!asks.length && !top.length) return null;
  return (
    <section className="panel stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Media</h2>
        <button className="btn small" onClick={() => go("Media")}>Open media</button>
      </div>
      {asks.map((q) => (
        <div key={q.id}>
          <span className="warn">Request for comment</span>{" "}
          <button className="link" onClick={() => go("Media")}>{q.question}</button>
          <span className="muted"> · {MEDIA_BY_ID[q.outlet]?.name}, by {shortDate(q.expires)}</span>
        </div>
      ))}
      {top.length > 0 && <span className="label">In the news</span>}
      {top.map((s) => <StoryCard key={s.id} game={game} s={s} compact />)}
    </section>
  );
}

/** Saturday's top college games and the scouting budget, at a glance. */
function CollegeToday({ game, go }: { game: GameState; go: (s: Screen) => void }) {
  if (!game.college) return null;
  const poll = latestPoll(game, "ap");
  const ranked = (ids: string[]) => !!poll && ids.some((t) => poll.ranks.slice(0, 25).includes(t));
  let shown = gamesOn(game, game.date).filter((g) => ranked([g.away, g.home]) || g.kind);
  let label = "College games today";
  if (!shown.length) {
    for (let i = 1; i <= 6 && !shown.length; i++) {
      shown = gamesOn(game, addDays(game.date, -i)).filter((g) => game.college!.results[g.id] && (ranked([g.away, g.home]) || g.kind));
      label = "Latest college scores";
    }
  }
  const s = game.college.scouting;
  return (
    <section className="panel stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>College football</h2>
        <div className="btn-row">
          <button className="btn small" onClick={() => go("College")}>Open college</button>
          <button className="btn small" onClick={() => go("Scouting")}>Open scouting</button>
        </div>
      </div>
      <span className="muted">
        {s.plan.length ? `${s.plan.length} scouting assignment${s.plan.length === 1 ? "" : "s"} this week (${money(weeklyCost(game))}); ` : "No scouting assignments this week; "}
        {money(budgetLeft(game))} of the scouting budget left.
      </span>
      {shown.length > 0 && (
        <>
          <strong>{label}</strong>
          <div className="scores">{shown.slice(0, 8).map((g) => <CollegeScore key={g.id} game={game} g={g} />)}</div>
        </>
      )}
    </section>
  );
}

/** Cash, the next home gate and booking requests. */
function BusinessToday({ game, go }: { game: GameState; go: (s: Screen) => void }) {
  const b = business(game);
  const us = game.userTeam;
  const offers = b.events.filter((e) => e.status === "offered");
  const today = b.events.filter((e) => e.date === game.date && e.status === "booked");
  const next = SCHEDULE.find((g) => g.home === us && !g.neutral && (g.type === "PRE" || g.type === "REG") && g.date >= game.date && !game.results[g.id]);
  const f = next && next.date <= addDays(game.date, 7) ? gateForecast(game, next) : null;
  return (
    <section className="panel stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Business</h2>
        <button className="btn small" onClick={() => go("Business")}>Open business</button>
      </div>
      <span className="muted">Cash: {money(cashBalance(game))}. {fanMood(game.pressure.fans)}</span>
      {today.map((e) => <div key={e.id}><span className="good">At the stadium today</span> {e.name}</div>)}
      {f && next && (
        <div>
          <span className="label">Next home game</span>{" "}
          {shortDate(next.date)} vs {teamLabel(next.home === us ? next.away! : next.home!)}: about {Math.min(100, Math.round((f.sold / f.capacity) * 100))}% sold
          {f.heat >= 1.15 ? ", and resale prices are above face value." : f.heat < 0.95 ? ", with seats still available." : "."}
        </div>
      )}
      {offers.map((e) => (
        <div key={e.id}>
          <span className="warn">Booking request</span>{" "}
          <button className="link" onClick={() => go("Business")}>{e.name}</button>
          <span className="muted"> · {shortDate(e.date)}, answer by {shortDate(e.expires!)}</span>
        </div>
      ))}
    </section>
  );
}

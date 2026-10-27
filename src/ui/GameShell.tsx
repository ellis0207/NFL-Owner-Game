import { useState } from "react";
import { capSummary } from "../engine/cap";
import { longDate } from "../engine/dates";
import { RULES, SCHEDULE, TEAM_BY_ID } from "../engine/league";
import { rosterCount } from "../engine/roster";
import { advanceDay, isSeasonOver, simToNextGame } from "../engine/season";
import { standings } from "../engine/standings";
import type { GameState } from "../engine/types";
import { money } from "./format";
import { CapScreen } from "./screens/CapScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { LeagueScreen } from "./screens/LeagueScreen";
import { RosterScreen } from "./screens/RosterScreen";
import { SaveScreen } from "./screens/SaveScreen";
import { ScheduleScreen } from "./screens/ScheduleScreen";
import { StandingsScreen } from "./screens/StandingsScreen";
import { TodayScreen } from "./screens/TodayScreen";

const SCREENS = ["Today", "Inbox", "Schedule", "Standings", "Roster", "Cap", "League", "Save"] as const;
export type Screen = (typeof SCREENS)[number];

export function phaseLabel(state: GameState): string {
  const d = state.date;
  const k = RULES.keyDates;
  if (isSeasonOver(state)) return "Season complete";
  if (d > k.regularSeasonEnd) return "Playoffs";
  if (d >= k.regularSeasonStart) {
    const next = SCHEDULE.find((g) => g.type === "REG" && g.date >= d);
    return next ? `Regular season · Week ${next.week}` : "Regular season";
  }
  if (d > k.rosterCutdown) return "Final week before the opener";
  const pre = SCHEDULE.find((g) => g.type === "PRE" && g.date >= d);
  if (d >= k.hallOfFameGame && pre) return `Preseason · Week ${pre.week}`;
  return "Training camp";
}

interface Props {
  game: GameState;
  tick: number;
  changed: () => void;
  onLoad: (s: GameState) => void;
  onQuit: () => void;
}

export function GameShell({ game, changed, onLoad, onQuit }: Props) {
  const [screen, setScreen] = useState<Screen>("Today");
  const [busy, setBusy] = useState(false);
  const team = TEAM_BY_ID[game.userTeam];
  const cap = capSummary(game, game.userTeam);
  const rec = standings(game)[game.userTeam];
  const counts = rosterCount(game, game.userTeam);
  const unread = game.inbox.filter((i) => !i.read).length;
  const over = isSeasonOver(game);

  function step(fn: (s: GameState) => void) {
    setBusy(true);
    // Let the button state paint before the simulation runs.
    window.setTimeout(() => {
      fn(game);
      changed();
      setBusy(false);
    }, 0);
  }

  return (
    <div className="shell">
      <aside className="side">
        <div>
          <div className="team-city">{team.city}</div>
          <div className="team-name">{team.name}</div>
        </div>
        <nav aria-label="Front office">
          {SCREENS.map((s) => (
            <button key={s} aria-current={screen === s ? "page" : undefined} onClick={() => setScreen(s)}>
              {s}
              {s === "Inbox" && unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
        </nav>
        <div className="owner">Owner: {game.ownerName}</div>
      </aside>
      <div className="main">
        <header className="scoreboard">
          <div className="clock">
            <span className="day">{longDate(game.date).replace(/, \d{4}$/, "")}</span>
            <span className="phase">{phaseLabel(game)}</span>
          </div>
          <div className="figures">
            <div className="figure"><span className="label">Record</span><strong>{rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ""}</strong></div>
            <div className="figure"><span className="label">Roster</span><strong>{counts.roster}{counts.ps ? ` + ${counts.ps} PS` : ""}</strong></div>
            <div className="figure">
              <span className="label">Cap space</span>
              <strong className={cap.space < 0 && game.settings.capRules === "real" ? "bad" : undefined}>
                {game.settings.capRules === "off" ? "No cap" : money(cap.space)}
              </strong>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={busy || over} onClick={() => step(advanceDay)}>Next day</button>
            <button className="btn" disabled={busy || over} onClick={() => step(simToNextGame)}>Play to next game</button>
          </div>
        </header>
        <main className="content">
          {screen === "Today" && <TodayScreen game={game} go={setScreen} />}
          {screen === "Inbox" && <InboxScreen game={game} changed={changed} />}
          {screen === "Schedule" && <ScheduleScreen game={game} />}
          {screen === "Standings" && <StandingsScreen game={game} />}
          {screen === "Roster" && <RosterScreen game={game} changed={changed} />}
          {screen === "Cap" && <CapScreen game={game} />}
          {screen === "League" && <LeagueScreen game={game} />}
          {screen === "Save" && <SaveScreen game={game} onLoad={onLoad} onQuit={onQuit} />}
        </main>
      </div>
    </div>
  );
}

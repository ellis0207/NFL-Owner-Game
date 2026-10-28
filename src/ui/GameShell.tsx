import { useCallback, useMemo, useState } from "react";
import { capSummary } from "../engine/cap";
import { longDate } from "../engine/dates";
import { RULES, SCHEDULE, TEAM_BY_ID } from "../engine/league";
import { rosterCount } from "../engine/roster";
import { advanceDay, advanceToNextEvent, isGameOver, isSeasonOver, simToNextGame } from "../engine/season";
import { standings } from "../engine/standings";
import type { GameState } from "../engine/types";
import { BoxScore } from "./BoxScore";
import { money } from "./format";
import { PlayerPanel } from "./PlayerPanel";
import { NegotiationPanel } from "./NegotiationPanel";
import { CapScreen } from "./screens/CapScreen";
import { ContractsScreen } from "./screens/ContractsScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { LeagueScreen } from "./screens/LeagueScreen";
import { RosterScreen } from "./screens/RosterScreen";
import { FreeAgentsScreen } from "./screens/FreeAgentsScreen";
import { SaveScreen } from "./screens/SaveScreen";
import { ScheduleScreen } from "./screens/ScheduleScreen";
import { StaffScreen } from "./screens/StaffScreen";
import { StandingsScreen } from "./screens/StandingsScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { UiContext } from "./ui";

const SCREENS = ["Today", "Inbox", "Schedule", "Standings", "Roster", "Free agents", "Stats", "Contracts", "Staff", "Cap", "League", "Save"] as const;
export type Screen = (typeof SCREENS)[number];

export function phaseLabel(state: GameState): string {
  const d = state.date;
  const k = RULES.keyDates;
  if (isGameOver(state)) return "Draft day";
  if (d >= k.newLeagueYear) return `Free agency · ${d.slice(0, 4)} league year`;
  if (d >= k.negotiatingWindowOpens) return "Negotiating window";
  if (d >= k.franchiseTagWindowOpens && d <= k.franchiseTagDeadline) return "Offseason · tag window";
  if (isSeasonOver(state)) return "Offseason";
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
  const [box, setBox] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const openBox = useCallback((id: string) => { setPlayer(null); setBox(id); }, []);
  const [talks, setTalks] = useState<string | null>(null);
  const openPlayer = useCallback((id: string) => { setTalks(null); setPlayer(id); }, []);
  const openTalks = useCallback((id: string) => { setPlayer(null); setTalks(id); }, []);
  const ui = useMemo(() => ({ openBox, openPlayer, openTalks }), [openBox, openPlayer, openTalks]);
  const team = TEAM_BY_ID[game.userTeam];
  // After the Super Bowl the cap that matters is next year's.
  const capYear = isSeasonOver(game) ? RULES.season + 1 : undefined;
  const cap = capSummary(game, game.userTeam, capYear);
  const rec = standings(game)[game.userTeam];
  const counts = rosterCount(game, game.userTeam);
  const unread = game.inbox.filter((i) => !i.read).length;
  const over = isGameOver(game);
  const offseason = isSeasonOver(game);

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
    <UiContext.Provider value={ui}>
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
            <div className="figure"><span className="label">{isSeasonOver(game) ? `${RULES.season} record` : "Record"}</span><strong>{rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ""}</strong></div>
            <div className="figure"><span className="label">Roster</span><strong>{counts.roster}{counts.ps ? ` + ${counts.ps} PS` : ""}{counts.ir ? ` · ${counts.ir} IR` : ""}</strong></div>
            <div className="figure">
              <span className="label">{capYear ? `${capYear} cap space` : "Cap space"}</span>
              <strong className={cap.space < 0 && game.settings.capRules === "real" ? "bad" : undefined}>
                {game.settings.capRules === "off" ? "No cap" : money(cap.space)}
              </strong>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={busy || over} onClick={() => step(advanceDay)}>Next day</button>
            {offseason
              ? <button className="btn" disabled={busy || over} onClick={() => step(advanceToNextEvent)}>Advance to next event</button>
              : <button className="btn" disabled={busy || over} onClick={() => step(simToNextGame)}>Play to next game</button>}
          </div>
        </header>
        <main className="content">
          {screen === "Today" && <TodayScreen game={game} go={setScreen} />}
          {screen === "Stats" && <StatsScreen game={game} />}
          {screen === "Contracts" && <ContractsScreen game={game} changed={changed} />}
          {screen === "Staff" && <StaffScreen game={game} />}
          {screen === "Inbox" && <InboxScreen game={game} changed={changed} />}
          {screen === "Schedule" && <ScheduleScreen game={game} />}
          {screen === "Standings" && <StandingsScreen game={game} />}
          {screen === "Roster" && <RosterScreen game={game} changed={changed} />}
          {screen === "Free agents" && <FreeAgentsScreen game={game} changed={changed} />}
          {screen === "Cap" && <CapScreen game={game} />}
          {screen === "League" && <LeagueScreen game={game} />}
          {screen === "Save" && <SaveScreen game={game} onLoad={onLoad} onQuit={onQuit} />}
        </main>
      </div>
      {box && <BoxScore game={game} id={box} onClose={() => setBox(null)} />}
      {player && <PlayerPanel game={game} id={player} onClose={() => setPlayer(null)} changed={changed} />}
      {talks && <NegotiationPanel game={game} id={talks} onClose={() => setTalks(null)} changed={changed} />}
    </div>
    </UiContext.Provider>
  );
}

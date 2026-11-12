import { useCallback, useEffect, useMemo, useState } from "react";
import { capSummary } from "../engine/cap";
import { addDays, longDate } from "../engine/dates";
import { RULES, SCHEDULE, TEAM_BY_ID } from "../engine/league";
import { rosterCount } from "../engine/roster";
import { advanceDay, advanceToNextEvent, draftWaiting, isGameOver, isSeasonOver, isSummer, pendingEvents, playEvent, simToNextGame, simWeek } from "../engine/season";
import { draftDayOf, onTheClock } from "../engine/draft";
import { DraftScreen } from "./screens/DraftScreen";
import { standings } from "../engine/standings";
import type { GameState } from "../engine/types";
import { BoxScore } from "./BoxScore";
import { money } from "./format";
import { PlayerPanel } from "./PlayerPanel";
import { NegotiationPanel } from "./NegotiationPanel";
import { CalendarScreen } from "./screens/CalendarScreen";
import { CampScreen } from "./screens/CampScreen";
import { CollegeScreen } from "./screens/CollegeScreen";
import { ScoutingScreen } from "./screens/ScoutingScreen";
import { ProspectPanel } from "./ProspectPanel";
import { SchoolPanel } from "./SchoolPanel";
import { CapScreen } from "./screens/CapScreen";
import { BusinessScreen } from "./screens/BusinessScreen";
import { ContractsScreen } from "./screens/ContractsScreen";
import { InboxScreen } from "./screens/InboxScreen";
import { MediaScreen } from "./screens/MediaScreen";
import { openQuestions } from "../engine/press";
import { LeagueScreen } from "./screens/LeagueScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { OwnersScreen } from "./screens/OwnersScreen";
import { OwnerScreen } from "./screens/OwnerScreen";
import { OwnershipScreen } from "./screens/OwnershipScreen";
import { FrontOfficeScreen } from "./screens/FrontOfficeScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { ClubhouseScreen } from "./screens/ClubhouseScreen";
import { GameWeekScreen } from "./screens/GameWeekScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { GuideScreen } from "./screens/GuideScreen";
import { SearchBox } from "./Search";
import { applyPrefs, readPrefs, writePrefs } from "./prefs";
import { RosterScreen } from "./screens/RosterScreen";
import { FreeAgentsScreen } from "./screens/FreeAgentsScreen";
import { SaveScreen } from "./screens/SaveScreen";
import { ScheduleScreen } from "./screens/ScheduleScreen";
import { StaffScreen } from "./screens/StaffScreen";
import { StandingsScreen } from "./screens/StandingsScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { TradesScreen, type TradeStart } from "./screens/TradesScreen";
import { FootballScreen } from "./screens/FootballScreen";
import { AgreementsScreen } from "./screens/AgreementsScreen";
import { LegalScreen } from "./screens/LegalScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { UiContext } from "./ui";
import { inControl, tenure } from "../engine/takeover";
import { GameOver } from "./screens/OwnershipSuccession";
import { NAV, PAGE_HINT, groupOf, pageLabel, type Screen } from "./nav";

export type { Screen } from "./nav";

/** Pages a buyer or minority partner can still act on: their own money, deals and the game itself. */
const FREE_PAGES: Screen[] = ["Today", "Calendar", "Inbox", "Owner", "Ownership", "Guide", "Settings", "Save", "History", "League", "Standings", "Schedule", "Stats"];

/** Stop action buttons and form changes on a read-only page; tabs and links still work. */
function blockAction(e: { target: EventTarget; stopPropagation: () => void; preventDefault: () => void }): void {
  const el = e.target as HTMLElement;
  if (el.closest(".tabs, .section-pages, [data-view]")) return;
  if (el.closest("button.btn, input, select, textarea")) { e.stopPropagation(); e.preventDefault(); }
}

export function phaseLabel(state: GameState): string {
  const d = state.date;
  const k = RULES.keyDates;
  if (draftDayOf(d)) return `NFL Draft · Day ${draftDayOf(d)}`;
  if (d >= k.newLeagueYear) return `Free agency · ${d.slice(0, 4)} league year`;
  if (d >= k.negotiatingWindowOpens) return "Negotiating window";
  if (d >= k.franchiseTagWindowOpens && d <= k.franchiseTagDeadline) return "Offseason · tag window";
  if (isSeasonOver(state)) return "Offseason";
  if (isSummer(state)) return d < addDays(k.minicampStart, 3) ? `Offseason program · ${RULES.season}` : "Summer break";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [closed, setClosed] = useState<string[]>(() => readPrefs().navClosed);
  const toggleGroup = (id: string) => {
    const next = closed.includes(id) ? closed.filter((c) => c !== id) : [...closed, id];
    setClosed(next);
    writePrefs({ ...readPrefs(), navClosed: next });
  };
  // Changing pages closes the phone menu and starts the new page at the top.
  const go = useCallback((s: Screen) => {
    setScreen(s);
    setMenuOpen(false);
    window.scrollTo?.(0, 0);
  }, []);
  // Text size and contrast are this browser's preferences.
  useEffect(() => applyPrefs(), []);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [player, setPlayer] = useState<string | null>(null);
  const openBox = useCallback((id: string, live = false) => { setPlayer(null); setFollow(live); setBox(id); }, []);
  const [talks, setTalks] = useState<string | null>(null);
  const openPlayer = useCallback((id: string) => { setTalks(null); setPlayer(id); }, []);
  const openTalks = useCallback((id: string) => { setPlayer(null); setTalks(id); }, []);
  const [tradeStart, setTradeStart] = useState<TradeStart | null>(null);
  const openTrade = useCallback((id: string) => { setPlayer(null); setTradeStart({ player: id }); go("Trades"); }, []);
  const [prospect, setProspect] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);
  const openProspect = useCallback((id: string) => { setSchool(null); setProspect(id); }, []);
  const openSchool = useCallback((id: string) => { setProspect(null); setSchool(id); }, []);
  const ui = useMemo(() => ({ openBox, openPlayer, openTalks, openTrade, openProspect, openSchool }), [openBox, openPlayer, openTalks, openTrade, openProspect, openSchool]);
  const team = TEAM_BY_ID[game.userTeam];
  // After the Super Bowl the cap that matters is next year's.
  const capYear = isSeasonOver(game) ? RULES.season + 1 : undefined;
  const cap = capSummary(game, game.userTeam, capYear);
  const summer = isSummer(game);
  // In the summer the record that means anything is last season's.
  const last = summer ? game.history?.seasons.at(-1) : undefined;
  const now = standings(game)[game.userTeam];
  const rec = last ? { w: last.records[game.userTeam][0], l: last.records[game.userTeam][1], t: last.records[game.userTeam][2] } : now;
  const counts = rosterCount(game, game.userTeam);
  const unread = game.inbox.filter((i) => !i.read).length;
  const pressAsks = openQuestions(game).length;
  const tradeOffers = game.trades?.offers.filter((o) => o.status === "open").length ?? 0;
  const bookings = game.business?.events.filter((e) => e.status === "offered").length ?? 0;
  const memos = game.office?.memos.filter((m) => m.status === "open").length ?? 0;
  const over = isGameOver(game);
  const offseason = isSeasonOver(game) || summer;
  const left = pendingEvents(game).length;
  const waiting = draftWaiting(game);
  // Counts beside page names: things that are waiting on the owner.
  const badges: Partial<Record<Screen, number | string>> = {};
  if (unread) badges.Inbox = unread;
  if (pressAsks) badges.Media = pressAsks;
  if (tradeOffers) badges.Trades = tradeOffers;
  if (bookings) badges.Business = bookings;
  if (memos) badges["Front office"] = memos;
  if (onTheClock(game)) badges.Draft = "On the clock";
  const attention = unread + pressAsks + tradeOffers + bookings + memos + (badges.Draft ? 1 : 0);
  const group = groupOf(screen);
  // A buyer or minority partner can look at every page but act only on their own.
  const locked = !inControl(game) && !FREE_PAGES.includes(screen);

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
      <aside className={`side${menuOpen ? " open" : ""}`}>
        <div className="side-team">
          <div>
            <div className="team-city">{team.city}</div>
            <div className="team-name">{team.name}</div>
          </div>
          <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-nav" onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? "Close" : "Menu"}{!menuOpen && attention > 0 && <span className="badge">{attention}</span>}
          </button>
        </div>
        <div className="side-body" id="main-nav">
          <SearchBox game={game} go={go} />
          <nav aria-label="Front office">
            {NAV.map((g) => {
              const shut = closed.includes(g.id) && !(g.pages as readonly Screen[]).includes(screen);
              const waiting = (g.pages as readonly Screen[]).reduce((n, p) => n + (typeof badges[p] === "number" ? (badges[p] as number) : badges[p] ? 1 : 0), 0);
              return (
                <div key={g.id} className="nav-group">
                  <button className="nav-head" aria-expanded={!shut} onClick={() => toggleGroup(g.id)}>
                    <span>{g.label}</span>
                    {shut && waiting > 0 ? <span className="badge">{waiting}</span> : <span className="chev" aria-hidden="true" />}
                  </button>
                  {!shut && (g.pages as readonly Screen[]).map((s) => (
                    <button key={s} className="nav-item" aria-current={screen === s ? "page" : undefined} onClick={() => go(s)}>
                      <span>{pageLabel(s)}</span>
                      {badges[s] !== undefined && <span className="badge">{badges[s]}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="owner">Owner: {game.ownerName}</div>
        </div>
      </aside>
      <div className="main">
        {game.sandbox && <div className="sandbox-banner" role="note">Sandbox game: unlimited money and no cap; results here are kept apart from realism games.</div>}
        <header className="scoreboard">
          <div className="clock">
            <span className="day">{longDate(game.date).replace(/, \d{4}$/, "")}</span>
            <span className="phase">{phaseLabel(game)}</span>
          </div>
          <div className="figures">
            <div className="figure"><span className="label">{last ? `${last.season} record` : isSeasonOver(game) ? `${RULES.season} record` : "Record"}</span><strong>{rec.w}-{rec.l}{rec.t ? `-${rec.t}` : ""}</strong></div>
            <div className="figure"><span className="label">Roster</span><strong>{counts.roster}{counts.ps ? ` + ${counts.ps} PS` : ""}{counts.ir ? ` · ${counts.ir} IR` : ""}</strong></div>
            <div className="figure">
              <span className="label">{capYear ? `${capYear} cap space` : "Cap space"}</span>
              <strong className={cap.space < 0 && game.settings.capRules === "real" ? "bad" : undefined}>
                {game.settings.capRules === "off" ? "No cap" : money(cap.space)}
              </strong>
            </div>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={busy || over} onClick={() => step(advanceDay)}
              title={left ? "Your staff handles whatever is left today, then the clock moves to tomorrow." : undefined}>
              {left ? `Sim rest of day (${left})` : "Next day"}
            </button>
            {offseason
              ? <button className="btn" disabled={busy || over || waiting} onClick={() => step(advanceToNextEvent)}
                title={waiting ? "The draft is on: run it from the draft room, or use Sim rest of day to let the GM finish today's rounds." : undefined}>Advance to next event</button>
              : <button className="btn" disabled={busy || over} onClick={() => step(simToNextGame)}>Sim to game day</button>}
            <button className="btn" disabled={busy || over || waiting} onClick={() => step(simWeek)} title="Seven days, stopping for the draft or (if you turned pauses on in Settings) anything urgent.">Sim a week</button>
          </div>
        </header>
        <main className="content">
          <div className="page-head">
            <span className="crumb">{group.label}<span aria-hidden="true"> / </span>{pageLabel(screen)}</span>
            <span className="hint">{PAGE_HINT[screen]}</span>
          </div>
          {group.pages.length > 1 && (
            <div className="section-pages" role="group" aria-label={group.label}>
              {(group.pages as readonly Screen[]).map((s) => (
                <button key={s} aria-pressed={screen === s} onClick={() => go(s)}>
                  {pageLabel(s)}{badges[s] !== undefined && <span className="badge">{badges[s]}</span>}
                </button>
              ))}
            </div>
          )}
          {over && screen === "Today" && <GameOver game={game} />}
          {locked && <p className="notice">You don't control this club: {tenure(game).role === "buyer" ? `you're a buyer watching it while ${tenure(game).controller} sells` : `${tenure(game).controller} runs it and you hold ${Math.round((tenure(game).stake ?? 0) * 100)}%`}. Its staff make the calls; this page is read-only. Deals are on the Ownership page.</p>}
          <div className={locked ? "readonly" : undefined} onClickCapture={locked ? blockAction : undefined} onChangeCapture={locked ? blockAction : undefined}>
          {screen === "Today" && <TodayScreen game={game} go={go} busy={busy} play={(id, gameId) => step((s) => {
            playEvent(s, id);
            // Your own game can come in a play at a time.
            if (gameId && s.pbp?.[gameId] && readPrefs().followGames) openBox(gameId, true);
          })} />}
          {screen === "Calendar" && <CalendarScreen game={game} />}
          {screen === "College" && <CollegeScreen game={game} />}
          {screen === "Scouting" && <ScoutingScreen game={game} changed={changed} />}
          {screen === "Draft" && <DraftScreen game={game} changed={changed} />}
          {screen === "Stats" && <StatsScreen game={game} />}
          {screen === "Contracts" && <ContractsScreen game={game} changed={changed} />}
          {screen === "Staff" && <StaffScreen game={game} changed={changed} />}
          {screen === "Inbox" && <InboxScreen game={game} changed={changed} />}
          {screen === "Media" && <MediaScreen game={game} changed={changed} />}
          {screen === "Schedule" && <ScheduleScreen game={game} />}
          {screen === "Standings" && <StandingsScreen game={game} />}
          {screen === "Roster" && <RosterScreen game={game} changed={changed} />}
          {screen === "Camp" && <CampScreen game={game} changed={changed} />}
          {screen === "Free agents" && <FreeAgentsScreen game={game} changed={changed} />}
          {screen === "Trades" && <TradesScreen key={tradeStart?.player ?? "trades"} game={game} changed={changed} start={tradeStart} />}
          {screen === "Cap" && <CapScreen game={game} changed={changed} />}
          {screen === "Business" && <BusinessScreen game={game} changed={changed} />}
          {screen === "League" && <LeagueScreen game={game} />}
          {screen === "History" && <HistoryScreen game={game} />}
          {screen === "Owners" && <OwnersScreen game={game} changed={changed} />}
          {screen === "Owner" && <OwnerScreen game={game} changed={changed} />}
          {screen === "Ownership" && <OwnershipScreen game={game} changed={changed} />}
          {screen === "Front office" && <FrontOfficeScreen game={game} changed={changed} />}
          {screen === "Football" && <FootballScreen game={game} />}
          {screen === "Agreements" && <AgreementsScreen game={game} />}
          {screen === "Legal" && <LegalScreen game={game} changed={changed} />}
          {screen === "Reports" && <ReportsScreen game={game} changed={changed} />}
          {screen === "Analytics" && <AnalyticsScreen game={game} changed={changed} />}
          {screen === "Clubhouse" && <ClubhouseScreen game={game} changed={changed} />}
          {screen === "Game week" && <GameWeekScreen game={game} changed={changed} />}
          {screen === "Settings" && <SettingsScreen game={game} changed={changed} />}
          {screen === "Guide" && <GuideScreen />}
          {screen === "Save" && <SaveScreen game={game} onLoad={onLoad} onQuit={onQuit} />}
          </div>
        </main>
      </div>
      {box && <BoxScore key={`${box}-${follow}`} game={game} id={box} follow={follow} changed={changed} onClose={() => setBox(null)} />}
      {player && <PlayerPanel game={game} id={player} onClose={() => setPlayer(null)} changed={changed} />}
      {prospect && <ProspectPanel game={game} id={prospect} onClose={() => setProspect(null)} changed={changed} />}
      {school && <SchoolPanel game={game} id={school} onClose={() => setSchool(null)} />}
      {talks && <NegotiationPanel game={game} id={talks} onClose={() => setTalks(null)} changed={changed} />}
    </div>
    </UiContext.Provider>
  );
}

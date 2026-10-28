import { useState } from "react";
import { addDays, kickoff, longDate, shortDate } from "../../engine/dates";
import { GAME_BY_ID, RULES, teamLabel } from "../../engine/league";
import { calendarItems, GAME_OVER_DATE, type AgendaItem } from "../../engine/season";
import { matchup } from "../../engine/standings";
import type { GameState } from "../../engine/types";
import { useUi } from "../ui";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND_LABEL = { game: "Game", practice: "Practice", meeting: "Meeting", off: "Off", league: "League", travel: "Travel" };
/** The calendar runs from the start of camp to draft day. */
const FIRST_MONTH = "2026-07";
const LAST_MONTH = GAME_OVER_DATE.slice(0, 7);

/** Worth a spot on the month grid and the coming-up list: not routine practices or the offseason's daily grind. */
function notable(a: AgendaItem): boolean {
  if (a.kind === "game" || a.kind === "league") return true;
  if (a.kind === "meeting") return a.id !== "meeting:offseason";
  return a.title === "Bye week";
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** "vs DET" / "at GB", and "W 24-17" once played. */
function gameLine(game: GameState, id: string): { opp: string; result?: string; cls?: string } {
  const g = GAME_BY_ID[id];
  const m = matchup(game, g)!;
  const home = m.home === game.userTeam;
  const opp = `${g.neutral ? "vs" : home ? "vs" : "at"} ${home ? m.away : m.home}`;
  const r = game.results[id];
  if (!r) return { opp };
  const ours = home ? r.homeScore : r.awayScore;
  const theirs = home ? r.awayScore : r.homeScore;
  const res = ours > theirs ? "W" : ours < theirs ? "L" : "T";
  return { opp, result: `${res} ${ours}-${theirs}`, cls: res === "W" ? "good" : res === "L" ? "bad" : undefined };
}

export function CalendarScreen({ game }: { game: GameState }) {
  const ui = useUi();
  const [month, setMonth] = useState(game.date.slice(0, 7));
  const [picked, setPicked] = useState(game.date);

  const first = `${month}-01`;
  const lead = new Date(first + "T12:00:00Z").getUTCDay();
  const days: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  while (days.length % 7) days.push(null);

  const upcoming: { date: string; item: AgendaItem }[] = [];
  for (let d = game.date; d <= GAME_OVER_DATE && upcoming.length < 14 && d <= addDays(game.date, 200); d = addDays(d, 1)) {
    for (const item of calendarItems(game, d)) {
      if (item.gameId && game.results[item.gameId]) continue;
      if (notable(item) && item.id !== "meeting:weekly") upcoming.push({ date: d, item });
    }
  }
  const pickedItems = calendarItems(game, picked);

  const chip = (a: AgendaItem, d: string) => {
    if (a.kind === "game" && a.gameId) {
      const line = gameLine(game, a.gameId);
      return <span key={a.id} className="cal-chip game">{line.opp}{line.result && <b className={line.cls}> {line.result}</b>}</span>;
    }
    if (a.kind === "off") return <span key={a.id} className="cal-chip off">Bye</span>;
    const short = a.id === "meeting:weekly" ? "Front office" : a.title.replace(/[:,(].*$/, "");
    return <span key={a.id + d} className={`cal-chip ${a.kind}`} title={a.title}>{short}</span>;
  };

  return (
    <section className="stack">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>Calendar</h2>
        <div className="btn-row">
          <button className="btn small" disabled={month <= FIRST_MONTH} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <strong className="cal-month">{new Date(first + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
          <button className="btn small" disabled={month >= LAST_MONTH} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
          <button className="btn small" onClick={() => { setMonth(game.date.slice(0, 7)); setPicked(game.date); }}>Today</button>
        </div>
      </div>
      <div className="cal-layout">
        <div className="cal-grid" role="grid" aria-label="Month">
          {WEEKDAYS.map((w) => <div key={w} className="cal-head">{w}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={`x${i}`} className="cal-day empty" />;
            const items = calendarItems(game, d).filter(notable);
            const cls = ["cal-day", d === game.date && "today", d === picked && "picked", d < game.date && "past"].filter(Boolean).join(" ");
            return (
              <button key={d} className={cls} onClick={() => setPicked(d)} aria-label={`${longDate(d)}: ${items.map((a) => a.title).join("; ") || "nothing scheduled"}`}>
                <span className="cal-num">{Number(d.slice(8))}</span>
                <span className="cal-chips">{items.slice(0, 3).map((a) => chip(a, d))}{items.length > 3 && <span className="cal-more">+{items.length - 3}</span>}</span>
                {items.length > 0 && <span className="cal-dots" aria-hidden>{items.slice(0, 3).map((a) => <i key={a.id} className={a.kind} />)}</span>}
              </button>
            );
          })}
        </div>
        <div className="stack">
          <section className="panel stack tight">
            <h3>{picked === game.date ? "Today" : longDate(picked).replace(/, \d{4}$/, "")}</h3>
            {pickedItems.length === 0 && <span className="muted">Nothing scheduled.</span>}
            {pickedItems.map((a) => (
              <div key={a.id}>
                <span className={`kind ${a.kind}`}>{KIND_LABEL[a.kind]}</span>{" "}
                <strong>{a.title}</strong>
                {a.gameId && game.results[a.gameId]
                  ? <> <button className="link" onClick={() => ui.openBox(a.gameId!)}>{gameLine(game, a.gameId).result}, box score</button></>
                  : a.detail && <div className="muted">{a.detail}</div>}
              </div>
            ))}
          </section>
          <section className="panel stack tight">
            <h3>Coming up</h3>
            {upcoming.map(({ date, item }) => (
              <button key={date + item.id} className="cal-upcoming" onClick={() => { setMonth(date.slice(0, 7)); setPicked(date); }}>
                <span className="num">{date === game.date ? "Today" : shortDate(date)}</span>
                <span>
                  {item.title}
                  {item.kind === "game" && item.gameId && <span className="muted"> · {kickoff(GAME_BY_ID[item.gameId].timeET)}</span>}
                </span>
              </button>
            ))}
            {upcoming.length === 0 && <span className="muted">Nothing else before the {RULES.season + 1} draft.</span>}
            <span className="muted">Playoff games show up once the bracket is set. Practices are on each day's page.</span>
          </section>
        </div>
      </div>
      <p className="muted">All times Eastern. {teamLabel(game.userTeam)} games, league deadlines and front office meetings.</p>
    </section>
  );
}

// The Owner page's standing, calendar and time view: how each audience
// judges the owner and how that has moved, the public line on football
// decisions, the officials who answer to voters, scandals and achievements;
// the owner's calendar; and a slider from past actuals through this year's
// commitments to the forecast.
import { useState } from "react";
import { forecast } from "../../engine/books";
import { business } from "../../engine/business";
import { leagueYear } from "../../engine/contracts";
import { addDays, shortDate } from "../../engine/dates";
import { CALENDAR_KINDS, ownerCalendar, schedule, type CalendarItem } from "../../engine/people";
import { constituents, credibility, credWord, meetOfficial, reputationTrend, setStance, standingState, STANCES, type Stance } from "../../engine/standing";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Evidence, Help } from "../Help";

export function OwnerStanding({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const s = standingState(game);
  const cred = credibility(game);
  const trend = reputationTrend(game);
  const [date, setDate] = useState(addDays(game.date, 14));
  const [kind, setKind] = useState<CalendarItem["kind"]>("meeting");
  const act = (r: string | null) => { setMsg(r); changed(); };
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>Your standing <Help k="credibility" /></h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Audience</th><th>View of you</th><th>Change over a year</th></tr></thead>
            <tbody>{cred.map((a) => {
              const t = trend.find((x) => x.key === a.key || (a.key === "employees" && x.key === "staff"));
              return <tr key={a.key} title={a.why}><td>{a.label}</td><td>{credWord(a.score)}</td><td>{t ? (t.change > 3 ? "Rising" : t.change < -3 ? "Falling" : "Steady") : "-"}</td></tr>;
            })}</tbody>
          </table></div>
          {s.broken.length > 0 && <span className="bad">On the record: {s.broken.slice(-3).map((b) => b.text.toLowerCase()).join("; ")}.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Your public line</h3>
          <span className="muted">What you say about football decisions. Saying one thing and doing another tends to come out.</span>
          {(Object.keys(STANCES) as Stance[]).map((k) => (
            <label key={k} className="row"><input type="radio" checked={s.stance === k} onChange={() => { setStance(game, k); changed(); }} /> "{STANCES[k]}"</label>
          ))}
          <h4>Public officials</h4>
          <span className="muted">They answer to voters. Right now voters' view of the club is {credWord(constituents(game)).toLowerCase()}.</span>
          {s.officials.map((o, i) => (
            <span key={o.role}>{o.role} {o.name} ({o.lean >= 60 ? "friendly" : o.lean >= 45 ? "neutral" : "skeptical"}; up for election {o.up}) <button className="link" onClick={() => act(meetOfficial(game, i))}>Meet</button></span>
          ))}
          {s.incidents.length > 0 && <>
            <h4>In the news</h4>
            {s.incidents.slice(0, 5).map((x, i) => <span key={i} className={x.good ? "good" : "muted"}>{shortDate(x.date)}: {x.text}</span>)}
          </>}
        </div>
      </div>

      <div className="split">
        <div className="panel stack tight">
          <h3>Your calendar</h3>
          <div className="btn-row">
            <input type="date" value={date} min={addDays(game.date, 1)} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            <select value={kind} onChange={(e) => setKind(e.target.value as CalendarItem["kind"])}>
              {Object.entries(CALENDAR_KINDS).map(([k, v]) => <option key={k} value={k} title={v.what}>{v.label}</option>)}
            </select>
            <button className="btn small" onClick={() => act(schedule(game, date, kind) ?? "On the calendar.")}>Schedule</button>
          </div>
          <span className="muted">{CALENDAR_KINDS[kind].what}</span>
          {ownerCalendar(game).slice(0, 14).map((r, i) => <span key={i}>{shortDate(r.date)}: {r.what} <span className="muted">({r.kind})</span></span>)}
        </div>
        <TimeView game={game} />
      </div>
    </div>
  );
}

/** Past actuals, this year's commitments and the forecast on one slider. */
function TimeView({ game }: { game: GameState }) {
  const year = leagueYear(game.date);
  const closed = game.books?.closed ?? [];
  const first = closed.length ? closed[0].year : year;
  const fc = forecast(game, 5);
  const [y, setY] = useState(year);
  const past = closed.find((c) => c.year === y);
  const ahead = fc.find((f) => f.year === y);
  const led = business(game).ledger.filter((e) => e.year === year);
  const rev = led.filter((e) => e.amount > 0 && !["loanIn", "capital", "deposits"].includes(e.cat)).reduce((t, e) => t + e.amount, 0);
  const cost = -led.filter((e) => e.amount < 0 && !["principal", "distribution"].includes(e.cat)).reduce((t, e) => t + e.amount, 0);
  const spread = Math.max(0, y - year) * 0.06;
  return (
    <div className="panel stack tight">
      <h3>Past, present and forecast</h3>
      <input type="range" min={first} max={year + 5} value={y} onChange={(e) => setY(Number(e.target.value))} aria-label="League year" />
      <strong>{y}</strong>
      {past && <><Evidence kind="confirmed" /><dl className="kv"><dt>Revenue</dt><dd>{money(past.revenue)}</dd><dt>Operating income <Help k="operatingIncome" /></dt><dd>{money(past.operating)}</dd><dt>Net income</dt><dd>{money(past.net)}</dd><dt>Cash at year end</dt><dd>{money(past.cashEnd)}</dd><dt>Debt at year end</dt><dd>{money(past.debtEnd)}</dd></dl></>}
      {!past && y === year && <><Evidence kind="confirmed" /><span className="muted">So far this league year (cash basis):</span><dl className="kv"><dt>Money in</dt><dd>{money(rev)}</dd><dt>Money out</dt><dd>{money(cost)}</dd></dl></>}
      {!past && y > year && ahead && <><Evidence kind="estimate" /><dl className="kv">
        <dt>Revenue</dt><dd>{money(ahead.revenue)} <span className="muted">({money(ahead.revenue * (1 - spread))} to {money(ahead.revenue * (1 + spread))})</span></dd>
        <dt>Operating income</dt><dd>{money(ahead.operating)} <span className="muted">({money(ahead.operating - Math.abs(ahead.revenue) * spread)} to {money(ahead.operating + Math.abs(ahead.revenue) * spread)})</span></dd>
        <dt>Cash at year end</dt><dd>{money(ahead.cash)} <span className="muted">({money(ahead.low)} to {money(ahead.high)})</span></dd>
      </dl><span className="muted">The range widens each year out: the staff's forecasts have missed by about that much.</span></>}
      {!past && y !== year && !ahead && <span className="muted">No figures for that year.</span>}
    </div>
  );
}

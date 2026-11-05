import { Fragment } from "react";
import { shortDate } from "../../engine/dates";
import { cooperationWord, culture, DEVELOPMENT, gmTrustWord, INDICATOR_KEYS, INDICATORS, setDevelopment, word } from "../../engine/culture";
import { EXEC_ROLES } from "../../engine/executives";
import type { GameState } from "../../engine/types";
import { succession, workload } from "../../engine/workplace";
import { money } from "../format";

export function Culture({ game, changed }: { game: GameState; changed: () => void }) {
  const c = culture(game);
  const now = c.history.at(-1);
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>The building</h3>
          {!now && <span className="muted">The first readings come on the first of the month.</span>}
          {now && (
            <dl className="kv">
              {INDICATOR_KEYS.map((k) => <Fragment key={k}><dt title={INDICATORS[k].what}>{INDICATORS[k].label}</dt><dd className={now[k] >= 60 ? "good" : now[k] < 40 ? "bad" : ""}>{word(now[k])}</dd></Fragment>)}
            </dl>
          )}
          <span className="muted">Read from what happens: turnover, how recommendations and complaints are handled, whether work gets done, what leaks, and how people feel.</span>
        </div>
        <div className="panel stack tight">
          <h3>Working relationships</h3>
          <dl className="kv">
            <dt>You and the GM</dt><dd>{gmTrustWord(c.gmTrust)}</dd>
            <dt>The GM and head coach</dt><dd>{cooperationWord(c.cooperation)}</dd>
            <dt>Sponsors</dt><dd>{word(c.rel.sponsors)}</dd>
            <dt>The community</dt><dd>{word(c.rel.community)}</dd>
            <dt>Reporters' sources inside</dt><dd>{c.rel.sources >= 60 ? "Plenty: things get out" : c.rel.sources >= 40 ? "A few" : "Almost none"}</dd>
            <dt>Workload</dt><dd>{workload(game)}</dd>
          </dl>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Staff development</h3>
          <div className="tabs" role="group" aria-label="Development budget">
            {DEVELOPMENT.map((d, i) => <button key={d.label} aria-pressed={c.development === i} onClick={() => { setDevelopment(game, i); changed(); }}>{d.label}</button>)}
          </div>
          <span className="muted">{money(DEVELOPMENT[c.development].cost)} a year for mentoring, courses and credentials. People grow faster (deputies most), and they're happier where they're invested in.</span>
        </div>
        <div className="panel stack tight">
          <h3>Succession</h3>
          <span className="muted">Each department's number two, and how ready the president thinks they are.</span>
          {succession(game).map((s) => <span key={s.role}>{EXEC_ROLES[s.role].label}: {s.name} <span className="muted">({s.read})</span></span>)}
        </div>
      </div>
      {c.history.length > 1 && (
        <div className="panel stack tight">
          <h3>Month by month</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th>{INDICATOR_KEYS.map((k) => <th key={k}>{INDICATORS[k].label}</th>)}</tr></thead>
              <tbody>{c.history.slice(-12).reverse().map((h) => <tr key={h.month}><td>{h.month}</td>{INDICATOR_KEYS.map((k) => <td key={k}>{word(h[k])}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      {(c.log.length > 0 || c.leaks.length > 0) && (
        <div className="panel stack tight">
          <h3>What people noticed</h3>
          {[...c.log.map((l) => ({ ...l, leak: false })), ...c.leaks.map((l) => ({ ...l, leak: true }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
            .map((l, i) => <span key={i}>{shortDate(l.date)} {l.date.slice(0, 4)}: {l.leak ? <strong>Leak. </strong> : null}{l.text}</span>)}
        </div>
      )}
    </div>
  );
}

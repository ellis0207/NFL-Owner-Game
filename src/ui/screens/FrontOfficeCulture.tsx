import { shortDate } from "../../engine/dates";
import { cooperationWord, culture, DEVELOPMENT, gmTrustWord, INDICATOR_KEYS, INDICATORS, setDevelopment, word } from "../../engine/culture";
import { EXEC_ROLES } from "../../engine/executives";
import type { GameState } from "../../engine/types";
import { succession, workload } from "../../engine/workplace";
import { money } from "../format";
import { Chip, WordScale } from "../gfx";
import { COOP_STEPS, coopStep, CULTURE_STEPS, cultureStep, GM_TRUST_STEPS, gmTrustStep } from "../gfxdata";

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
            <div className="stack tight">
              {INDICATOR_KEYS.map((k) => <WordScale key={k} steps={CULTURE_STEPS} at={cultureStep(now[k])} label={<span title={INDICATORS[k].what}>{INDICATORS[k].label}</span>} />)}
            </div>
          )}
          <span className="muted">Read from what happens: turnover, how recommendations and complaints are handled, whether work gets done, what leaks, and how people feel.</span>
        </div>
        <div className="panel stack tight">
          <h3>Working relationships</h3>
          <div className="stack tight">
            <WordScale steps={GM_TRUST_STEPS} at={gmTrustStep(c.gmTrust)} label={`You and the GM: ${gmTrustWord(c.gmTrust)}`} />
            <WordScale steps={COOP_STEPS} at={coopStep(c.cooperation)} label={`GM and head coach: ${cooperationWord(c.cooperation)}`} />
            <WordScale steps={CULTURE_STEPS} at={cultureStep(c.rel.sponsors)} label="Sponsors" />
            <WordScale steps={CULTURE_STEPS} at={cultureStep(c.rel.community)} label="The community" />
          </div>
          <dl className="kv">
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
          {succession(game).map((s) => <span key={s.role} className="gx-row"><Chip icon="user">{EXEC_ROLES[s.role].label}</Chip> {s.name} <span className="muted">({s.read})</span></span>)}
        </div>
      </div>
      {c.history.length > 1 && (
        <div className="panel stack tight">
          <h3>Month by month</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Month</th>{INDICATOR_KEYS.map((k) => <th key={k}>{INDICATORS[k].label}</th>)}</tr></thead>
              <tbody>{c.history.slice(-12).reverse().map((h) => <tr key={h.month}><td>{h.month}</td>{INDICATOR_KEYS.map((k) => <td key={k}><Chip tone={h[k] >= 60 ? "good" : h[k] < 45 ? "bad" : undefined}>{word(h[k])}</Chip></td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      {(c.log.length > 0 || c.leaks.length > 0) && (
        <div className="panel stack tight">
          <h3>What people noticed</h3>
          {[...c.log.map((l) => ({ ...l, leak: false })), ...c.leaks.map((l) => ({ ...l, leak: true }))].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15)
            .map((l, i) => <span key={i}>{shortDate(l.date)} {l.date.slice(0, 4)}: {l.leak ? <Chip icon="megaphone" tone="bad">Leak</Chip> : null} {l.text}</span>)}
        </div>
      )}
    </div>
  );
}

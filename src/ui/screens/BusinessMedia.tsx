import { useState } from "react";
import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { RULES } from "../../engine/league";
import {
  abroad, audienceLift, beatWriters, contentYear, nationalBreakdown, OPT_OUT, ROLES, searchArchive, setAccess, setShow, setSpokesperson, setStaff,
  showQuality, SHOWS, spokesperson, teamMedia, TV_DEALS, tvOutlook,
} from "../../engine/teammedia";
import type { GameState, TeamMediaState } from "../../engine/types";
import { money } from "../format";

const billions = (x: number) => `$${(x / 1e9).toFixed(2)}B`;
const ACCESS: Record<TeamMediaState["access"], string> = {
  open: "Open: long availability, open practices, players made available",
  standard: "Standard: league-required availability",
  closed: "Closed: the minimum, practices closed, no extra interviews",
};
const SPOKES: Record<TeamMediaState["spokesperson"], string> = { owner: "The owner", president: "The team president", gm: "The general manager", coach: "The head coach" };

export function Media({ game, changed }: { game: GameState; changed: () => void }) {
  const t = teamMedia(game);
  const year = leagueYear(game.date);
  const nb = nationalBreakdown(year);
  const out = tvOutlook(game);
  const content = contentYear(game, year);
  const q = showQuality(game);
  const [query, setQuery] = useState("");
  const hits = query.trim().length >= 3 ? searchArchive(game, query) : [];
  const voice = spokesperson(game);
  const act = (fn: () => void) => { fn(); changed(); };
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>National TV and streaming</h3>
          <p className="muted">The league signs these for all 32 clubs and splits them equally. Average yearly fees, approximate public reports.</p>
          <table>
            <thead><tr><th>Partner</th><th>Package</th><th className="num">Per year</th><th className="num">Through</th></tr></thead>
            <tbody>
              {TV_DEALS.map((d) => (
                <tr key={d.partner} className={d.through < year ? "muted" : undefined}><td>{d.partner}</td><td>{d.package}</td><td className="num">{billions(d.annual)}</td><td className="num">{d.through}</td></tr>
              ))}
            </tbody>
          </table>
          <dl className="kv">
            <dt>Our share, {year}</dt><dd>{money(nb.total)}: {money(nb.tv)} TV and streaming, {money(nb.licensing)} licensing, {money(nb.other)} other league business</dd>
            <dt>Opt-out</dt><dd>The league can leave the deals after the {OPT_OUT} season</dd>
            <dt>After that</dt><dd>{money(out.low)} to {money(out.high)} a club from TV in {out.year}, most likely {money(out.mid)}{t.streaming > 1.03 ? " (streaming money is running hot)" : t.streaming < 0.97 ? " (streaming money is cooling)" : ""}</dd>
          </dl>
        </div>
        <div className="panel stack tight">
          <h3>Our audience</h3>
          <dl className="kv">
            <dt>Social followers</dt><dd>{(t.followers / 1e6).toFixed(2)}M{t.followers0 ? ` (${t.followers >= t.followers0 ? "+" : ""}${Math.round((t.followers / t.followers0 - 1) * 100)}% since we took over)` : ""}</dd>
            <dt>Digital value</dt><dd>{audienceLift(game) >= 1 ? "+" : ""}{Math.round((audienceLift(game) - 1) * 100)}% on what digital partners pay for our audience</dd>
            <dt>Abroad</dt><dd>The league assigns us {abroad(game)} for international marketing (made up)</dd>
            <dt>Content, {year}</dt><dd>{money(content.cost)} to run, {money(content.revenue)} back from shows and their sponsors</dd>
          </dl>
          <span className="label">What people are saying</span>
          {t.feed.length ? (
            <ul>{t.feed.slice(0, 6).map((p, i) => <li key={i}><span className="muted">{shortDate(p.date)} {p.who}:</span> {p.text}</li>)}</ul>
          ) : <span className="muted">Quiet until the games start.</span>}
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Content department</h3>
          <table>
            <thead><tr><th>Role</th><th className="num">Staff</th><th className="num">Pay</th><th></th></tr></thead>
            <tbody>
              {Object.entries(ROLES).map(([k, r]) => (
                <tr key={k}>
                  <td>{r.label}</td><td className="num">{t.staff[k] ?? 0}</td><td className="num">{money(r.pay)}</td>
                  <td className="btn-row">
                    <button onClick={() => act(() => setStaff(game, k, (t.staff[k] ?? 0) - 1))} aria-label={`One fewer ${r.label}`}>−</button>
                    <button onClick={() => act(() => setStaff(game, k, (t.staff[k] ?? 0) + 1))} aria-label={`One more ${r.label}`}>+</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="label">Shows</span>
          {Object.entries(SHOWS).map(([k, s]) => (
            <label key={k} className="btn-row">
              <input type="checkbox" checked={!!t.shows[k]} onChange={(e) => act(() => setShow(game, k, e.target.checked))} />
              {s.label}: {money(s.cost)} a year{s.revenue ? `, about ${money(s.revenue)} back` : ""}
              {t.shows[k] && (q[k] ?? 1) < 0.95 ? <span className="bad"> (short-staffed: {Math.round((q[k] ?? 0) * 100)}%)</span> : null}
            </label>
          ))}
          <span className="muted">The documentary deepens the core fan base during the season; the international content grows our reach abroad.</span>
        </div>
        <div className="panel stack tight">
          <h3>Press and beat writers</h3>
          <dl className="kv">
            <dt>Beat writers</dt><dd>{beatWriters(game).join(", ")} (made up)</dd>
            <dt>Sources</dt><dd>{Math.round(game.culture?.rel.sources ?? 50)} of 100 (how much of the building talks to them)</dd>
          </dl>
          <label className="stack tight">
            <span className="label">Access</span>
            <select value={t.access} onChange={(e) => act(() => setAccess(game, e.target.value as TeamMediaState["access"]))}>
              {Object.entries(ACCESS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="stack tight">
            <span className="label">Who answers for the club</span>
            <select value={t.spokesperson} onChange={(e) => act(() => setSpokesperson(game, e.target.value as TeamMediaState["spokesperson"]))}>
              {Object.entries(SPOKES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <span className="muted">Speaking now: {voice.name}, {voice.title}. Open access warms the writers but leaks more; closed keeps secrets and cools the coverage.</span>
        </div>
      </div>
      <div className="panel stack tight">
        <h3>The archive</h3>
        {t.sagas.filter((s) => s.until >= RULES.season).length ? (
          <span className="muted">Stories that keep coming back: {t.sagas.filter((s) => s.until >= RULES.season).map((s) => s.title).join("; ")}.</span>
        ) : null}
        <input type="search" placeholder="Search headlines about the club" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the archive" />
        {query.trim().length >= 3 ? (
          hits.length ? <ul>{hits.slice(0, 25).map((h, i) => <li key={i}><span className="muted">{h.date}</span> {h.headline}</li>)}</ul> : <span className="muted">Nothing found.</span>
        ) : (
          <ul>{t.archive.slice(0, 8).map((h, i) => <li key={i}><span className="muted">{h.date}</span> {h.headline}</li>)}</ul>
        )}
        <span className="muted">{t.archive.length} headlines kept.</span>
      </div>
    </div>
  );
}

import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { fanBase, lifetimeValue, METRO, metroPop, SEGMENT_LABEL, SURVEY_LABEL, surveyAverages, trustWord } from "../../engine/fans";
import { tix } from "../../engine/ticketing";
import type { GameState, SurveyItem } from "../../engine/types";
import { money } from "../format";

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const word = (x: number) => (x >= 70 ? "Very happy" : x >= 64 ? "Happy" : x >= 56 ? "Mixed" : x >= 45 ? "Unhappy" : "Angry");

export function Fans({ game }: { game: GameState }) {
  const f = fanBase(game);
  const us = game.userTeam;
  const m = METRO[us];
  const year = leagueYear(game.date);
  const avg = surveyAverages(game);
  const last = f.surveys[0];
  const clv = lifetimeValue(game);
  const acq = tix(game).acquisition[0];
  return (
    <div className="stack">
      <div className="split">
        <div className="panel stack tight">
          <h3>The market</h3>
          <dl className="kv">
            <dt>Metro population</dt><dd>{metroPop(us, year).toFixed(2)} million, {m.growth >= 0 ? "growing" : "shrinking"} {Math.abs(m.growth * 100).toFixed(1)}% a year</dd>
            <dt>Household income</dt><dd>{Math.round(m.income * 100)}% of the national median</dd>
            <dt>Other big-league teams here</dt><dd>{m.rivals}</dd>
            <dt>Economy</dt><dd>{f.economy >= 1.02 ? "Strong" : f.economy >= 0.99 ? "Steady" : f.economy >= 0.96 ? "Softening" : "In a downturn"}</dd>
            <dt>Competition for fans' money this year</dt><dd>{f.competition >= 1.02 ? "Heavy (concerts, other teams, travel)" : f.competition <= 0.98 ? "Light" : "Normal"}</dd>
          </dl>
          <span className="muted">Population figures are approximate.</span>
        </div>
        <div className="panel stack tight">
          <h3>Where our fans are</h3>
          <dl className="kv">
            <dt>Local</dt><dd>{num(f.reach.local)}</dd>
            <dt>Surrounding region</dt><dd>{num(f.reach.region)}</dd>
            <dt>Across the country</dt><dd>{num(f.reach.national)}</dd>
            <dt>Abroad</dt><dd>{num(f.reach.intl)}</dd>
          </dl>
          <span className="muted">National and international followers grow with winning, stars and games abroad; they buy jerseys and watch the digital channels sponsors pay for.</span>
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Trust and loyalty</h3>
          <dl className="kv">
            <dt>Trust in the club</dt><dd>{trustWord(f.trust)} ({Math.round(f.trust)}){f.scar >= 3 ? `, with ${Math.round(f.scar)} points of lasting damage` : ""}</dd>
            <dt>Core loyalty</dt><dd>{Math.round(f.core)} of 100{f.core > f.core0 + 2 ? ", deeper than when you took over" : f.core < f.core0 - 2 ? ", thinner than when you took over" : ""}</dd>
          </dl>
          <span className="muted">Trust moves with how the club treats fans: prices, seat licenses, broken promises, service. Most of a hit heals, but some lasts years. Core loyalty is built over generations of winning and losing.</span>
          {f.log.slice(0, 6).map((x, i) => <div key={i} className="muted">{shortDate(x.date)}: {x.text}</div>)}
        </div>
        <div className="panel stack tight">
          <h3>Post-game surveys</h3>
          {!avg && <span className="muted">Fans are surveyed after each regular-season home game.</span>}
          {avg && (
            <table>
              <thead><tr><th>Question</th><th className="num">Season</th><th className="num">Last game</th></tr></thead>
              <tbody>
                {(Object.keys(SURVEY_LABEL) as SurveyItem[]).map((k) => (
                  <tr key={k}><td>{SURVEY_LABEL[k]}</td><td className="num">{avg.scores[k].toFixed(1)}</td><td className="num">{last ? last.scores[k].toFixed(1) : ""}</td></tr>
                ))}
                <tr><td><strong>Overall</strong></td><td className="num"><strong>{avg.overall.toFixed(1)}</strong></td><td className="num">{last?.overall.toFixed(1)}</td></tr>
              </tbody>
            </table>
          )}
          {avg && <span className="muted">Out of 10, over {avg.games} home games. Game-day and facilities budgets, prices, crowds and the building's age all show up here.</span>}
        </div>
      </div>
      <div className="panel stack tight">
        <h3>Customers</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Segment</th><th>Mood</th><th className="num">Spends a year</th><th className="num">Stays each year</th><th className="num">Lifetime value</th></tr></thead>
            <tbody>{clv.map((c) => (
              <tr key={c.seg}><td>{SEGMENT_LABEL[c.seg]}</td><td>{word(f.sat[c.seg])}</td><td className="num">{money(c.spend)}</td><td className="num">{Math.round(c.retention * 100)}%</td><td className="num">{money(c.value)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <dl className="kv">
          <dt>This season's records</dt><dd>{num(f.crm.complaints)} complaints, {num(f.crm.upgrades)} seat upgrades, {num(f.crm.contacts)} account contacts</dd>
          <dt>New customers</dt><dd>{num(f.crm.newSubs)} new season-ticket holders, about {num(f.crm.newBuyers)} first-time buyers</dd>
          {acq && acq.added > 0 && <><dt>Cost to find one</dt><dd>{money(acq.spend / acq.added)} in {acq.season} marketing</dd></>}
        </dl>
        <span className="muted">Lifetime value is a year's spending, the share the club keeps, and the years a household is likely to keep buying.</span>
      </div>
    </div>
  );
}

// The scouting department's operations: how the budget is split between
// travel, video, medical and data, the national and pro scouts, the advance
// reports on our next opponents, and the department's draft record.
import { useState } from "react";
import { draftReturn, scoutingRecord } from "../../engine/hindsight";
import { teamLabel, PLAYER_BY_ID } from "../../engine/league";
import { scoutOps, setSplit, splitFactors, type ScoutSplit } from "../../engine/scoutops";
import { shortDate } from "../../engine/dates";
import type { GameState } from "../../engine/types";

const PARTS: [keyof ScoutSplit, string, string][] = [
  ["travel", "Travel", "more schools visited: reads build faster"],
  ["video", "Video", "film study: tighter reads, better advance reports"],
  ["medical", "Medical", "earlier flags on medical files"],
  ["data", "Data", "less noise on the value board"],
];

export function ScoutOpsPanel({ game, changed }: { game: GameState; changed: () => void }) {
  const ops = scoutOps(game);
  const [split, setLocal] = useState<ScoutSplit>({ ...ops.split });
  const f = splitFactors(game);
  const record = scoutingRecord(game);
  const ret = draftReturn(game).slice(0, 12);

  return (
    <div className="stack">
      <h3>Department budget</h3>
      <p className="muted">How the scouting money is spent. Shares are balanced to 100%. Now: reads build at {Math.round(f.gain * 100)}% of the base rate, read error {Math.round(f.error * 100)}%, medical flags show at {Math.round(f.medicalAt)}% familiarity.</p>
      <div className="row wrap">
        {PARTS.map(([k, label, hint]) => (
          <label key={k} title={hint}>{label} {Math.round((split[k] / (split.travel + split.video + split.medical + split.data || 1)) * 100)}%
            <input type="range" min={0} max={100} value={Math.round(split[k] * 100)} onChange={(e) => setLocal({ ...split, [k]: Number(e.target.value) / 100 })} />
          </label>
        ))}
        <button onClick={() => { setSplit(game, split); changed(); }}>Set budget</button>
      </div>
      <p className="muted">
        National scout {ops.national.name} cross-checks the top hundred names (since {ops.national.since}). Pro scouts: {ops.pros.map((p) => `${p.name} (since ${p.since})`).join(", ")}; they write up each opponent two days after our game.
      </p>
      {ops.advance.length > 0 && (
        <>
          <h3>Advance report: {teamLabel(ops.advance[0].opp)}</h3>
          <span className="muted">Filed {shortDate(ops.advance[0].date)}</span>
          <ul>{ops.advance[0].notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </>
      )}
      {record.length > 0 && (
        <>
          <h3>Scouting record</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Class</th><th className="num">Picks</th><th className="num">Beat projection</th><th className="num">Busts</th><th className="num">Risky called, busted</th><th className="num">Safe called, busted</th></tr></thead>
              <tbody>{record.map((r) => <tr key={r.year}><td>{r.year}</td><td className="num">{r.picks}</td><td className="num">{r.hits}</td><td className="num">{r.busts}</td><td className="num">{r.riskyBust}%</td><td className="num">{r.safeBust}%</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {ret.length > 0 && (
        <>
          <h4>Draft return</h4>
          <ul>{ret.map((r) => <li key={r.player}>{r.year} No. {r.overall} {PLAYER_BY_ID[r.player]?.name ?? r.player}: {r.perSeason.toFixed(2)} a season over {r.seasons} (slot usually {r.expected.toFixed(2)})</li>)}</ul>
        </>
      )}
    </div>
  );
}

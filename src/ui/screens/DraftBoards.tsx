// The war room's boards: one list of our reads sorted four ways (value,
// risk, scheme fit, expected value), college production adjusted for the
// schedule and the system, undrafted bonus offers, and the analysts'
// trade-down chart.
import { useMemo, useState } from "react";
import { tradeDownOptions } from "../../engine/analysts";
import { schoolName } from "../../engine/collegeData";
import { draftPool } from "../../engine/draft";
import { draftClass } from "../../engine/prospects";
import { adjustedProduction, draftBoards, offerUdfa, scoutOps, UDFA_BUDGET } from "../../engine/scoutops";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { useUi } from "../ui";

type Sort = "value" | "risk" | "fit" | "ev";
const SORTS: [Sort, string][] = [["value", "Value"], ["ev", "Expected value"], ["fit", "Scheme fit"], ["risk", "Least risk"]];

export function DraftBoards({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const [sort, setSort] = useState<Sort>("value");
  const [said, setSaid] = useState<string | null>(null);
  const pool = useMemo(() => draftPool(game), [game, game.date]);
  const rows = useMemo(() => draftBoards(game, pool), [game, pool]);
  const sorted = [...rows].sort((a, b) => sort === "risk" ? a.risk - b.risk || b.value - a.value : b[sort] - a[sort]).slice(0, 60);
  const ops = scoutOps(game);
  const spent = Object.values(ops.udfa).reduce((t, b) => t + b, 0);
  const downs = (game.analytics?.level ?? 0) > 0 ? tradeDownOptions(game) : [];
  const dc = draftClass(game.seed);

  return (
    <div className="stack">
      <p className="muted">Four boards from the same reports. Risk counts how little we know him, his medical file and makeup questions; expected value takes a price off for risk, sharper the more we spend on data in the scouting budget. Undrafted offers go out right after the last pick: {money(spent)} of {money(UDFA_BUDGET)} committed.</p>
      {said && <p className="notice">{said}</p>}
      <div className="tabs" role="group" aria-label="Board">
        {SORTS.map(([k, label]) => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>)}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Prospect</th><th>Pos</th><th className="num">Value</th><th>Risk</th><th className="num">Fit</th><th className="num">EV</th><th>Production a game</th><th className="num">UDFA bonus</th></tr></thead>
          <tbody>
            {sorted.map((r) => {
              const prod = adjustedProduction(game, r.id);
              return (
                <tr key={r.id}>
                  <td className="name"><button className="link" onClick={() => ui.openProspect(r.id)}>{dc.byId[r.id].name}</button> <span className="muted">{schoolName(dc.byId[r.id].school)}</span></td>
                  <td>{r.pos}</td>
                  <td className="num">{r.value.toFixed(1)}</td>
                  <td>{r.riskWord}</td>
                  <td className="num">{r.fit.toFixed(1)}</td>
                  <td className="num">{r.ev.toFixed(1)}</td>
                  <td>{prod ? <span title={`${prod.games} games; ${prod.schedule}, ${prod.system}`}>{prod.raw} raw, {prod.adjusted} adjusted</span> : <span className="muted">-</span>}</td>
                  <td className="num">
                    <select value={ops.udfa[r.id] ?? 0} onChange={(e) => { setSaid(offerUdfa(game, r.id, Number(e.target.value))); changed(); }}>
                      {[0, 10_000, 25_000, 50_000, 100_000, 150_000, 250_000].map((b) => <option key={b} value={b}>{b ? money(b) : "None"}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ops.udfaLog && (
        <p className="muted">Last undrafted race ({ops.udfaLog.year}): signed {ops.udfaLog.won.length}, lost {ops.udfaLog.lost.length}{ops.udfaLog.lost.length ? ` (${ops.udfaLog.lost.slice(0, 5).map(([id, t]) => `${dc.byId[id]?.name ?? id} to ${t}`).join(", ")})` : ""}.</p>
      )}
      {downs.length > 0 && (
        <>
          <h3>Trading down from No. {downs[0].from}</h3>
          <ul>{downs.map((d) => <li key={d.to}>To No. {d.to}: the chart says they owe {d.owe} points, {d.equals}.</li>)}</ul>
        </>
      )}
    </div>
  );
}

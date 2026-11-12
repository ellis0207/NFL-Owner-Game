// The coach's room on the Camp page: how the starters play in the preseason,
// who gets the backup snaps, the roster-bubble meeting before the cutdown,
// the next-man-up order, and the special teams plan.
import { useState } from "react";
import { askToKeep, bubbleBoard, coachRoom, contingencyView, FOCUS_LABEL, PRESEASON_LABEL, setContingency, setPreseason, setStPlan, type PreseasonFocus, type PreseasonPlan } from "../../engine/coachroom";
import { RULES, PLAYER_BY_ID } from "../../engine/league";
import { addDays } from "../../engine/dates";
import { depthChart } from "../../engine/roster";
import { PUNT_LABEL, RETURN_LABEL, stPlan, type PuntPlan, type ReturnPlan } from "../../engine/simtactics";
import type { GameState } from "../../engine/types";
import { useUi } from "../ui";
import { tip } from "../tip";

export function CoachRoomPanel({ game, changed }: { game: GameState; changed: () => void }) {
  const ui = useUi();
  const [said, setSaid] = useState<string | null>(null);
  const room = coachRoom(game);
  const bubble = room.bubble?.season === RULES.season ? room.bubble : null;
  const rows = bubble?.rows ?? (game.date < RULES.keyDates.rosterCutdown && game.date >= addDays(RULES.keyDates.rosterCutdown, -40) ? bubbleBoard(game) : []);
  const view = contingencyView(depthChart(game, game.userTeam));
  const st = stPlan(game, game.userTeam);
  // Each staff view as a rank on the board (1 is the one they'd keep first), never a grade.
  const rank = (key: "gm" | "coach" | "analytics") => {
    const order = [...rows].sort((a, b) => b[key] - a[key]).map((r) => r.id);
    return (id: string) => order.indexOf(id) + 1;
  };
  const [gmR, hcR, anR] = [rank("gm"), rank("coach"), rank("analytics")];
  const link = (id: string) => <button className="link" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id]?.name ?? id}</button>;

  return (
    <section className="panel stack">
      <h3>Coach's room</h3>
      {said && <p className="notice">{said}</p>}
      <div className="row wrap">
        <label>Preseason starters
          <select value={room.preseason ?? "standard"} onChange={(e) => { setPreseason(game, e.target.value as PreseasonPlan, room.focus ?? "balanced"); changed(); }}>
            {Object.entries(PRESEASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Backup snaps
          <select value={room.focus ?? "balanced"} onChange={(e) => { setPreseason(game, room.preseason ?? "standard", e.target.value as PreseasonFocus); changed(); }}>
            {Object.entries(FOCUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <span className="muted">Starters who play longer get sharper for the opener and risk getting hurt in games that don't count; backups who get the snaps give the staff more to judge at the cutdown.</span>
      <div className="row wrap">
        <label>Returns
          <select value={st.returns} onChange={(e) => { setStPlan(game, { ...st, returns: e.target.value as ReturnPlan }); changed(); }}>
            {Object.entries(RETURN_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label>Punts
          <select value={st.punts} onChange={(e) => { setStPlan(game, { ...st, punts: e.target.value as PuntPlan }); changed(); }}>
            {Object.entries(PUNT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>

      {rows.length > 0 && (
        <>
          <h4>Roster bubble{bubble ? "" : " (as it stands; the meeting is five days before the cutdown)"}</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Player</th><th>Pos</th><th className="num">GM's order</th><th className="num">Coach's order</th><th className="num">Analysts' order</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.split ? "warn" : undefined}>
                    <td className="name">{link(r.id)}{r.split && <span className="muted"> · staff split</span>}</td>
                    <td>{r.pos}</td>
                    <td className="num">{gmR(r.id)}</td><td className="num">{hcR(r.id)}</td><td className="num">{anR(r.id)}</td>
                    <td>{bubble && (bubble.keep.includes(r.id)
                      ? <button onClick={() => { setSaid(askToKeep(game, r.id, false)); changed(); }}>Withdraw ask</button>
                      : <button onClick={() => { setSaid(askToKeep(game, r.id, true)); changed(); }}>Ask to keep</button>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4>Next man up</h4>
      <span className="muted">Who steps in if a starter goes down. Move a backup ahead and the coaches use your order on game day.</span>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Pos</th><th>Starters</th><th>Next up</th><th></th></tr></thead>
          <tbody>
            {view.map((v) => (
              <tr key={v.pos}>
                <td>{v.pos}</td>
                <td>{v.starters.map((id, i) => <span key={id}>{i ? ", " : ""}{link(id)}</span>)}</td>
                <td>{v.next.map((id, i) => <span key={id}>{i ? ", then " : ""}{link(id)}</span>)}</td>
                <td>
                  {v.next.length > 1 && <button onClick={() => { setContingency(game, v.pos, [v.next[1], v.next[0]]); changed(); }}>Swap</button>}
                  {room.contingency?.[v.pos] && <button className="link" onClick={() => { delete room.contingency![v.pos]; changed(); }}>Coach's order</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

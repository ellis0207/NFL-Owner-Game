import { useMemo, useState } from "react";
import { capHit, contractYearsLeft, teamPlayerIds } from "../../engine/cap";
import { ageOn, shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, RULES } from "../../engine/league";
import { depthChart, POSITION_ORDER, proposeFinal53 } from "../../engine/roster";
import type { GameState, Position } from "../../engine/types";
import { lastSeasonLine, money, POSITION_NAMES } from "../format";
import { PlayerPanel } from "../PlayerPanel";

type Filter = "all" | "active" | "ps";

export function RosterScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const team = game.userTeam;
  const beforeCutdown = game.date <= RULES.keyDates.rosterCutdown;
  const ids = teamPlayerIds(game, team);
  const chart = depthChart(game, team);
  const depthIndex = useMemo(() => {
    const m: Record<string, number> = {};
    for (const pos of POSITION_ORDER) chart[pos].forEach((id, i) => (m[id] = i + 1));
    return m;
  }, [chart]);

  // The cutdown plan: the owner's edits if any, otherwise the GM's proposal.
  const plan = useMemo(
    () => new Set(beforeCutdown ? game.cutPlan ?? proposeFinal53(game, team) : []),
    [beforeCutdown, game.cutPlan, ids.length],
  );
  const edited = !!game.cutPlan;

  function toggleKeep(id: string) {
    const next = new Set(plan);
    if (next.has(id)) next.delete(id); else next.add(id);
    game.cutPlan = [...next];
    changed();
  }
  function resetPlan() {
    game.cutPlan = undefined;
    changed();
  }

  const shown = ids.filter((id) => filter === "all" || game.players[id].status === filter || (filter === "active" && game.players[id].status === "camp"));
  const byPos = new Map<Position, string[]>();
  for (const id of shown) {
    const pos = PLAYER_BY_ID[id].position;
    byPos.set(pos, [...(byPos.get(pos) ?? []), id]);
  }
  for (const list of byPos.values()) list.sort((a, b) => (depthIndex[a] ?? 99) - (depthIndex[b] ?? 99));

  return (
    <section className="stack">
      <h2>Roster</h2>
      {beforeCutdown && (
        <div className="notice stack">
          <strong>Cutdown to 53 is due {shortDate(RULES.keyDates.rosterCutdown)}.</strong>
          <span>
            Keeping <span className={plan.size > 53 ? "bad" : "good"}>{plan.size}</span> of {ids.length}.{" "}
            {edited ? "This is your edited plan." : "This is the GM's proposal."} Tap Keep or Cut to change it.
            {plan.size > 53 && " If you keep more than 53, the GM drops the extras they rate lowest."}
            {" "}Players cut can be brought back on the practice squad.
          </span>
          {edited && <div><button className="btn small" onClick={resetPlan}>Go back to the GM's plan</button></div>}
        </div>
      )}
      {!beforeCutdown && (
        <div className="tabs" role="group" aria-label="Show">
          {([["all", "Everyone"], ["active", "53-man roster"], ["ps", "Practice squad"]] as const).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th><th>Player</th><th>Depth</th><th className="num">Age</th><th className="num">Exp</th>
              <th className="num">2026 cap</th><th className="num">Yrs</th><th>2025 season</th><th>{beforeCutdown ? "Cutdown" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {POSITION_ORDER.filter((pos) => byPos.get(pos)?.length).map((pos) => (
              <PositionGroup key={pos} pos={pos} ids={byPos.get(pos)!} game={game} depthIndex={depthIndex}
                plan={beforeCutdown ? plan : null} onToggle={toggleKeep} onOpen={setOpen} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Depth is the coaching staff's current depth chart. You see what an owner sees: stats, contracts and your staff's decisions.</p>
      {open && <PlayerPanel game={game} id={open} onClose={() => setOpen(null)} changed={changed} />}
    </section>
  );
}

function PositionGroup(props: {
  pos: Position; ids: string[]; game: GameState; depthIndex: Record<string, number>;
  plan: Set<string> | null; onToggle: (id: string) => void; onOpen: (id: string) => void;
}) {
  const { pos, ids, game, depthIndex, plan, onToggle, onOpen } = props;
  return (
    <>
      <tr className="group"><td colSpan={9}>{POSITION_NAMES[pos]}</td></tr>
      {ids.map((id) => {
        const p = PLAYER_BY_ID[id];
        const status = game.players[id].status;
        const keep = plan?.has(id);
        return (
          <tr key={id} className="clickable" onClick={() => onOpen(id)}>
            <td className="num">{p.jersey ?? ""}</td>
            <td className="name">{p.name}</td>
            <td>{status === "ps" ? "PS" : `${pos}${depthIndex[id] ?? ""}`}</td>
            <td className="num">{ageOn(p.birthDate, game.date) ?? ""}</td>
            <td className="num">{p.yearsExp === 0 ? "R" : p.yearsExp}</td>
            <td className="num">{status === "ps" ? "PS" : money(capHit(id))}</td>
            <td className="num">{status === "ps" ? "" : contractYearsLeft(id)}</td>
            <td className="muted">{lastSeasonLine(p)}</td>
            <td onClick={(e) => e.stopPropagation()}>
              {plan ? (
                <button className={`pill ${keep ? "keep" : "cut"}`} style={{ background: "transparent" }} onClick={() => onToggle(id)}
                  aria-label={`${keep ? "Keeping" : "Cutting"} ${p.name}. Tap to change.`}>
                  {keep ? "Keep" : "Cut"}
                </button>
              ) : (
                <span className={`pill ${status === "ps" ? "ps" : ""}`}>{status === "ps" ? "Practice squad" : status === "active" ? "Active" : "Camp"}</span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

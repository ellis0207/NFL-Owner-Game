import { useMemo, useState } from "react";
import { campNote } from "../../engine/camp";
import { capHit, contractYearsLeft, teamPlayerIds } from "../../engine/cap";
import { ageOn, shortDate } from "../../engine/dates";
import { isHurt } from "../../engine/injuries";
import { PLAYER_BY_ID, RULES, SEASON } from "../../engine/league";
import { faClass, isOffseason, isPendingFreeAgent, NEXT, off } from "../../engine/offseason";
import { gradeShort } from "../../engine/reports";
import { depthChart, POSITION_ORDER, proposeFinal53 } from "../../engine/roster";
import { outLabel } from "../../engine/season";
import type { GameState, Position } from "../../engine/types";
import { money, POSITION_NAMES, recentSeasonLine } from "../format";
import { useUi } from "../ui";

type Filter = "all" | "active" | "ps" | "ir" | "future";

export function RosterScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const ui = useUi();
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
  const hurt = ids.filter((id) => isHurt(game, id));
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
          {([["all", "Everyone"], ["active", "53-man roster"], ["ps", "Practice squad"], ["ir", "Injured reserve"], ["future", "Future deals"]] as const).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      )}
      {hurt.length > 0 && (
        <div className="notice stack tight">
          <strong>Injury report</strong>
          {hurt.map((id) => {
            const inj = game.players[id].injury!;
            return (
              <button key={id} className="link" style={{ textDecoration: "none" }} onClick={() => ui.openPlayer(id)}>
                <strong>{PLAYER_BY_ID[id].name}</strong> <span className="muted">{PLAYER_BY_ID[id].position}</span> · {inj.type} · {outLabel(game.date, inj.returnDate, inj.seasonEnding)}
                {game.players[id].status === "ir" ? " · on IR" : ""}
              </button>
            );
          })}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th><th>Player</th><th>Depth</th><th>Coach's view</th><th className="num">Age</th><th className="num">Exp</th>
              <th className="num">{capYear(game)} cap</th><th className="num">Yrs</th><th>{isOffseason(game.date) ? SEASON : SEASON - 1} season</th><th>{beforeCutdown ? "Cutdown" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {POSITION_ORDER.filter((pos) => byPos.get(pos)?.length).map((pos) => (
              <PositionGroup key={pos} pos={pos} ids={byPos.get(pos)!} game={game} depthIndex={depthIndex}
                plan={beforeCutdown ? plan : null} onToggle={toggleKeep} onOpen={ui.openPlayer} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">Depth is the coaching staff's current depth chart and "Coach's view" is how your head coach grades each player. Neither is gospel: coaches can be wrong. Tap a player for the full report.</p>
    </section>
  );
}

/** The cap year that matters: next season once this one is over. */
function capYear(game: GameState): number {
  return isOffseason(game.date) ? NEXT : SEASON;
}

function PositionGroup(props: {
  pos: Position; ids: string[]; game: GameState; depthIndex: Record<string, number>;
  plan: Set<string> | null; onToggle: (id: string) => void; onOpen: (id: string) => void;
}) {
  const { pos, ids, game, depthIndex, plan, onToggle, onOpen } = props;
  return (
    <>
      <tr className="group"><td colSpan={10}>{POSITION_NAMES[pos]}</td></tr>
      {ids.map((id) => {
        const p = PLAYER_BY_ID[id];
        const status = game.players[id].status;
        const holdout = game.players[id].holdout;
        const keep = plan?.has(id);
        const year = capYear(game);
        const tag = isOffseason(game.date) ? off(game).tags[id] : undefined;
        const expiring = !tag && isPendingFreeAgent(game, id) ? faClass(id) : null;
        const injured = isHurt(game, id);
        const note = campNote(game, game.userTeam, id);
        return (
          <tr key={id} className="clickable" onClick={() => onOpen(id)}>
            <td className="num">{p.jersey ?? ""}</td>
            <td className="name">{p.name}{note && <span className="muted"> · {note}</span>}</td>
            <td>{status === "ps" ? "PS" : status === "ir" ? "IR" : injured ? <span className="bad">Inj</span> : `${pos}${depthIndex[id] ?? ""}`}</td>
            <td className="muted">{gradeShort(game, id)}</td>
            <td className="num">{ageOn(p.birthDate, game.date) ?? ""}</td>
            <td className="num">{p.yearsExp === 0 ? "R" : p.yearsExp}</td>
            <td className="num">{status === "ps" ? "PS" : money(capHit(id, year, game))}</td>
            <td className="num">{status === "ps" ? "" : contractYearsLeft(id, year, game)}</td>
            <td className="muted">{recentSeasonLine(game, id)}</td>
            <td onClick={(e) => e.stopPropagation()}>
              {plan && status === "ir" ? <span className="pill ir">IR</span> : plan ? (
                <button className={`pill ${keep ? "keep" : "cut"}`} style={{ background: "transparent" }} onClick={() => onToggle(id)}
                  aria-label={`${keep ? "Keeping" : "Cutting"} ${p.name}. Tap to change.`}>
                  {keep ? "Keep" : "Cut"}
                </button>
              ) : (
                <span className={`pill ${holdout || expiring ? "cut" : tag ? "keep" : status === "ps" ? "ps" : status === "ir" ? "ir" : injured ? "inj" : ""}`}>
                  {tag ? (tag.kind === "franchise" ? "Franchise tag" : "Transition tag") : expiring ? `Expiring (${expiring})` : holdout ? (holdout.kind === "holdout" ? "Holding out" : "Holding in") : status === "ps" ? "Practice squad" : status === "ir" ? "Injured reserve" : injured ? "Injured" : status === "active" ? "Active" : status === "future" ? "Future deal" : "Camp"}
                </span>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

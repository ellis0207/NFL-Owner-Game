// The football overview: the roster's outlook, health, the cap, the next
// opponents, and how the GM and coaches are doing, on one page.
import { capSummary, teamPlayerIds } from "../../engine/cap";
import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { knownReturn } from "../../engine/medical";
import { PLAYER_BY_ID, SCHEDULE, teamLabel } from "../../engine/league";
import { teamOutlook } from "../../engine/outlook";
import { hotSeat, qcCoaches } from "../../engine/people";
import { scoutOps } from "../../engine/scoutops";
import { standings } from "../../engine/standings";
import { teamStaff } from "../../engine/staff";
import { culture, cooperationWord, gmTrustWord } from "../../engine/culture";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Evidence, Help } from "../Help";
import { useUi } from "../ui";

export function FootballScreen({ game }: { game: GameState }) {
  const ui = useUi();
  const team = game.userTeam;
  const year = leagueYear(game.date);
  const cap = capSummary(game, team, year);
  const next = capSummary(game, team, year + 1);
  const ids = teamPlayerIds(game, team);
  const hurt = ids.filter((id) => game.players[id].injury);
  const ir = ids.filter((id) => game.players[id].status === "ir");
  const outlook = teamOutlook(game, team).filter((r) => r.flags.length).slice(0, 10);
  const games = SCHEDULE.filter((g) => g.date >= game.date && (g.home === team || g.away === team)).slice(0, 3);
  const r = standings(game)[team];
  const ts = teamStaff(team);
  const c = game.culture ? culture(game) : null;
  const adv = game.scoutOps ? scoutOps(game).advance[0] : undefined;
  const hot = hotSeat(game);
  const link = (id: string) => <button className="link" onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id]?.name ?? id}</button>;
  return (
    <section className="stack">
      <h2>Football overview</h2>
      <div className="split">
        <div className="panel stack tight">
          <h3>Season and staff</h3>
          <dl className="kv">
            <dt>Record</dt><dd>{r && r.w + r.l + r.t ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "No games yet"} <Evidence kind="confirmed" /></dd>
            <dt>Head coach</dt><dd>{ts.HC?.name ?? "Vacant"} ({hot > 0.7 ? "on the hot seat" : hot > 0.45 ? "some heat" : "secure"}) <Help k="hotSeat" /></dd>
            <dt>General manager</dt><dd>{ts.GM?.name ?? "Vacant"}{c ? `, ${gmTrustWord(c.gmTrust).toLowerCase()}` : ""}</dd>
            {c && <><dt>GM and coach</dt><dd>{cooperationWord(c.cooperation)} <Evidence kind="opinion" /></dd></>}
            <dt>Quality-control coaches</dt><dd>{qcCoaches(game).length}</dd>
          </dl>
        </div>
        <div className="panel stack tight">
          <h3>Cap</h3>
          <dl className="kv">
            <dt>{year} space <Help k="capSpace" /></dt><dd className={cap.space < 0 ? "bad" : "good"}>{money(cap.space)}</dd>
            <dt>{year} dead money <Help k="deadMoney" /></dt><dd>{money(cap.dead)}</dd>
            <dt>{year + 1} space</dt><dd>{money(next.space)} <Evidence kind="estimate" /></dd>
          </dl>
          <h3>Health</h3>
          <span>{hurt.length} hurt, {ir.length} on injured reserve.</span>
          {hurt.slice(0, 6).map((id) => {
            const inj = game.players[id].injury!;
            return <span key={id} className="muted">{link(id)}: {inj.type}, {(() => { const k = knownReturn(game, inj); return k ? `back about ${shortDate(k)}` : "return unknown"; })()} <Evidence kind="estimate" /></span>;
          })}
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Next opponents</h3>
          {games.length === 0 && <span className="muted">No games scheduled.</span>}
          {games.map((g) => <span key={g.id}>{shortDate(g.date)}: {g.home === team ? "vs" : "at"} {teamLabel((g.home === team ? g.away : g.home) ?? "")}</span>)}
          {adv && <><h4>Advance report on {teamLabel(adv.opp)}</h4>{adv.notes.slice(0, 4).map((n, i) => <span key={i} className="muted">{n}</span>)}</>}
        </div>
        <div className="panel stack tight">
          <h3>Roster outlook</h3>
          <span className="muted">Starters aging past their peak or with deals ending within two seasons.</span>
          {outlook.map((o) => <span key={o.id}>{o.pos} {link(o.id)}{o.age ? `, ${o.age}` : ""}: {o.flags.join("; ")}</span>)}
          {!outlook.length && <span className="muted">No starters flagged.</span>}
        </div>
      </div>
    </section>
  );
}

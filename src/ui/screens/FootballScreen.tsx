// The football overview: the roster's outlook, health, the cap, the next
// opponents, and how the GM and coaches are doing, on one page.
import { capSummary, teamPlayerIds } from "../../engine/cap";
import { leagueYear } from "../../engine/contracts";
import { shortDate } from "../../engine/dates";
import { knownReturn } from "../../engine/medical";
import { PLAYER_BY_ID, RULES, SCHEDULE, teamLabel } from "../../engine/league";
import { teamOutlook } from "../../engine/outlook";
import { hotSeat, qcCoaches } from "../../engine/people";
import { scoutOps } from "../../engine/scoutops";
import { standings } from "../../engine/standings";
import { teamStaff } from "../../engine/staff";
import { culture, cooperationWord, gmTrustWord } from "../../engine/culture";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Estimate, Evidence, Help } from "../Help";
import { useUi } from "../ui";
import { tip } from "../tip";
import { Chip, Dials, FormChips, Gauge, Hud, HudStat, Icon, Pips, TeamBadge, WordScale } from "../gfx";
import { COOP_STEPS, GM_TRUST_STEPS, SEAT_STEPS, coopStep, gmTrustStep, recentForm, seatStep } from "../gfxdata";

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
  // Only the report on a game still to come: last week's opponent is old news.
  const adv = game.scoutOps ? scoutOps(game).advance.find((a) => !game.results[a.gameId]) : undefined;
  const nextReg = games.find((g) => g.type !== "PRE" && !game.results[g.id]);
  const hot = hotSeat(game);
  const link = (id: string) => <button className="link" {...tip("player", id)} onClick={() => ui.openPlayer(id)}>{PLAYER_BY_ID[id]?.name ?? id}</button>;
  const form = recentForm(game, team, 6);
  const rec = r && r.w + r.l + r.t ? `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}` : "0-0";
  const played = r ? r.w + r.l + r.t : 0;
  const capTotal = cap.limit;
  return (
    <section className="stack">
      <Hud>
        <HudStat icon="trophy" label="Record" value={rec} sub={form.length ? <FormChips results={form} /> : "No games yet"} tone={played && r.w > r.l ? "good" : played && r.l > r.w ? "bad" : undefined} />
        <HudStat icon="cap" label={`${year} cap space`} value={money(cap.space)} tone={cap.space < 0 ? "bad" : "good"} sub={`${money(cap.dead)} dead money`} />
        <HudStat icon="cross" label="Health" value={`${hurt.length} hurt`} tone={hurt.length > 4 ? "bad" : hurt.length > 1 ? "warn" : "good"} sub={`${ir.length} on injured reserve`} />
        <HudStat icon="clipboard" label="Starters flagged" value={String(outlook.length)} sub="Aging or deals ending" tone={outlook.length > 6 ? "warn" : undefined} />
      </Hud>
      <div className="split">
        <div className="panel stack tight">
          <h3>Season and staff</h3>
          <div className="gx-grid">
            <div className="gx-tile sunk">
              <div className="gx-tile-top"><Icon name="whistle" /><span className="gx-kicker">Head coach</span><Help k="hotSeat" /></div>
              <strong>{ts.HC?.name ?? "Vacant"}</strong>
              <WordScale steps={SEAT_STEPS} at={seatStep(hot)} invert compact />
            </div>
            <div className="gx-tile sunk">
              <div className="gx-tile-top"><Icon name="briefcase" /><span className="gx-kicker">General manager</span></div>
              <strong>{ts.GM?.name ?? "Vacant"}</strong>
              {c ? <WordScale steps={GM_TRUST_STEPS} at={gmTrustStep(c.gmTrust)} label={gmTrustWord(c.gmTrust)} compact /> : null}
            </div>
            {c && <div className="gx-tile sunk">
              <div className="gx-tile-top"><Icon name="handshake" /><span className="gx-kicker">GM and coach</span><Evidence kind="opinion" /></div>
              <WordScale steps={COOP_STEPS} at={coopStep(c.cooperation)} label={cooperationWord(c.cooperation)} compact />
            </div>}
            <div className="gx-tile sunk">
              <div className="gx-tile-top"><Icon name="eye" /><span className="gx-kicker">Quality-control coaches</span></div>
              <Pips n={qcCoaches(game).length} of={Math.max(3, qcCoaches(game).length)} label={String(qcCoaches(game).length)} />
            </div>
          </div>
        </div>
        <div className="panel stack tight">
          <h3>Cap</h3>
          <Dials>
            <Gauge value={capTotal > 0 ? cap.used / capTotal : 0} label={<>{year} space <Help k="capSpace" /></>} text={money(cap.space)} sub={`${Math.round(cap.used / Math.max(1, capTotal) * 100)}% of the cap used`} tone={cap.space < 0 ? "bad" : cap.space < capTotal * 0.03 ? "warn" : "good"} />
            <Gauge value={capTotal > 0 ? cap.dead / capTotal : 0} label={<>Dead money <Help k="deadMoney" /></>} text={money(cap.dead)} tone={cap.dead > capTotal * 0.12 ? "bad" : cap.dead > capTotal * 0.06 ? "warn" : undefined} />
            <Gauge value={next.limit > 0 ? next.used / next.limit : 0} label={`${year + 1} space`} text={<Estimate>{money(next.space)} <Evidence kind="estimate" /></Estimate>} sub={`${Math.round(next.used / Math.max(1, next.limit) * 100)}% already committed`} />
          </Dials>
          <h3>Health</h3>
          <div className="gx-row"><Icon name="cross" className="bad" /><Pips n={hurt.length} of={Math.max(8, hurt.length)} tone="bad" label={`${hurt.length} hurt, ${ir.length} on injured reserve`} /></div>
          {hurt.slice(0, 6).map((id) => {
            const inj = game.players[id].injury!;
            return <div key={id} className="gx-row"><Chip icon="cross" tone="bad">{inj.type}</Chip>{link(id)}<span className="muted">{(() => { const k = knownReturn(game, inj); return k ? `back about ${shortDate(k)}` : "return unknown"; })()}</span><Evidence kind="estimate" /></div>;
          })}
        </div>
      </div>
      <div className="split">
        <div className="panel stack tight">
          <h3>Next opponents</h3>
          {games.length === 0 && <span className="muted">No games scheduled.</span>}
          <div className="gx-grid">
            {games.map((g) => {
              const opp = (g.home === team ? g.away : g.home) ?? "";
              const or = standings(game)[opp];
              return (
                <div key={g.id} className="gx-tile sunk" {...tip("game", g.id)}>
                  <div className="gx-tile-top"><span className="gx-kicker">{shortDate(g.date)}</span><Chip icon={g.home === team ? "stadium" : "flag"}>{g.home === team ? "Home" : "Away"}</Chip></div>
                  <div className="gx-row"><TeamBadge team={opp} size={34} /><span><strong>{teamLabel(opp)}</strong><br /><span className="muted">{or && or.w + or.l + or.t ? `${or.w}-${or.l}${or.t ? `-${or.t}` : ""}` : ""}</span></span></div>
                  <FormChips results={recentForm(game, opp, 5)} />
                </div>
              );
            })}
          </div>
          {adv ? <><h4>Advance report on {teamLabel(adv.opp)}</h4>{adv.notes.slice(0, 4).map((n, i) => <span key={i} className="muted">{n}</span>)}</>
            : nextReg && game.date >= RULES.keyDates.regularSeasonStart && <span className="muted">The pro scouts file their report on the {teamLabel(nextReg.home === team ? nextReg.away! : nextReg.home!)} on Tuesday.</span>}
        </div>
        <div className="panel stack tight">
          <h3>Roster outlook</h3>
          <span className="muted">Starters aging past their peak or with deals ending within two seasons.</span>
          {outlook.map((o) => (
            <div key={o.id} className="gx-row">
              <span className="gx-pos">{o.pos}</span>{link(o.id)}{o.age ? <span className="muted">{o.age}</span> : null}
              {o.flags.map((f) => <Chip key={f} icon={/contract/i.test(f) ? "pen" : "clock"} tone={/this season/i.test(f) || /past/i.test(f) ? "warn" : undefined}>{f}</Chip>)}
            </div>
          ))}
          {!outlook.length && <span className="muted">No starters flagged.</span>}
        </div>
      </div>
    </section>
  );
}

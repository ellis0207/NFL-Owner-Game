import { useEffect, useMemo, useState } from "react";
import { mediaRank } from "../../engine/college";
import { schoolName } from "../../engine/collegeData";
import { shortDate } from "../../engine/dates";
import {
  advancePick, advanceToEndOfDay, advanceToOurPick, ourBoardValue, currentSlot, DAY_ROUNDS, dayDone, dayLabel, dayOfRound, draftCalls,
  draftDayOf, DRAFT_DAYS, DRAFT_YEAR, draftPool, makePick, mockSpot, ourPicksLeft, prepareClock, slotAt, slotLabel, staffRecommendations,
} from "../../engine/draft";
import { teamLabel, TEAM_BY_ID } from "../../engine/league";
import { draftClass } from "../../engine/prospects";
import { POSITION_ORDER } from "../../engine/roster";
import { knowledgeLabel, knowledge, scoutReport } from "../../engine/scouting";
import { startDay } from "../../engine/season";
import { acceptOffer, askPrice, declineOffer, gmRead, parsePick, proposeTrade, type Answer } from "../../engine/trades";
import type { GameState, Position, TradeDeal } from "../../engine/types";
import { money } from "../format";
import { useUi } from "../ui";

type Tab = "room" | "order" | "mocks" | "grades" | "class";
const TABS: [Tab, string][] = [["room", "Draft room"], ["order", "Draft order"], ["mocks", "Mock drafts"], ["grades", "GM grades"], ["class", "Our class"]];

export function DraftScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const live = draftDayOf(game.date) > 0;
  const [tab, setTab] = useState<Tab>(live ? "room" : game.draft?.order ? "order" : "mocks");
  return (
    <section className="stack">
      <h2>The {DRAFT_YEAR} NFL Draft</h2>
      <p className="muted">
        Three days at the end of April: the first round on Thursday, rounds two and three on Friday, rounds four through seven on Saturday.
        There's no clock: the draft moves only when you move it. Any pick of ours you skip, the GM makes.
      </p>
      <div className="tabs" role="group" aria-label="View">
        {TABS.map(([k, label]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === "room" && <Room game={game} changed={changed} />}
      {tab === "order" && <Order game={game} />}
      {tab === "mocks" && <Mocks game={game} />}
      {tab === "grades" && <Grades game={game} />}
      {tab === "class" && <OurClass game={game} />}
    </section>
  );
}

function Name({ game, id }: { game: GameState; id: string }) {
  const ui = useUi();
  const p = draftClass(game.seed).byId[id];
  return (
    <>
      <button className="link" onClick={() => ui.openProspect(id)}>{p.name}</button>
      <span className="muted"> · {p.position}, {schoolName(p.school)}</span>
    </>
  );
}

function teamName(team: string): string {
  return TEAM_BY_ID[team]?.name ?? team;
}

// ---- The draft room ----

function Room({ game, changed }: { game: GameState; changed: () => void }) {
  const d = game.draft;
  const day = draftDayOf(game.date);
  const slot = currentSlot(game);
  const [msg, setMsg] = useState<string | null>(null);
  // Teams behind us call as soon as we're on the clock.
  useEffect(() => {
    if (slot && slot.team === game.userTeam && d?.callsFor !== slot.overall) {
      prepareClock(game);
      changed();
    }
  }, [slot?.overall, slot?.team]);

  function act(fn: (s: GameState) => void) {
    startDay(game);
    fn(game);
    setMsg(null);
    changed();
  }

  if (!d?.order) {
    return (
      <div className="panel stack tight">
        <strong>The draft order is set the day after the Super Bowl.</strong>
        <span className="muted">Until then, the mock drafts project the order from the standings. Compensatory picks are announced in early March.</span>
      </div>
    );
  }
  const ours = ourPicksLeft(game);
  if (!day) {
    const over = d.made.length >= d.order.length;
    return (
      <div className="stack">
        <div className="panel stack tight">
          <strong>{over ? "The draft is over." : `The draft starts ${shortDate(DRAFT_DAYS[0])}.`}</strong>
          {!over && <span className="muted">Day 1 is {shortDate(DRAFT_DAYS[0])}, Day 2 {shortDate(DRAFT_DAYS[1])}, Day 3 {shortDate(DRAFT_DAYS[2])}.</span>}
        </div>
        {!over && <OurPicks game={game} />}
      </div>
    );
  }
  const done = dayDone(game, day);
  const us = slot?.team === game.userTeam;
  return (
    <div className="stack">
      <div className="panel stack tight">
        <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0 }}>{dayLabel(day)}</h3>
          <span className="muted">{d.made.length} of {d.order.length} picks made</span>
        </div>
        {slot ? (
          <div>
            <span className={us ? "good" : undefined}><strong>{us ? "We're on the clock" : `On the clock: ${teamLabel(slot.team)}`}</strong></span>
            <span className="muted"> · {slotLabel(slot)}{parsePick(slot.pick).from !== slot.team ? `, from ${parsePick(slot.pick).from}` : ""}{parsePick(slot.pick).comp ? ", compensatory" : ""}</span>
          </div>
        ) : (
          <strong>{done ? (day < 3 ? `Day ${day} is complete. Day ${day + 1} starts tomorrow.` : "The draft is complete. Undrafted free agents have signed.") : "Waiting on the day to start."}</strong>
        )}
        {slot && (
          <div className="btn-row">
            <button className="btn" onClick={() => act(advancePick)} title={us ? "The GM makes our pick." : undefined}>
              {us ? "Let the GM pick" : "Advance one pick"}
            </button>
            <button className="btn" onClick={() => act(advanceToOurPick)} title="Runs the draft until we're on the clock again today. If we're on the clock now, the GM makes this pick first.">
              Advance to our next pick
            </button>
            <button className="btn" onClick={() => act(advanceToEndOfDay)} title="Runs the rest of today's rounds. The GM makes our picks.">
              Advance to end of Day {day}
            </button>
          </div>
        )}
        {slot && !us && ours[0] && dayOfRound(ours[0].round) === day && <span className="muted">Our next pick: {slotLabel(ours[0])}, {ours[0].overall - slot.overall} picks away.</span>}
        {slot && !us && (!ours[0] || dayOfRound(ours[0].round) !== day) && <span className="muted">We have no more picks today.</span>}
        {msg && <span>{msg}</span>}
      </div>
      {us && <Recommendations game={game} act={act} />}
      {us && <Calls game={game} changed={changed} setMsg={setMsg} />}
      <Board game={game} act={act} canPick={us} />
      <div className="grid-2" style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <Ticker game={game} />
        <Upcoming game={game} changed={changed} />
      </div>
    </div>
  );
}

function Recommendations({ game, act }: { game: GameState; act: (fn: (s: GameState) => void) => void }) {
  const recs = staffRecommendations(game);
  const same = recs.length > 1 && recs.every((r) => r.player === recs[0].player);
  return (
    <div className="panel stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>What the staff wants</h3>
        {same && <span className="good">Everyone agrees</span>}
      </div>
      {recs.map((r) => {
        const report = scoutReport(game, r.player);
        const last = draftClass(game.seed).byId[r.player].name.split(" ").slice(-1)[0];
        return (
          <div key={r.role} className="rec">
            <div>
              <span className="muted">{r.name}, {r.title}:</span> <Name game={game} id={r.player} />
              {report.grade && <span className="muted"> · our scouts: {report.grade}</span>}
            </div>
            <div>"{r.reason}"</div>
            <button className="btn small primary" onClick={() => act((s) => { makePick(s, r.player, "owner"); })}>Draft {last}</button>
          </div>
        );
      })}
    </div>
  );
}

function Calls({ game, changed, setMsg }: { game: GameState; changed: () => void; setMsg: (s: string) => void }) {
  const calls = draftCalls(game);
  if (!calls.length) return <p className="muted">No calls about this pick. Nobody behind us is trying to move up right now.</p>;
  return (
    <div className="panel stack tight">
      <h3 style={{ margin: 0 }}>The phones are ringing</h3>
      {calls.map((o) => (
        <div key={o.id} className="stack tight">
          <span>{o.note}</span>
          <span className="muted">GM's read: {gmRead(game, o)}</span>
          <div className="btn-row">
            <button className="btn small primary" onClick={() => { startDay(game); setMsg(acceptOffer(game, o.id).text); changed(); }}>Trade down</button>
            <button className="btn small" onClick={() => { declineOffer(game, o.id); changed(); }}>Pass</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Board({ game, act, canPick }: { game: GameState; act: (fn: (s: GameState) => void) => void; canPick: boolean }) {
  const [pos, setPos] = useState<Position | "">("");
  const [sort, setSort] = useState<"ours" | "media">("ours");
  const dc = draftClass(game.seed);
  const made = game.draft?.made.length ?? 0;
  const ranked = useMemo(() => {
    const pool = draftPool(game);
    const ours = Object.fromEntries(pool.map((id) => [id, ourBoardValue(game, id)]));
    const order = [...pool].sort((a, b) => ours[b] - ours[a]);
    return { order, rank: Object.fromEntries(order.map((id, i) => [id, i + 1])) };
  }, [game, made, game.date]);
  let rows = ranked.order;
  if (pos) rows = rows.filter((id) => dc.byId[id].position === pos);
  if (sort === "media") rows = [...rows].sort((a, b) => mediaRank(game, a) - mediaRank(game, b));
  rows = rows.slice(0, 60);
  return (
    <div className="stack tight">
      <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0 }}>Best available</h3>
        <div className="btn-row">
          <select value={pos} onChange={(e) => setPos(e.target.value as Position | "")} aria-label="Position">
            <option value="">All positions</option>
            {POSITION_ORDER.map((p) => <option key={p}>{p}</option>)}
          </select>
          <div className="tabs" role="group" aria-label="Sort">
            <button aria-pressed={sort === "ours"} onClick={() => setSort("ours")}>Our board</button>
            <button aria-pressed={sort === "media"} onClick={() => setSort("media")}>Media board</button>
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">Ours</th><th>Prospect</th><th>Our scouts</th><th>File</th><th className="num">Media</th><th className="num">Mock</th><th></th></tr></thead>
          <tbody>
            {rows.map((id) => {
              const r = scoutReport(game, id);
              const m = mockSpot(game, id);
              const mr = mediaRank(game, id);
              return (
                <tr key={id}>
                  <td className="num">{ranked.rank[id]}</td>
                  <td className="name"><Name game={game} id={id} /></td>
                  <td>{r.grade ?? "—"}</td>
                  <td className="muted">{knowledgeLabel(knowledge(game, id))}</td>
                  <td className="num">{mr <= 300 ? mr : "—"}</td>
                  <td className="num">{m ? m.overall : "—"}</td>
                  <td>{canPick && <button className="btn small" onClick={() => act((s) => { makePick(s, id, "owner"); })}>Draft</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span className="muted">"Ours" is our scouts' board: their work during the season, blended with the consensus on players we saw less of. "Mock" is the latest mock draft's projected pick.</span>
    </div>
  );
}

function Ticker({ game }: { game: GameState }) {
  const made = [...(game.draft?.made ?? [])].reverse().slice(0, 15);
  return (
    <div className="panel stack tight">
      <h3 style={{ margin: 0 }}>The picks</h3>
      {made.length === 0 && <span className="muted">No picks yet.</span>}
      {made.map((m) => (
        <div key={m.pick}>
          <span className="num">{m.overall}.</span> <strong className={m.team === game.userTeam ? "good" : undefined}>{teamName(m.team)}</strong>{" "}
          <Name game={game} id={m.player} />
          {parsePick(m.pick).from !== m.team && <span className="muted"> (from {parsePick(m.pick).from})</span>}
          {m.by === "gm" && <span className="muted"> · GM's pick</span>}
        </div>
      ))}
    </div>
  );
}

function Upcoming({ game, changed }: { game: GameState; changed: () => void }) {
  const d = game.draft!;
  const [ask, setAsk] = useState<{ pick: string; answer: Answer } | null>(null);
  const day = draftDayOf(game.date);
  const next = [];
  for (let i = d.made.length; i < d.order!.length && next.length < 12; i++) {
    const s = slotAt(game, i)!;
    if (dayOfRound(s.round) > day) break;
    next.push(s);
  }
  function trade(deal: TradeDeal) {
    startDay(game);
    const r = proposeTrade(game, deal);
    setAsk(ask && { ...ask, answer: { verdict: r.verdict, text: r.record ? "Done: the pick is ours." : r.text } });
    changed();
  }
  return (
    <div className="panel stack tight">
      <h3 style={{ margin: 0 }}>Coming up</h3>
      {next.length === 0 && <span className="muted">No more picks today.</span>}
      {next.map((s) => (
        <div key={s.pick} className="btn-row" style={{ alignItems: "baseline" }}>
          <span><span className="num">{s.overall}.</span> <strong className={s.team === game.userTeam ? "good" : undefined}>{teamName(s.team)}</strong>
            <span className="muted"> R{s.round}{parsePick(s.pick).from !== s.team ? ` from ${parsePick(s.pick).from}` : ""}{parsePick(s.pick).comp ? " comp" : ""}</span></span>
          {s.team !== game.userTeam && (
            <button className="btn small" onClick={() => setAsk({ pick: s.pick, answer: askPrice(game, s.team, [{ kind: "pick", pick: s.pick }]) })}>Trade up</button>
          )}
        </div>
      ))}
      {ask && (
        <div className="stack tight">
          <span>{ask.answer.text}</span>
          {ask.answer.counter && ask.answer.verdict !== "reject" && (
            <>
              <span className="muted">GM's read: {gmRead(game, ask.answer.counter)}</span>
              <div className="btn-row">
                <button className="btn small primary" onClick={() => trade(ask.answer.counter!)}>Make the trade</button>
                <button className="btn small" onClick={() => setAsk(null)}>Never mind</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OurPicks({ game }: { game: GameState }) {
  const ours = ourPicksLeft(game);
  return (
    <div className="panel stack tight">
      <h3 style={{ margin: 0 }}>Our picks</h3>
      {ours.length === 0 && <span className="muted">We have no picks left in this draft.</span>}
      {ours.map((s) => (
        <div key={s.pick}>{slotLabel(s)}{parsePick(s.pick).from !== game.userTeam ? <span className="muted"> · from {teamLabel(parsePick(s.pick).from)}</span> : null}{parsePick(s.pick).comp ? <span className="muted"> · compensatory</span> : null}</div>
      ))}
    </div>
  );
}

// ---- The order ----

function Order({ game }: { game: GameState }) {
  const d = game.draft;
  const [round, setRound] = useState(1);
  if (!d?.order) {
    return <p className="muted">The order is set the day after the Super Bowl: non-playoff teams worst record first, then playoff teams by how far they went. Ties go to the team with the easier schedule, and tied teams rotate each round.</p>;
  }
  const comp = Object.fromEntries((d.comp ?? []).map((c) => [c.pick, c]));
  const rows = d.order.map((_, i) => slotAt(game, i)!).filter((s) => s.round === round);
  return (
    <div className="stack tight">
      <div className="tabs" role="group" aria-label="Round">
        {[1, 2, 3, 4, 5, 6, 7].map((r) => <button key={r} aria-pressed={round === r} onClick={() => setRound(r)}>Round {r}</button>)}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">No.</th><th className="num">Pick</th><th>Team</th><th>Notes</th><th>Selection</th><th>GM grade</th></tr></thead>
          <tbody>
            {rows.map((s) => {
              const m = d.made[s.overall - 1];
              const from = parsePick(s.pick).from;
              const c = comp[s.pick];
              return (
                <tr key={s.pick} className={s.team === game.userTeam ? "ours" : undefined}>
                  <td className="num">{s.overall}</td>
                  <td className="num">{s.inRound}</td>
                  <td><strong className={s.team === game.userTeam ? "good" : undefined}>{teamLabel(s.team)}</strong></td>
                  <td className="muted">{[from !== s.team ? `From ${from}` : "", c ? `Compensatory: lost ${c.player} to ${c.to}` : ""].filter(Boolean).join(" · ")}</td>
                  <td className="name">{m ? <Name game={game} id={m.player} /> : ""}</td>
                  <td>{m?.grade ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Mocks ----

function Mocks({ game }: { game: GameState }) {
  const mocks = game.draft?.mocks ?? [];
  const [i, setI] = useState(0);
  if (!mocks.length) return <p className="muted">The first mock drafts come out in September. Early on they cover the first round only; by draft week they go four rounds deep.</p>;
  const m = mocks[Math.min(i, mocks.length - 1)];
  return (
    <div className="stack tight">
      <select value={i} onChange={(e) => setI(Number(e.target.value))} aria-label="Mock draft">
        {mocks.map((x, k) => <option key={k} value={k}>{shortDate(x.date)}: {x.analyst}, {x.outlet}, mock {x.version}.0 ({x.rounds === 1 ? "first round" : `${x.rounds} rounds`})</option>)}
      </select>
      <span className="muted">Mock drafts are the media's guesses, from public information: the buzz around each prospect and what each team seems to need. {game.draft?.order ? "" : "The order is projected from the standings."}</span>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">No.</th><th>Team</th><th>Projected pick</th><th>Actual pick</th></tr></thead>
          <tbody>
            {m.players.map((id, k) => {
              const actual = game.draft?.made.find((x) => x.pick === m.slots[k]);
              return (
                <tr key={k}>
                  <td className="num">{k + 1}</td>
                  <td><strong className={m.teams[k] === game.userTeam ? "good" : undefined}>{teamName(m.teams[k])}</strong>{k % 32 === 0 && <span className="muted"> · Round {parsePick(m.slots[k]).round}</span>}</td>
                  <td className="name"><Name game={game} id={id} /></td>
                  <td className="name">{actual ? <>{actual.player === id ? <span className="good">✓ </span> : null}<Name game={game} id={actual.player} /></> : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- Grades ----

function Grades({ game }: { game: GameState }) {
  const d = game.draft;
  const done = d?.daysDone ?? [];
  const [day, setDay] = useState(done[done.length - 1] ?? 1);
  const [mine, setMine] = useState(false);
  if (!done.length) return <p className="muted">The GM grades every pick in the league at the end of each day of the draft.</p>;
  const rows = (d?.made ?? []).filter((m) => dayOfRound(parsePick(m.pick).round) === day && m.grade && (!mine || m.team === game.userTeam));
  return (
    <div className="stack tight">
      <div className="btn-row">
        <div className="tabs" role="group" aria-label="Day">
          {[1, 2, 3].filter((x) => done.includes(x)).map((x) => <button key={x} aria-pressed={day === x} onClick={() => setDay(x)}>{dayLabel(x)}</button>)}
        </div>
        <label><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Our picks only</label>
      </div>
      <span className="muted">Our GM's grades, from our board. Other front offices had their own boards; time will tell who was right.</span>
      <div className="table-wrap">
        <table>
          <thead><tr><th className="num">No.</th><th>Team</th><th>Player</th><th>Grade</th><th>Why</th></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.pick}>
                <td className="num">{m.overall}</td>
                <td><strong className={m.team === game.userTeam ? "good" : undefined}>{teamName(m.team)}</strong></td>
                <td className="name"><Name game={game} id={m.player} /></td>
                <td><strong>{m.grade}</strong></td>
                <td className="muted">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="muted">Rounds on {dayLabel(day)}: {DAY_ROUNDS[day - 1].join(", ")}.</span>
    </div>
  );
}

// ---- Our class ----

function OurClass({ game }: { game: GameState }) {
  const d = game.draft;
  const ours = (d?.made ?? []).filter((m) => m.team === game.userTeam);
  const udfa = Object.entries(d?.udfa ?? {}).filter(([, t]) => t === game.userTeam).map(([id]) => id);
  if (!ours.length && !udfa.length) return <OurPicksOrNothing game={game} />;
  return (
    <div className="stack tight">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Pick</th><th>Player</th><th>Made by</th><th>Grade</th><th className="num">Rookie deal</th><th className="num">Signing bonus</th></tr></thead>
          <tbody>
            {ours.map((m) => {
              const deal = game.contracts[m.player];
              return (
                <tr key={m.pick}>
                  <td>R{parsePick(m.pick).round}, No. {m.overall}</td>
                  <td className="name"><Name game={game} id={m.player} /></td>
                  <td className="muted">{m.by === "owner" ? "You" : "The GM"}</td>
                  <td>{m.grade ?? "—"}</td>
                  <td className="num">{deal ? `${deal.years.length} yrs, ${money(deal.total)}` : "—"}</td>
                  <td className="num">{deal ? money(deal.signingBonus) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {udfa.length > 0 && (
        <div className="panel stack tight">
          <h3 style={{ margin: 0 }}>Undrafted free agents</h3>
          {udfa.map((id) => <div key={id}><Name game={game} id={id} /></div>)}
        </div>
      )}
    </div>
  );
}

function OurPicksOrNothing({ game }: { game: GameState }) {
  return game.draft?.order ? <OurPicks game={game} /> : <p className="muted">Our draft class shows up here once we start picking.</p>;
}


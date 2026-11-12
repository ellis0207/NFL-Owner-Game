// Saved reports: views the owner names once and runs again any season,
// kept in the save. And the desk, ranked by what needs the owner first.
import { useState } from "react";
import { budgetVsActual } from "../../engine/books";
import { CATEGORY } from "../../engine/business";
import { capPlanner } from "../../engine/contractextras";
import { leagueYear } from "../../engine/contracts";
import { deleteReport, rankedDesk, REPORT_KINDS, saveReport } from "../../engine/desk";
import { shortDate } from "../../engine/dates";
import { PLAYER_BY_ID, RULES, TEAM_BY_ID, TEAMS } from "../../engine/league";
import { standings } from "../../engine/standings";
import { seasonTotals } from "../../engine/stats";
import { payrollByDept } from "../../engine/treasury";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { agreements } from "./AgreementsScreen";

export function ReportsScreen({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("cap");
  const [param, setParam] = useState("");
  const saved = game.office?.reports ?? [];
  const desk = rankedDesk(game).slice(0, 8);
  return (
    <section className="stack">
      <h2>Reports</h2>
      {msg && <p className="notice">{msg}</p>}
      <div className="panel stack tight">
        <h3>What needs you, in order</h3>
        <span className="muted">Ranked by deadline, money at stake, strategic weight and whether only you can decide it.</span>
        {desk.length === 0 && <span className="muted">Nothing open.</span>}
        {desk.map((d) => <span key={d.id}>{d.title} <span className="muted">({d.why.join(", ")}{d.deadline ? `; due ${shortDate(d.deadline)}` : ""})</span></span>)}
      </div>
      <div className="panel stack tight">
        <h3>Save a report</h3>
        <div className="btn-row">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Report name" />
          <select value={kind} onChange={(e) => { setKind(e.target.value); setParam(""); }} aria-label="Report">
            {Object.entries(REPORT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {kind === "leaders" && <select value={param} onChange={(e) => setParam(e.target.value)} aria-label="Stat">{["passYds", "rushYds", "recYds", "sacks", "tklSolo", "pressures"].map((s) => <option key={s}>{s}</option>)}</select>}
          {kind === "contracts" && <select value={param} onChange={(e) => setParam(e.target.value)} aria-label="Within">{["1", "2", "3"].map((s) => <option key={s} value={s}>Within {s} year{s === "1" ? "" : "s"}</option>)}</select>}
          <button className="btn small" onClick={() => { setMsg(saveReport(game, name, kind, param ? { [REPORT_KINDS[kind].params[0] ?? "p"]: param } : {})); setName(""); changed(); }}>Save</button>
        </div>
      </div>
      <CauseEffect game={game} />
      <YearRecords game={game} />
      {saved.map((r) => (
        <div key={r.id} className="panel stack tight">
          <div className="btn-row" style={{ justifyContent: "space-between" }}><h3>{r.name}</h3><button className="link" onClick={() => { deleteReport(game, r.id); changed(); }}>Delete</button></div>
          <Report game={game} kind={r.kind} params={r.params} />
        </div>
      ))}
    </section>
  );
}

function Report({ game, kind, params }: { game: GameState; kind: string; params: Record<string, string> }) {
  const team = game.userTeam;
  if (kind === "cap") return <ul>{capPlanner(game, team, []).map((p) => <li key={p.year}>{p.year}: {money(p.committed)} committed, {money(p.dead)} dead, {money(p.space)} space</li>)}</ul>;
  if (kind === "budget") {
    const rows = budgetVsActual(game, Number(params.year) || leagueYear(game.date)).filter((r) => Math.abs(r.variance) > 100_000).sort((a, b) => a.variance - b.variance).slice(0, 12);
    return <ul>{rows.map((r) => <li key={r.cat}>{CATEGORY[r.cat].label}: {r.variance >= 0 ? "ahead by" : "behind by"} {money(Math.abs(r.variance))}</li>)}</ul>;
  }
  if (kind === "injuries") {
    const hurt = Object.entries(game.players).filter(([, p]) => p.team === team && p.injury);
    return hurt.length ? <ul>{hurt.map(([id, p]) => <li key={id}>{PLAYER_BY_ID[id].name}: {p.injury!.type}{p.status === "ir" ? " (IR)" : ""}</li>)}</ul> : <span className="muted">Nobody hurt.</span>;
  }
  if (kind === "leaders") {
    const key = params.stat || "passYds";
    const rows = Object.entries(seasonTotals(game, "REG")).filter(([, r]) => r.team === team).map(([id, r]) => [id, Number((r.line as Record<string, number>)[key] ?? 0)] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return <ol>{rows.map(([id, v]) => <li key={id}>{PLAYER_BY_ID[id]?.name ?? id}: {v}</li>)}</ol>;
  }
  if (kind === "standings") {
    const me = TEAM_BY_ID[team];
    const st = standings(game);
    const div = TEAMS.filter((t) => t.conference === me.conference && t.division === me.division).sort((a, b) => (st[b.id]?.w ?? 0) - (st[a.id]?.w ?? 0));
    return <ol>{div.map((t) => <li key={t.id}>{t.name}: {st[t.id]?.w ?? 0}-{st[t.id]?.l ?? 0}{st[t.id]?.t ? `-${st[t.id].t}` : ""}</li>)}</ol>;
  }
  if (kind === "payroll") return <ul>{payrollByDept(game).map((r) => <li key={r.dept}>{r.dept}: {money(r.amount)}</li>)}</ul>;
  if (kind === "contracts") {
    const within = Number(params.within) || 1;
    const rows = agreements(game).filter((a) => a.ends <= RULES.season + within).sort((a, b) => b.amount - a.amount).slice(0, 25);
    return <ul>{rows.map((a, i) => <li key={i}>{a.kind}: {a.party}, {money(a.amount)}, ends {a.ends}</li>)}</ul>;
  }
  return null;
}

/** The owner's decisions, what followed right away, and what they led to later. */
function CauseEffect({ game }: { game: GameState }) {
  const log = (game.causes ?? []).slice(0, 15);
  return (
    <div className="panel stack tight">
      <h3>Cause and effect</h3>
      <span className="muted">Big decisions, what happened right away, and what came of them in later seasons.</span>
      {log.length === 0 && <span className="muted">Nothing yet: signings, trades, firings, deals and memo decisions show up here.</span>}
      {log.map((c) => (
        <div key={c.id}>
          <strong>{shortDate(c.date)} {c.date.slice(0, 4)}:</strong> {c.text}
          {c.effects.length > 0 && <ul className="plain muted">{c.effects.map((e, i) => <li key={i}>{e.text}</li>)}</ul>}
        </div>
      ))}
    </div>
  );
}

/** Each closed league year as it stood: kept even after contracts and rules change. */
function YearRecords({ game }: { game: GameState }) {
  const years = Object.values(game.archive ?? {}).sort((a, b) => b.year - a.year);
  const [open, setOpen] = useState<number | null>(null);
  if (!years.length) return null;
  const y = years.find((x) => x.year === open);
  return (
    <div className="panel stack tight">
      <h3>Year records</h3>
      <span className="muted">Each league year as it closed: our contracts, the cap, the books and the rules in force.</span>
      <div className="tabs" role="group" aria-label="Year">{years.map((x) => <button key={x.year} aria-pressed={open === x.year} onClick={() => setOpen(open === x.year ? null : x.year)}>{x.year}</button>)}</div>
      {y && (
        <div className="stack tight">
          <span>{TEAM_BY_ID[y.team]?.name ?? y.team}, owned by {y.owner}. Cap {money(y.cap.limit)}, used {money(y.cap.used)}, dead {money(y.cap.dead)}.{y.statement ? ` Revenue ${money(y.statement.revenue)}, operating income ${money(y.statement.operating)}, net ${money(y.statement.net)}.` : ""}</span>
          <ul className="plain">{y.contracts.slice(0, 12).map((c, i) => <li key={i}>{c.player}: {money(c.apy)} a year through {c.through}, {money(c.hit)} on that year's cap</li>)}</ul>
          <span className="muted">Rules: {y.rules.join("; ")}</span>
        </div>
      )}
    </div>
  );
}

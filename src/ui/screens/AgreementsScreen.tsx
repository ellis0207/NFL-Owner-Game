// The contract center and the archive. Every major agreement the club has
// (players, coaches, executives, sponsors and broadcasters, lenders) in
// one searchable list; and past seasons, finances, signings, trades and
// staff moves to browse by date.
import { useMemo, useState } from "react";
import { teamPlayerIds } from "../../engine/cap";
import { localDeals } from "../../engine/commerce";
import { dealOf, lastYear } from "../../engine/contracts";
import { openLoans } from "../../engine/debt";
import { EXEC_ROLES } from "../../engine/executives";
import { PLAYER_BY_ID, RULES, teamLabel } from "../../engine/league";
import { history } from "../../engine/seasons";
import { tradeOutcomes } from "../../engine/records";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { useUi } from "../ui";
import { entityFor, TERMS } from "../../engine/legal";

interface Agreement { kind: string; party: string; what: string; amount: number; ends: number; status: string; player?: string; signed?: string; starts?: number }

export function agreements(game: GameState): Agreement[] {
  const team = game.userTeam;
  const out: Agreement[] = [];
  for (const id of teamPlayerIds(game, team)) {
    const d = dealOf(game, id);
    if (!d) continue;
    out.push({ kind: "Player", party: PLAYER_BY_ID[id].name, what: `${PLAYER_BY_ID[id].position}, ${d.years.length}-year deal`, amount: d.apy, ends: lastYear(d) ?? RULES.season, status: game.players[id].status, player: id, signed: d.signed, starts: d.years.find((y) => !y.void)?.year });
  }
  for (const c of Object.values(game.staff?.people ?? {})) {
    if (!c.contract || c.retired || !((c.team === team && c.role) || c.job?.team === team)) continue;
    out.push({ kind: "Coach", party: c.name, what: c.role ?? c.job?.title ?? "Staff", amount: c.contract.salary, ends: c.contract.through, status: c.contract.guaranteed !== undefined && c.contract.guaranteed < 1 ? `${Math.round(c.contract.guaranteed * 100)}% guaranteed` : "Active" });
  }
  for (const e of Object.values(game.execs?.people ?? {})) {
    if (!e.role || !e.contract) continue;
    out.push({ kind: "Executive", party: e.name, what: EXEC_ROLES[e.role].label, amount: e.contract.salary, ends: e.contract.through, status: e.contract.guaranteed ? "Guaranteed" : "At will" });
  }
  if (game.business) for (const d of localDeals(game).deals) out.push({ kind: "Sponsor or media", party: d.partner, what: d.cat, amount: d.value, ends: d.start + d.years - 1, status: d.exclusive ? "Exclusive" : "Active" });
  if (game.debt) for (const l of openLoans(game)) out.push({ kind: "Loan", party: l.lender, what: `${l.kind} loan`, amount: l.balance, ends: Number(l.maturity.slice(0, 4)), status: l.breaches ? "Covenant breach" : "Current" });
  return out;
}

export function AgreementsScreen({ game }: { game: GameState }) {
  const [tab, setTab] = useState<"center" | "archive">("center");
  return (
    <section className="stack">
      <h2>Agreements and archive</h2>
      <div className="tabs" role="group" aria-label="View">
        <button aria-pressed={tab === "center"} onClick={() => setTab("center")}>Contract center</button>
        <button aria-pressed={tab === "archive"} onClick={() => setTab("archive")}>Archive</button>
      </div>
      {tab === "center" ? <Center game={game} /> : <Archive game={game} />}
    </section>
  );
}

function Center({ game }: { game: GameState }) {
  const ui = useUi();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState<"amount" | "ends" | "party">("amount");
  const [within, setWithin] = useState(0);
  const all = useMemo(() => agreements(game), [game, game.date]);
  const rows = all
    .filter((a) => (!kind || a.kind === kind) && (!q || `${a.party} ${a.what}`.toLowerCase().includes(q.toLowerCase())) && (!within || a.ends <= RULES.season + within))
    .sort((a, b) => sort === "amount" ? b.amount - a.amount : sort === "ends" ? a.ends - b.ends : a.party.localeCompare(b.party));
  return (
    <div className="stack">
      <div className="btn-row">
        <input placeholder="Search by name or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="">Every kind</option>
          {[...new Set(all.map((a) => a.kind))].map((k) => <option key={k}>{k}</option>)}
        </select>
        <select value={within} onChange={(e) => setWithin(Number(e.target.value))} aria-label="Expiring">
          <option value={0}>Any expiry</option><option value={1}>Ending by {RULES.season + 1}</option><option value={2}>Ending by {RULES.season + 2}</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="amount">Largest first</option><option value="ends">Expiring first</option><option value="party">By name</option>
        </select>
      </div>
      <span className="muted">{rows.length} of {all.length} agreements. Amounts are per year, except loans (balance owed).</span>
      <div className="table-wrap"><table>
        <thead><tr><th>Kind</th><th>Counterparty</th><th>What</th><th className="num">Amount</th><th>Signed</th><th>Runs</th><th>Status</th><th>Club company</th><th>Exit</th><th>Renewal</th></tr></thead>
        <tbody>{rows.slice(0, 150).map((a, i) => (
          <tr key={i}><td>{a.kind}</td><td className="name">{a.player ? <button className="link" onClick={() => ui.openPlayer(a.player!)}>{a.party}</button> : a.party}</td><td>{a.what}</td><td className="num">{money(a.amount)}</td><td>{a.signed ?? ""}</td><td>{a.starts ? `${a.starts} to ${a.ends}` : `to ${a.ends}`}</td><td>{a.status}</td><td>{entityFor(game, a.kind).split(",")[0]}</td><td className="muted">{TERMS[a.kind]?.exit ?? ""}</td><td className="muted">{TERMS[a.kind]?.renewal ?? ""}</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

function Archive({ game }: { game: GameState }) {
  const [view, setView] = useState<"seasons" | "finances" | "signings" | "trades" | "staff">("seasons");
  const [from, setFrom] = useState("");
  const team = game.userTeam;
  const hist = history(game);
  return (
    <div className="stack">
      <div className="btn-row">
        {(["seasons", "finances", "signings", "trades", "staff"] as const).map((v) => <button key={v} className="btn small" aria-pressed={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Since" />
      </div>
      {view === "seasons" && (
        <div className="table-wrap"><table>
          <thead><tr><th>Season</th><th>Record</th><th>Points</th><th>Playoffs</th><th>Champion</th></tr></thead>
          <tbody>{hist.seasons.filter((s) => !from || s.season >= Number(from.slice(0, 4))).map((s) => {
            const r = s.records[team];
            return <tr key={s.season}><td>{s.season}</td><td>{r ? `${r[0]}-${r[1]}${r[2] ? `-${r[2]}` : ""}` : "-"}</td><td>{r ? `${r[3]}-${r[4]}` : "-"}</td><td>{s.playoffs[team] ?? "Missed"}</td><td>{s.champion ? teamLabel(s.champion) : "-"}</td></tr>;
          })}</tbody>
        </table></div>
      )}
      {view === "finances" && (
        <div className="table-wrap"><table>
          <thead><tr><th>Year</th><th className="num">Revenue</th><th className="num">Operating</th><th className="num">Net</th><th className="num">Cash</th><th className="num">Debt</th><th>Audit</th></tr></thead>
          <tbody>{(game.books?.closed ?? []).filter((c) => !from || c.year >= Number(from.slice(0, 4))).map((c) => <tr key={c.year}><td>{c.year}</td><td className="num">{money(c.revenue)}</td><td className="num">{money(c.operating)}</td><td className="num">{money(c.net)}</td><td className="num">{money(c.cashEnd)}</td><td className="num">{money(c.debtEnd)}</td><td>{c.audit}</td></tr>)}</tbody>
        </table></div>
      )}
      {view === "signings" && (
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Player</th><th>Kind</th><th className="num">Years</th><th className="num">Per year</th><th className="num">Guaranteed</th></tr></thead>
          <tbody>{game.signings.filter((s) => s.team === team && (!from || s.date >= from)).slice(-150).reverse().map((s) => <tr key={s.id}><td>{s.date}</td><td>{PLAYER_BY_ID[s.player]?.name ?? s.player}</td><td>{s.kind}</td><td className="num">{s.years}</td><td className="num">{money(s.apy)}</td><td className="num">{money(s.guaranteed)}</td></tr>)}</tbody>
        </table></div>
      )}
      {view === "trades" && (
        <ul>{tradeOutcomes(game, team).filter((t) => !from || t.trade.date >= from).map((t, i) => <li key={i}>{t.trade.date}: gave {t.detail[0].join(", ") || "nothing"}; got {t.detail[1].join(", ") || "nothing"}. {t.verdict}</li>)}</ul>
      )}
      {view === "staff" && (
        <ul>{(game.staff?.log ?? []).filter((l) => l.team === team && (!from || l.date >= from)).slice(0, 100).map((l, i) => <li key={i}>{l.date}: {l.text}</li>)}</ul>
      )}
    </div>
  );
}

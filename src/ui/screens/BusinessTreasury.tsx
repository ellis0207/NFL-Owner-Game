// The Business page's Treasury and Journal tabs: working capital, payment
// terms and collections, audit findings and controls, consultants, the
// capital pool, payroll by department and staff cuts; and the double-entry
// journal with its trial balance.
import { useState } from "react";
import { shortDate } from "../../engine/dates";
import { journal, trialBalance } from "../../engine/journal";
import {
  approveCapital, CAPITAL, capitalAsks, capitalPool, COLLECTIONS, CONSULTANTS, consulting, CONTROLS, CUT_LABEL, cutDepartment, cutShare, findingChance,
  hireConsultant, payrollByDept, remediate, setCollections, setControls, setTerms, SUPPLIER_TERMS, treasury, workingCapital,
  type Collections, type Consultant, type CutDept, type SupplierTerms,
} from "../../engine/treasury";
import type { GameState } from "../../engine/types";
import { money } from "../format";
import { Help } from "../Help";

export function Treasury({ game, changed }: { game: GameState; changed: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = treasury(game);
  const wc = workingCapital(game);
  const pool = capitalPool(game);
  const act = (r: string | null) => { setMsg(r); changed(); };
  return (
    <div className="stack">
      {msg && <p className="notice">{msg}</p>}
      <div className="split">
        <div className="panel stack tight">
          <h3>Working capital <Help k="workingCapital" /></h3>
          <dl className="kv">
            <dt>Cash</dt><dd>{money(wc.cash)}</dd>
            <dt>Owed to us by partners</dt><dd>{money(wc.receivables)}</dd>
            <dt>Gate-pool share due from the league</dt><dd>{money(wc.poolDue)}</dd>
            <dt>Owed to vendors</dt><dd>{money(-wc.payables)}</dd>
            <dt>Ticket money for games not yet played <Help k="deferred" /></dt><dd>{money(-wc.deferred)}</dd>
            <dt>Net working capital</dt><dd className={wc.net < wc.reserve ? "bad" : "good"}>{money(wc.net)}</dd>
            <dt>Reserve target <Help k="reserve" /></dt><dd>{money(wc.reserve)}</dd>
            <dt>Days to collect <Help k="dso" /></dt><dd>{wc.dso}</dd>
            <dt>Days to pay <Help k="dpo" /></dt><dd>{wc.dpo}</dd>
          </dl>
        </div>
        <div className="panel stack tight">
          <h3>Payment terms</h3>
          <label className="field"><span className="label">Paying vendors</span>
            <select value={t.terms} onChange={(e) => { setTerms(game, e.target.value as SupplierTerms); changed(); }}>
              {Object.entries(SUPPLIER_TERMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <span className="muted">{SUPPLIER_TERMS[t.terms].what} Vendors: {t.vendors >= 70 ? "happy" : t.vendors >= 40 ? "fine" : "losing patience"}.</span>
          <label className="field"><span className="label">Collecting from partners</span>
            <select value={t.collections} onChange={(e) => { setCollections(game, e.target.value as Collections); changed(); }}>
              {Object.entries(COLLECTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <span className="muted">{COLLECTIONS[t.collections].what} Money in transit costs interest; money we hold earns it.</span>
        </div>
      </div>

      <div className="split">
        <div className="panel stack tight">
          <h3>Audit and controls</h3>
          <label className="field"><span className="label">Internal controls</span>
            <select value={t.controls} onChange={(e) => { setControls(game, Number(e.target.value)); changed(); }}>
              {CONTROLS.map((c, i) => <option key={i} value={i}>{c.label} ({money(c.cost)} a year)</option>)}
            </select>
          </label>
          <span className="muted">Chance the next audit finds a problem: about {Math.round(findingChance(game) * 100)}% (estimate).</span>
          {t.findings.length === 0 && <span className="muted">No findings on file.</span>}
          {t.findings.slice(0, 10).map((f, i) => (
            <span key={i}>
              {f.year}: {f.text} <span className={f.severity === "material" ? "bad" : "muted"}>({f.severity}{f.repeat ? ", repeated" : ""})</span>{" "}
              {f.fixed ? <span className="muted">{f.fixed === "carried" ? "carried to the next audit" : `fixed ${shortDate(f.fixed)}`}</span>
                : <button className="btn small" onClick={() => act(remediate(game, i) ?? "Fixed before the next audit.")}>Fix ({money(f.cost)})</button>}
            </span>
          ))}
        </div>
        <div className="panel stack tight">
          <h3>Outside firms</h3>
          {(Object.keys(CONSULTANTS) as Consultant[]).map((k) => (
            <span key={k}>
              <strong>{CONSULTANTS[k].label}</strong> ({money(CONSULTANTS[k].cost)} for six months): {CONSULTANTS[k].what}{" "}
              {consulting(game, k) ? <span className="good">Engaged through {shortDate(t.consultants[k]!)}</span> : <button className="btn small" onClick={() => act(hireConsultant(game, k))}>Engage</button>}
            </span>
          ))}
        </div>
      </div>

      <div className="panel stack tight">
        <h3>Capital requests <Help k="capitalPool" /></h3>
        <span className="muted">Pool this league year: {money(pool.pool)} ({money(pool.cash)} of cash above the reserve, {money(pool.credit)} of credit, {money(pool.spent)} already approved). Investments pay off for five seasons.</span>
        <div className="table-wrap"><table>
          <thead><tr><th>Request</th><th>From</th><th className="num">Cost</th><th>What it does</th><th></th></tr></thead>
          <tbody>{capitalAsks(game).map((a) => (
            <tr key={a.kind}>
              <td className="name">{CAPITAL[a.kind].label}</td><td>{CAPITAL[a.kind].who}</td><td className="num">{money(a.amount)}</td><td>{CAPITAL[a.kind].what}</td>
              <td>{a.done ? <span className="good">In place</span> : <button className="btn small" disabled={!a.fits} onClick={() => act(approveCapital(game, a.kind))}>{a.fits ? "Approve" : "Over the pool"}</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="split">
        <div className="panel stack tight">
          <h3>Payroll by department</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Department</th><th className="num">Paid this year</th><th className="num">People</th></tr></thead>
            <tbody>{payrollByDept(game).map((r) => <tr key={r.dept} title={r.note}><td>{r.dept}</td><td className="num">{money(r.amount)}</td><td className="num">{r.people}</td></tr>)}</tbody>
          </table></div>
        </div>
        <div className="panel stack tight">
          <h3>Staff cuts</h3>
          <span className="muted">Cutting a department saves its share of cost from next month. Severance is a quarter of a year's savings; the work suffers in proportion, and the people who stay notice. Rehiring costs recruiting fees.</span>
          {(Object.keys(CUT_LABEL) as CutDept[]).map((d) => (
            <label key={d} className="field"><span className="label">{CUT_LABEL[d]}</span>
              <select value={cutShare(game, d)} onChange={(e) => act(cutDepartment(game, d, Number(e.target.value)))}>
                {[0, 0.05, 0.1, 0.15, 0.2, 0.3].map((x) => <option key={x} value={x}>{x ? `Cut ${Math.round(x * 100)}%` : "Full staff"}</option>)}
              </select>
            </label>
          ))}
        </div>
      </div>
      {t.log.length > 0 && <div className="panel stack tight"><h3>Treasury log</h3>{t.log.slice(0, 10).map((l, i) => <span key={i} className="muted">{shortDate(l.date)}: {l.text}</span>)}</div>}
    </div>
  );
}

export function Journal({ game }: { game: GameState }) {
  const [account, setAccount] = useState("");
  const [page, setPage] = useState(0);
  const tb = trialBalance(game);
  const rows = journal(game, undefined, account || undefined);
  const per = 50;
  return (
    <div className="stack">
      <div className="panel stack tight">
        <h3>Trial balance <Help k="trialBalance" /></h3>
        <span className={tb.ties ? "good" : "bad"}>{tb.ties ? "The books tie: debits equal credits and cash equals the ledger." : "The books don't tie."} Debits {money(tb.debits)}, credits {money(tb.credits)}.</span>
        <div className="table-wrap"><table>
          <thead><tr><th>Account</th><th className="num">Debits</th><th className="num">Credits</th><th className="num">Balance</th></tr></thead>
          <tbody>{tb.rows.map((r) => <tr key={r.account}><td><button className="link" onClick={() => { setAccount(r.account); setPage(0); }}>{r.account}</button></td><td className="num">{money(r.debit)}</td><td className="num">{money(r.credit)}</td><td className="num">{money(r.balance)}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="panel stack tight">
        <h3>Journal{account ? `: ${account}` : ""}</h3>
        {account && <button className="link" onClick={() => setAccount("")}>All accounts</button>}
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Memo</th><th>Debit</th><th>Credit</th><th className="num">Amount</th></tr></thead>
          <tbody>{rows.slice(page * per, page * per + per).map((j, i) => <tr key={i}><td>{j.date}</td><td>{j.memo}</td><td>{j.debit}</td><td>{j.credit}</td><td className="num">{money(j.amount)}</td></tr>)}</tbody>
        </table></div>
        <div className="btn-row">
          <button className="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
          <span className="muted">{rows.length ? `${page * per + 1}-${Math.min(rows.length, page * per + per)} of ${rows.length}` : "No entries"}</span>
          <button className="btn small" disabled={(page + 1) * per >= rows.length} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      </div>
    </div>
  );
}

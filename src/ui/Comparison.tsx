// A decision's options side by side (engine/compare.ts): the numbers each
// system worked out, the assumptions, and where the staff disagree.
import { useState } from "react";
import type { Comparison } from "../engine/compare";

export function ComparisonTable({ c, recommend }: { c: Comparison; recommend?: number }) {
  return (
    <div className="stack tight comparison">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Measure</span></th>
              {c.options.map((o, i) => (
                <th key={i} scope="col" title={o.note}>{o.label}{i === recommend ? <span className="muted"> (recommended)</span> : null}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {r.cells.map((x, i) => <td key={i}>{x}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.options.some((o) => o.note) && <span className="muted small">{c.options.filter((o) => o.note).map((o) => `${o.label}: ${(o.note ?? "").replace(/\.$/, "")}`).join(". ")}.</span>}
      <div><span className="label">Assumptions</span> <span className="muted">{c.assumptions.join(" ")}</span></div>
      {c.views.length > 0 && (
        <div className="stack tight">
          <span className="label">What the staff say</span>
          {c.views.map((v, i) => <span key={i}><strong>{v.who}:</strong> {v.text}</span>)}
        </div>
      )}
    </div>
  );
}

/** A "Compare options" toggle that works the comparison out only when opened. */
export function CompareToggle({ get, recommend, label = "Compare options" }: { get: () => Comparison | null; recommend?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const c = open ? get() : null;
  return (
    <div className="stack tight">
      <div><button className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide comparison" : label}</button></div>
      {open && (c ? <ComparisonTable c={c} recommend={recommend} /> : <span className="muted">The staff have no side-by-side for this one.</span>)}
    </div>
  );
}

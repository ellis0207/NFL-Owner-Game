import { yearCapHit } from "../engine/contracts";
import type { Deal } from "../engine/types";
import { money } from "./format";

const KIND_LABEL: Record<Deal["kind"], string> = {
  rookie: "Rookie contract", veteran: "Veteran contract", extension: "Extension", franchise: "Franchise tag",
  transition: "Transition tag", rfa: "Restricted free agent tender", erfa: "Exclusive rights tender",
  minimum: "Minimum deal", practice: "Practice squad deal",
};

/** Year-by-year view of a contract, the way a cap table shows it. */
export function ContractTable({ deal, from }: { deal: Deal; from?: number }) {
  const years = deal.years.filter((y) => from === undefined || y.year >= from);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Year</th><th className="num">Base</th><th className="num">Bonus (prorated)</th><th className="num">Other</th><th className="num">Guaranteed</th><th className="num">Cap hit</th></tr></thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.year}>
              <td>{y.year}{y.void ? " (void)" : ""}</td>
              <td className="num">{y.void ? "" : money(y.base)}{y.weeks && y.weeks < 18 ? ` (${y.weeks} wks)` : ""}</td>
              <td className="num">{money(y.proration)}</td>
              <td className="num">{y.void || !y.bonus ? "" : money(y.bonus)}</td>
              <td className="num">
                {y.guaranteed ? money(y.guaranteed) : ""}
                {y.injuryGuaranteed ? <span className="muted">{y.guaranteed ? " + " : ""}{money(y.injuryGuaranteed)} injury</span> : ""}
              </td>
              <td className="num"><strong>{money(yearCapHit(y))}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function dealSummary(deal: Deal): string {
  const real = deal.years.filter((y) => !y.void).length;
  const voids = deal.years.length - real;
  const parts = [KIND_LABEL[deal.kind], `${real} year${real === 1 ? "" : "s"}`, `${money(deal.total)} total`, `${money(deal.apy)} per year`];
  if (deal.guaranteedAtSigning) parts.push(`${money(deal.guaranteedAtSigning)} guaranteed at signing`);
  if (deal.signingBonus) parts.push(`${money(deal.signingBonus)} signing bonus`);
  if (voids) parts.push(`${voids} void year${voids === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

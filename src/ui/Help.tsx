// Contextual help and evidence labels. A small "?" next to an important
// figure explains the rule or calculation behind it; a label says whether a
// figure is confirmed, the staff's estimate, or someone's opinion. Ranges
// show how uncertain an estimate is.
import { useState } from "react";
import { money } from "./format";

export const HELP: Record<string, string> = {
  capSpace: "Cap space is the adjusted cap (the league cap plus money carried over and incentive credits) minus every counted cap hit and dead money. In the offseason only the 51 largest hits count.",
  capHit: "A player's cap hit for a year is his base salary, his signing and option bonus proration (spread evenly over at most five years), roster and workout bonuses, and incentives counted as likely to be earned.",
  deadMoney: "Dead money is bonus proration still to come and guaranteed salary owed to a released player; it counts on the cap with nobody playing for it. A June 1 release splits it over two years.",
  cashFloor: "The CBA makes the league spend 89% of the cap in cash over each four-year period; every team must pay at least that much to its players or pay the shortfall after the period.",
  operatingIncome: "Operating income is revenue minus operating costs, before depreciation, interest and owner taxes. Lenders test their covenants on it.",
  workingCapital: "Working capital is cash plus money owed to us (sponsor and broadcast invoices, the league's gate-pool share) minus what we owe vendors and the ticket money we hold for games not yet played.",
  dso: "Days to collect: how long sponsors and broadcasters take to pay their invoices on average.",
  dpo: "Days to pay: how long we take to pay vendors. Longer keeps cash in hand; too long strains the relationships.",
  capitalPool: "The capital pool is cash above the reserve plus half the unused credit line, less what's already been approved this league year. Every equipment and systems request draws from it.",
  deferred: "Season-ticket money is received before the games; until each game is played it's a liability, not income.",
  reserve: "The reserve is the months of operating costs and debt service the club keeps before paying the owner anything.",
  credibility: "Each audience judges the owner from what they've seen: votes and alliances for owners, covenants for lenders, candor for the press, treatment for players and staff, compliance for the league office.",
  hotSeat: "How insecure the head coach feels: your patience setting and firing record, the season against expectations, and the coverage. Coaches coaching for their jobs call more conservative games.",
  micromanagement: "How often you make or question decisions you delegated, over the last four months. Overcontrol slows tasks and wears down good managers.",
  trialBalance: "In double-entry books every entry has a debit and a credit of the same amount, so the totals must match and the cash account must equal the ledger.",
  severance: "A fired coach is owed the guaranteed share of the salary left on his contract, unless he's hired elsewhere first (the offset).",
  evidence: "Confirmed: a fact on the record. Estimate: the staff's model or projection, with a range. Opinion: someone's judgment.",
};

export function Help({ k, text }: { k?: string; text?: string }) {
  const [open, setOpen] = useState(false);
  const body = text ?? (k ? HELP[k] : "");
  if (!body) return null;
  return (
    <span className="help">
      <button className="link" aria-label="Explain" aria-expanded={open} title={body} onClick={() => setOpen(!open)}>?</button>
      {open && <span className="muted"> {body}</span>}
    </span>
  );
}

export function Evidence({ kind }: { kind: "confirmed" | "estimate" | "opinion" }) {
  const label = kind === "confirmed" ? "Confirmed" : kind === "estimate" ? "Estimate" : "Opinion";
  return <span className={`tag evidence-${kind}`} title={HELP.evidence}>{label}</span>;
}

/** An estimate with its likely range. */
export function Range({ mid, low, high, fmt = money }: { mid: number; low: number; high: number; fmt?: (x: number) => string }) {
  return <span title={`Likely between ${fmt(low)} and ${fmt(high)}`}>{fmt(mid)} <span className="muted">({fmt(low)} to {fmt(high)})</span></span>;
}

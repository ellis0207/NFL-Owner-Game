// The double-entry journal behind the ledger. Every line in the club's cash
// ledger is one journal entry with a debit and a credit of the same amount:
// money in debits cash and credits a revenue, a liability (deposits, loans)
// or the owner's equity; money out credits cash and debits an expense, an
// asset under construction, a loan being repaid or the owner's draws. The
// trial balance must tie: total debits equal total credits, and the cash
// account equals the ledger's balance.
import { business, CATEGORY } from "./business";
import type { GameState, LedgerCat, LedgerEntry } from "./types";

export interface JournalEntry { date: string; year: number; memo: string; debit: string; credit: string; amount: number }

/** The account on the other side of cash for each ledger category. */
const COUNTER: Partial<Record<LedgerCat, string>> = {
  deposits: "Deferred revenue: season-ticket deposits",
  capital: "Owner's equity: contributions",
  loanIn: "Loans payable",
  principal: "Loans payable",
  distribution: "Owner's equity: distributions",
  projects: "Construction in progress",
  seatLicenses: "Deferred revenue: seat licenses",
  escrow: "Funded guarantees held by the league",
};

export function accountFor(cat: LedgerCat): string {
  if (COUNTER[cat]) return COUNTER[cat]!;
  const c = CATEGORY[cat];
  if (!c) return `Other: ${cat}`;
  return `${c.side === "in" ? "Revenue" : "Expense"}: ${c.label}`;
}

function entryFor(e: LedgerEntry): JournalEntry {
  const account = accountFor(e.cat);
  const memo = e.note ?? CATEGORY[e.cat].label;
  // Money in debits cash; money out credits it. The sign of the ledger line decides, so refunds and credits reverse cleanly.
  return e.amount >= 0
    ? { date: e.date, year: e.year, memo, debit: "Cash", credit: account, amount: e.amount }
    : { date: e.date, year: e.year, memo, debit: account, credit: "Cash", amount: -e.amount };
}

/** Journal entries, newest first, for a league year (or all kept years), optionally for one account. */
export function journal(state: GameState, year?: number, account?: string): JournalEntry[] {
  const b = business(state);
  const out = b.ledger.filter((e) => year === undefined || e.year === year).map(entryFor);
  return (account ? out.filter((j) => j.debit === account || j.credit === account) : out).reverse();
}

export interface TrialRow { account: string; debit: number; credit: number; balance: number }

/** The trial balance over the kept ledger, with the opening balance carried into cash and retained earnings. */
export function trialBalance(state: GameState): { rows: TrialRow[]; debits: number; credits: number; cash: number; ties: boolean } {
  const b = business(state);
  const acc = new Map<string, { debit: number; credit: number }>();
  const add = (a: string, side: "debit" | "credit", amount: number) => {
    const r = acc.get(a) ?? { debit: 0, credit: 0 };
    r[side] += amount;
    acc.set(a, r);
  };
  // Years no longer kept in the ledger roll into the opening balance.
  if (b.opening >= 0) { add("Cash", "debit", b.opening); add("Retained earnings (opening)", "credit", b.opening); }
  else { add("Retained earnings (opening)", "debit", -b.opening); add("Cash", "credit", -b.opening); }
  for (const e of b.ledger) {
    const j = entryFor(e);
    add(j.debit, "debit", j.amount);
    add(j.credit, "credit", j.amount);
  }
  const rows = [...acc.entries()].map(([account, r]) => ({ account, debit: Math.round(r.debit), credit: Math.round(r.credit), balance: Math.round(r.debit - r.credit) }))
    .sort((a, b) => (a.account === "Cash" ? -1 : b.account === "Cash" ? 1 : a.account.localeCompare(b.account)));
  const debits = rows.reduce((t, r) => t + r.debit, 0);
  const credits = rows.reduce((t, r) => t + r.credit, 0);
  const cash = rows.find((r) => r.account === "Cash")?.balance ?? 0;
  const ledgerCash = b.opening + b.ledger.reduce((t, e) => t + e.amount, 0);
  return { rows, debits, credits, cash, ties: Math.abs(debits - credits) <= rows.length && Math.abs(cash - ledgerCash) <= rows.length };
}

# Regression cases

Each JSON file is a save the long-run checks once caught in an invalid state:
the club, the seed, the date it was found and what was wrong. `tests/balance-report.ts`
writes a file here for every hard error; `tests/regressions.test.ts` replays each
case (2026 starts; historical-start cases name their `era` and are replayed by the
scheduled run) and fails if `invariants` finds anything. Keep a case after it is
fixed so it stays fixed.

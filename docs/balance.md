# Release checks: long runs, hard errors and balance ranges

A change to the engine is ready to ship when the league it produces stays
legal and stays recognisably the NFL over several seasons. Two kinds of
finding come out of the checks, and they are handled differently:

- **Hard errors** are states the game must never reach. Any one fails the run
  (exit code 1), is written to `tests/regressions/` as a case, and blocks the
  release until fixed. The case stays in the folder afterwards so the fix is
  checked on every test run.
- **Balance warnings** are numbers drifting outside the ranges below. They
  are listed in the summary and the JSON, but don't fail the run: a single
  seed can wander, and a range is a judgement, not a rule. A warning that
  repeats across seeds or weeks is a tuning task.

## Hard errors

Checked by `invariants(state)` in `src/engine/invariants.ts` at the start of
the regular season, the trade deadline, the Super Bowl and the end of each
season:

| Rule | What it catches |
|---|---|
| `player-team` | A player on a team that doesn't exist |
| `contract-team` | A rostered or practice-squad player on another team's contract |
| `roster-count` | A negative roster, practice squad or injured-reserve count |
| `roster-limit` | More than 53 counted on a roster between the cutdown and the Super Bowl (suspended players are off the count, as in the league) |
| `cap-number`, `cash-number` | Cap space or club cash that isn't a finite number |
| `staff-duplicate` | Two head coaches or two GMs at one club |
| `user-team`, `ownership` | The owner's club missing, or one owner controlling two clubs |
| `duplicate-id` | Repeated ids among causes, memos, tasks or trade offers |

The report also counts **clubs over the cap once the new league year has
opened** (checked after that day is played, since compliance is due by 4 PM
that day). Any club over is a hard error.

## Balance ranges

| Measure | Range | Why |
|---|---|---|
| Seconds to simulate a season | 0 to 150 | Decades runs level off near 100 s; much slower means a hot loop crept in |
| Compressed save growth per season | 0 to 300 KB | Early seasons add 200 to 280 KB while capped logs fill; growth slows after |
| Head coaches fired per season | 2 to 12 | Real league: 4 to 10 changes a year |
| Trades per league year | 20 to 60 | Real league: 30 to 50 with a deadline rush (skipped for a new game's first year, which starts after the offseason's trades) |
| Top QB deal as a share of the cap | 0.12 to 0.27 | `marketCeiling` holds the top near 25% |
| Change in players worth over 8% of the cap, first to last season | -35% to +35% | Talent supply steady, no flood or drought |
| Standard deviation of win percentage | 0.13 to 0.25 | NFL seasons sit near 0.18 to 0.20 |
| Relocations per season | 0 to 0.5 | CPU moves should be rare |
| CPU clubs with negative cash | 0 to 4 | A few struggling clubs is fine; a wave means revenue or costs broke |

The ranges live in `RANGES` at the top of `tests/balance-report.ts`; change
both together.

## Running the checks

```
npx vite-node tests/balance-report.ts 3 7,11        # 3 seasons, seeds 7 and 11
ERA=2015 npx vite-node tests/balance-report.ts 3 7  # a historical start
RECESSION=2027 npx vite-node tests/balance-report.ts 4 23   # force a downturn in 2027
OUT=balance.json ...                                 # also write the rows as JSON
npx vitest run tests/regressions.test.ts             # replay saved cases, invariants at key dates
npx vitest run tests/roundtrip.test.ts               # a reloaded save plays on exactly like a running one
```

A season takes about a minute per seed.

## Where they run

- **Every pull request** (`.github/workflows/ci.yml`): type check, the full
  test suite (which includes `regressions.test.ts`) and the build.
- **Weekly and on demand** (`.github/workflows/long-run.yml`): six seasons for
  seeds 7, 11 and 19, a 2015 start, and a recession in 2027. Summaries and any
  new regression cases are uploaded with the run.

## Findings so far

- Nov 2026, first run: New England carried 54 in season. A waiver claim cut a
  suspended player to make room, but suspended players are already off the
  count, so no spot opened. `weakestOnRoster` now skips them
  (`tests/regressions/seed7-2026-09-09.json`).
- The same run, seed 11 in 2027: Atlanta activated a player from the PUP list
  and released a suspended player to make room, again 54. Every cut picker now
  uses `offTheCount` (`roster.ts`), and a player coming off a reserve list with
  a spot open no longer needs anyone released
  (`tests/regressions/seed11-2027-09-09.json`).
- Seed 7 in 2027: Cleveland put a suspended player on injured reserve and
  signed a replacement for a spot that was never his. A replacement is now
  signed only when the move opened a spot
  (`tests/regressions/seed7-2027-09-09.json`).
- The regression cases replayed by the tests didn't reproduce failures from
  the long run, because the run reloads its save each season. The market's
  price curves were cached on the state object and only cleared when a
  veteran signed, so a game left running priced free agents from stale
  curves while a reloaded one didn't. The cache now lasts one game day, and
  `tests/roundtrip.test.ts` checks that a save reloaded every day plays on
  identically through the cutdown and the cap deadline.
- Clubs over the cap at the league year were mostly a timing error in the
  check itself (it ran before that day's compliance cuts); it now runs after.
  One real case remained: seed 7's Green Bay sat $65M over three days before
  the 2029 league year, cut down to 44 players and was still $6M over. CPU
  teams over the coming cap now work on it every day for the last ten days,
  and a team still over at the roster floor keeps releasing its biggest
  savings (down to 36) rather than miss the deadline.

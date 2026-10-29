# NFL Owner Simulator: guide for Claude

Read this before exploring the code. It is the map; open files only for the
parts a task touches. README.md is the player-facing description of features.

## Ground rules

- The owner never sees a rating. `HIDDEN_RATINGS`, `HIDDEN_STAFF` and every
  `*Hidden` type are engine-only; the UI shows stats, contracts and staff
  reports (`reports.ts`, `perceivedAbility`, `coachView`). `coachView` sharpens
  with the practice reps in `state.program` (`coachRead` in `staff.ts`), so
  depth charts move during camp.
- Real data first (`data/`, built by `pipeline/`). Made-up things (agents,
  outlets, prospects, generated coaches) are labeled as such in comments.
- Everything is deterministic from the save's seed: use `rngFor(state, ...)`
  from `rng.ts`, never `Math.random`.
- Dates are ISO `yyyy-mm-dd` strings in Eastern time; compare them as strings.
- Comments explain the football or business rule, in plain sentences, like the
  ones already in the file. Match the surrounding style.

## Commands

```
npm test                    # all tests, dot output (~90 s with warm fixtures, ~3 min cold)
npx vitest run tests/<file> # one area while iterating
npm run build               # tsc + dist/index.html + dist/game.html (the claude.ai page, ~6 MB)
npx vite-node tests/<x>-report.ts [args]   # calibration reports (run from the repo root)
```

`tsc` only covers `src/`; tests are checked when vitest runs them.

## How the engine works

- **One mutable `GameState`** (`types.ts`, `interface GameState`). Engine
  functions take `state` and change it in place. The UI wraps every action in
  `step(fn)` in `ui/GameShell.tsx`, which runs it and calls `changed()` to
  re-render and autosave.
- **The day loop** is `advanceDay` in `season.ts`: the owner's pending events,
  games, then the daily hooks in this order: `offseasonDaily`,
  `carouselDaily`, `contractsDaily`, `capMovesDaily`, `faDaily`,
  `tradesDaily`, `springDaily`, `campDaily`, `ownersDaily`, `disciplineDaily`, `draftDaily`, `proDayDaily`, `collegeDaily`,
  `scoutingDaily`, weekly upkeep and playoffs, `businessDaily`, `commerceDaily`,
  `projectsDaily`, `mediaDaily`, `reviewDaily`, `pressDaily`. The day after the draft, `startNewSeason` (`seasons.ts`) rolls
  the league over. A new system adds an `xxxDaily(state)` and one line here.
- **Season context** lives in module globals in `league.ts`: `RULES`
  (`RULES.keyDates`, often aliased `K` or `KEY`), `SCHEDULE`, `GAMES_BY_DATE`.
  `setLeagueSeason` swaps them in place when a later season is applied, so a
  cached `K.draftStart` is right only for the season currently applied.
  `BASE_KEY_DATES` and `BASE_SCHEDULE` are always 2026.
- **Saves**: `save/codec.ts`. `migrate` brings old saves forward and calls the
  `ensureX(state)` helpers that create a system's slice of state when it is
  missing. A new optional field on `GameState` needs an `ensureX` (or a `??=`
  where it's read) so old saves still load. Saves must not change format
  without a migration.
- **Messages**: `send` (owner's inbox) and `news` (league wire) in `inbox.ts`;
  stories go through `addStory` in `outlets.ts`.

## Module map (`src/engine`)

| Area | Files | Tests / report |
|---|---|---|
| League data, dates, rng | `league.ts`, `dates.ts`, `rng.ts`, `types.ts` | |
| Calendar and the day loop | `calendar.ts` (key dates, schedules for any season), `season.ts` (new game, events, `advanceDay`), `seasons.ts` (rollover, history) | `events.test.ts`, `season.test.ts`, `seasons-report.ts` |
| Game sim | `sim.ts` (play by play), `schemes.ts`, `staff.ts` (scheme fit, staff effects), `stats.ts`, `standings.ts`, `injuries.ts`, `development.ts`, `careers.ts` (offseason growth, retirement) | `season.test.ts`, `calibrate.ts` |
| Cap and contracts | `contracts.ts` (deal model, CBA rules), `cap.ts` (cap hits, dead money, rollover), `capmoves.ts` (June 1, pay cuts), `market.ts` (prices, tags, tenders), `finance.ts` (cash) | `contracts.test.ts` |
| Negotiation | `agents.ts`, `negotiation.ts`, `grades.ts` | `negotiation.test.ts` |
| Rosters | `roster.ts` (cuts, 53, practice squad, IR), `waivers.ts` | `freeagency.test.ts` |
| Offseason | `offseason.ts` (tags, tenders, options, league year, restructures) | `offseason.test.ts`, `rosterbuilding.test.ts` |
| Free agency | `freeagency.ts` (market, bids, visits, street FAs) | `freeagency.test.ts`, `rosterbuilding.test.ts`, `fa-report.ts` |
| Trades | `trades.ts` (rules, picks, CPU valuation) | `trades.test.ts`, `trade-report.ts` |
| Staff | `coaches.ts` (people, contracts, aging), `carousel.ts` (firings, searches, hires) | `carousel.test.ts`, `carousel-report.ts` |
| College and draft | `collegeData.ts`, `college.ts`, `prospects.ts`, `scouting.ts`, `prodays.ts`, `draft.ts`, `names.ts` | `college.test.ts`, `college-report.ts`, `draft-report.ts` |
| Media | `outlets.ts`, `media.ts` (daily coverage), `press.ts` (questions, hidden effects), `review.ts` (offseason grades, fan expectations, storylines; `reviewDaily` after `mediaDaily`) | `media.test.ts`, `commerce.test.ts`, `media-report.ts` |
| Business | `business.ts` (books, gate, budgets), `stadiums.ts`, `commerce.ts` (named sponsors, local radio/TV, February offers), `projects.ts` (stadium and facility projects); `commerceDaily` and `projectsDaily` run after `businessDaily` | `business.test.ts`, `commerce.test.ts`, `business-report.ts` |
| Spring and camp | `spring.ts` (OTAs, minicamp, offseason injuries), `camp.ts` (practice reps, camp battles, `program(state)`), `discipline.ts` (suspensions, fines, owner decisions) | `camp.test.ts` |
| Owners and rules | `rules.ts` (rule catalog, `LEAGUE_RULES` read by the sim, `bindRules` in `applySeason`), `owners.ts` (relations, the March meeting, lobbying, votes, alliances) | `owners.test.ts` |

UI: `src/ui/GameShell.tsx` holds the nav (`SCREENS`) and renders
`src/ui/screens/<Name>Screen.tsx`; shared pieces are `ui.tsx`, `format.ts`,
`PlayerPanel.tsx`, `ContractTable.tsx`. A new screen is a file in `screens/`,
a name in `SCREENS`, and one render line.

## Reading big files

Twelve engine files run 900 to 1,430 lines. Don't read them whole:

- List what a file exports: `grep -n "^export" src/engine/<file>.ts`.
- Find a type: `grep -n "interface Foo" -A30 src/engine/types.ts` (types.ts is
  1,200 lines; never read it whole).
- Then read only the line range you need.

Split as you go: when a step adds a sizable new feature to a file that is
already over 1,000 lines, put it in a new module instead.

## Tests and calibration

- `tests/fixtures.ts` saves played games in `node_modules/.cache/nfl-fixtures`,
  keyed by a hash of `src/engine`, `src/save` and `data`.
  `stateAt(team, seed, at)` returns a copy at season end (`at` omitted), a 2026
  key-date name (`"draftStart"`) or a date. Use it in new tests instead of
  `newGame` plus a long `advanceDay` loop, unless the test is about the path
  (every-day coverage, determinism).
- While iterating, run only the affected test file. Run `npm test` once before
  the PR.
- Reports take `FROM=<key date|date|end>` to start from a saved state instead
  of a new game. Add `FIXTURES=stale` to reuse a state saved by older code, so
  tuning the offseason doesn't replay the season every run:
  `FIXTURES=stale FROM=end npx vite-node tests/fa-report.ts 7`.
  Finish with one full run without them.

Calibration targets (what "healthy" looked like when each system shipped):

- Season sim (`calibrate.ts`, `season.test.ts`): NFL-like scoring, home edge
  and parity; upsets common.
- Seasons loop (`seasons-report.ts 4 7`, about 1 min a season): top-30
  talent steady year to year; ~32 comp picks a year; 85+ players drift slowly
  (446 to ~420 over four seasons); every team near or under the cap by year 4.
- Carousel (`carousel-report.ts 3 11`): 2 to 10 HC changes a year, no search
  left open, ~600 to 630 people tracked.
- Trades (`trade-report.ts`): ~30 to 50 a year with a deadline rush.
- Long careers (`longrun-report.ts 11 7`, about 1.5 min a season): 3 to 7
  CPU tags a year; market tops steady (QB top deal at most ~25% of the cap,
  set by `marketCeiling` in `market.ts`); league-wide player cash near 100%
  of the cap; every team at or over zero space at each rollover.
- Old saves: `saves.test.ts` loads gzipped saves made by earlier versions
  (`tests/saves/`). Add one when a step changes the save shape.
- Known lessons: fixed-dollar thresholds break as the cap grows (scale with
  `capScale` in `market.ts`); CPU bids must target players a team can afford;
  extensions must fit next year's cap; trades count the dead money they leave;
  a deal's share of the cap must be measured on the same cap it was priced on
  (`capAtSigning`), or every market ratchets up; anything that pays a player
  must call `payCash` (`finance.ts`) or the cash side drifts from the cap.

## Shipping a step

1. Branch, build, iterate with targeted tests and quick reports.
2. `npm test` and `npm run build` once, then open the PR, merge it yourself.
3. Republish `dist/game.html` to the same artifact URL (kept in project
   memory) with its existing capabilities. Don't print or Read the 6 MB page.
4. Update README.md (Status and Code layout) only for what changed, and the
   project memory for anything a later step needs.

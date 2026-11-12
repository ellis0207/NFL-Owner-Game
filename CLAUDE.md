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
  `carouselDaily`, `positionCoachesDaily`, `contractsDaily`, `contractExtrasDaily`, `incentivesDaily`, `capMovesDaily`, `faDaily`,
  `tradesDaily`, `springDaily`, `campDaily`, `coachRoomDaily`, `ownersDaily`, `leagueOfficeDaily`, `laborDaily`, `leagueMoneyDaily`, `complianceDaily`, `crisisDaily`, `legalDaily`, `hostingDaily`, `disciplineDaily`, `draftDaily`, `visitsDaily`, `proDayDaily`, `collegeDaily`,
  `scoutingDaily`, `scoutOpsDaily`, weekly upkeep and playoffs, `economyDaily`, `businessDaily`, `shocksDaily`, `commerceDaily`, `fansDaily`, `sponsorsDaily`, `merchDaily`, `teamMediaDaily`, `facilitiesDaily`, `communityDaily`, `departmentsDaily`,
  `projectsDaily`, `constructionDaily`, `politicsDaily`, `relocationDaily`, `globalDaily`, `leasesDaily`, `debtDaily`, `booksDaily`, `treasuryDaily`, `investorsDaily`, `wealthDaily`, `franchiseDaily`, `takeoverDaily`, `successionDaily`, `officeDaily`, `peopleDaily`, `standingDaily`, `gameOpsDaily`, `analyticsDaily`, `analystsDaily`, `lockerDaily`, `trainingDaily`, `medicalDaily`, `careDaily`, `gameWeekDaily`, `bonusesDaily`, `honorsDaily`, `hindsightDaily`, `recordsDaily`, `mediaDaily`, `reviewDaily`, `pressDaily`. The day after the draft, `startNewSeason` (`seasons.ts`) rolls
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
| Game sim | `sim.ts` (play by play), `playlog.ts` (the feed: `Recorder`, drive chart, kept `KEEP_DAYS` in `state.pbp`; words use their own rng so results don't move), `officials.ts` (wrong rulings, challenges, booth review, disputed calls in `box.calls`; own rng), `gameops.ts` (home-game operations check, league inquiries, prunes play logs; `gameOpsDaily` after `officeDaily`), `analytics.ts` (EP table fitted to the sim's own next-score values: refit if scoring shifts, EPA, WP; `box.adv`/`box.pe`), `strategy.ts` (analytics department, `gamePlan` for every team each game, halftime adjustments, `fourthDownAdvice` for the user only, `updateTrends` at rollover, `analyticsDaily`), `outlook.ts` (attribution, needs), `gameday.ts` (weather, rest and travel), `schemes.ts`, `staff.ts` (scheme fit, staff effects), `stats.ts`, `standings.ts`, `injuries.ts` (slow returns, lasting damage), `development.ts`, `careers.ts` (offseason growth, retirement), `simtactics.ts` (tendencies and self-scouting, blitz pickup and slides, `poise`, return and punt plans, `innovate` at rollover), `assess.ts` (position assessments from box scores) | `season.test.ts`, `gameday.test.ts`, `playlog.test.ts`, `analytics.test.ts`, `calibrate.ts` |
| Players and medical | `clubhouse.ts` (world-seeded `personality`, chemistry and its small sim edge, leaders, mentors, coach trust nudging `coachView`, roles, marketability and the store lift, personal leave; `posOf` for moved players; `lockerDaily`), `training.ts` (programs and their cost on the medical line, practice load, `growthFactor`/`offseasonFactor`/`riskFactor`, development plans, position changes with `retrainEffect` in `ability`; `trainingDaily`), `medical.ts` (`diagnose` from `injure` on its own rng, `knownReturn` for anything the owner reads, rehab midpoints, concussion clearance, early-return asks, protocol reviews, insurance; `medicalDaily`), `gameweek.ts` (practice reports, practice emphasis feeding `gamePlan` and growth, emergency list, `joinedToday` game-day cutoff read by the sim; `gameWeekDaily`), `playercare.ts` (playbook learning and `careDrag` in `trait`, snap load, `trainingResponse`, `retirementLean`, `ownerStanding`/`franchiseReputation` in FA, doctors feeding `diagnose` and rehab, `comparables`; `careDaily`), `analysts.ts` (named analysts, `analystEdge` in `gamePlan`, data feeds, contract/availability models, cap optimizer, experiments whose `adopted` effect feeds training, fans and morale; `analystsDaily`), `coachroom.ts` (preseason snaps, bubble meeting and `ownerKeeps` in the cutdown, `applyContingency` in `depthChart`; `coachRoomDaily`) | `clubhouse.test.ts`, `gameweek.test.ts`, `football-followups.test.ts` |
| Cap and contracts | `contracts.ts` (deal model, CBA rules), `cap.ts` (cap hits, dead money, rollover), `incentives.ts` (LTBE/NLTBE, settled after the Super Bowl), `capmoves.ts` (June 1, pay cuts), `capplan.ts` (`lockedSpace` for future-year gates, the league-year deadline), `market.ts` (prices, tags, tenders), `finance.ts` (cash), `bonuses.ts` (per-game and workout bonuses and escalators via `attachBonuses`, owner terms through `OfferTerms.perGame/workout/escalator` priced by `bonusTermsValue`, settled after the Super Bowl and minicamp; the proven performance escalator; the four-year cash floor; `bonusesDaily`), `contractextras.ts` (roster and option bonuses, skill/cap guarantees via `releaseCharges` `reason`, no-trade, `cashVsCap`, `capPlanner`, `compFormula` used by the draft, our RFA offer sheets; `contractExtrasDaily`) | `contracts.test.ts`, `incentives.test.ts`, `capdeadline.test.ts` |
| Negotiation | `agents.ts`, `negotiation.ts`, `grades.ts`, `redo.ts` (early redo asks; camp hold-ins via `startHoldouts`) | `negotiation.test.ts`, `redo.test.ts` |
| Rosters | `roster.ts` (cuts, 53, practice squad, IR returns, PUP/NFI), `waivers.ts` (`claimOdds`) | `freeagency.test.ts` |
| Offseason | `offseason.ts` (tags, tenders, options, league year, restructures) | `offseason.test.ts`, `rosterbuilding.test.ts` |
| Free agency | `freeagency.ts` (market, bids, visits, street FAs) | `freeagency.test.ts`, `rosterbuilding.test.ts`, `fa-report.ts` |
| Trades | `trades.ts` (rules, picks, CPU valuation), `conditions.ts` (conditional picks, settled in `tradesDaily`) | `trades.test.ts`, `conditions.test.ts`, `trade-report.ts` |
| Staff | `coaches.ts` (people, contracts, aging), `carousel.ts` (firings, searches, hires), `hiring.ts` (interview rules for playoff teams), `positionCoaches.ts` (position rooms, teaching, HC hires with owner approval) | `carousel.test.ts`, `positioncoaches.test.ts`, `carousel-report.ts` |
| College and draft | `collegeData.ts`, `college.ts`, `prospects.ts`, `scouting.ts`, `scouts.ts` (the user's area scouts, leans via `leanBias`, emphasis), `prodays.ts`, `draft.ts`, `names.ts`, `visits.ts` (combine medicals and interviews, top-30 visits, private workouts; `visitsDaily` after `draftDaily`), `scoutops.ts` (budget split via `splitFactors` in scouting, national and pro scouts, `advanceBonus` in `gamePlan`, `draftBoards`, `adjustedProduction`, undrafted race in `udfaRush`; `scoutOpsDaily`) | `college.test.ts`, `visits.test.ts`, `college-report.ts`, `draft-report.ts` |
| History | `seasons.ts` (`history(state)`: standings, drafts, stats), `honors.ts` (Pro Bowl late Dec, All-Pro before wild card, awards and Hall of Fame at SB-3; `production`/`ELITE` score seasons; `proBowls` feeds option tiers), `records.ts` (real NFL marks, save bests, `h2h` rivalries, `tradeOutcomes`, `eras`, `contractMilestones`, `clubTimeline`, valuations at SB+1; `execBios`, `ruleEras`, `ownerEras`), `careerstats.ts` (`data/league-2026/career.json` from `pipeline/career_stats.py`, 2005 on, plus live seasons; milestones, `careerLeaders`, `eraRankings`), `hindsight.ts` (draft/signing re-grades 2 and 4 seasons on, scouting record, coaching grades; `hindsightDaily`) | `history.test.ts`, `football-followups.test.ts` |
| Media | `outlets.ts`, `media.ts` (daily coverage), `press.ts` (questions, hidden effects), `review.ts` (offseason grades, fan expectations, storylines; `reviewDaily` after `mediaDaily`) | `media.test.ts`, `commerce.test.ts`, `media-report.ts` |
| Club finance | `books.ts` (accrual statements, balance sheet, cash flow, budget vs actual, forecast, year close and audit; `booksDaily`), `debt.ts` (credit facility, term loans, covenants, market rate, league debt limit; `debtDaily`), `ownership.ts` (owner profile and money, goals, scorecard, legacy, taxes) | `finance.test.ts` |
| Front office | `executives.ts` (executives, deputies, chart, searches, `execBoost` used by debt/commerce/business), `delegation.ts` (decision modes, limits, alerts, audit trail `noteDecision`, `addMemo`), `memos.ts` (memo decisions, delegated actions, meetings, tasks, incidents, reviews; `officeDaily`), `culture.ts` (GM trust, GM-coach cooperation, fairness, relationships, leaks, development budget), `workplace.ts` (monthly disputes, complaints, resignations, culture readings; run from `officeDaily`). The GM's bids for the user team in `freeagency.ts` follow the signings mode | `office.test.ts`, `culture.test.ts` |
| Owner's office | `treasury.ts` (supplier terms, controls, audit findings after the books close, consultants, the capital pool and `invested` effects read by analysts/training/playercare/scoutops/fans/memos, `payrollByDept`, layoffs via `cutShare`/`cutQuality`; `treasuryDaily` after `booksDaily`), `journal.ts` (double-entry view of the ledger, `trialBalance`), `people.ts` (memory `remember`/`regard`, micromanagement, working conditions, QC coaches and `qcBonus` in `gamePlan`, promotions, succession, `extendCoach` guarantees and `severanceOwed` used by `fire`, `hotSeat`/`hotSeatDrag`, mandates in exec reviews, calendar, agenda order in `holdMeeting`; `peopleDaily`), `standing.ts` (eight audiences, public stance and leaked interference, officials and `officialsLean` in `cityGoodwill`, scandal memos via `resolveStandingMemo`, trends; `standingDaily`), `desk.ts` (desk ranking, memo follow-ups, saved reports, play modes, realism preset, sandbox, info levels), `investors.ts` (partners and `ownerShare` read by `ownerEquity`/`closeOwnerYear`, `shareDistribution` in `ownerCash`, `callCapital` in `creditCheck`, stake sales through bid memos (`resolveInvestorMemo` from the general memo case), `reserved` board votes called by `acceptLoan`/`fileRelocation`/`closeFinancing`, bridge loans, `returns`, `forceSale` for tests; `investorsDaily` after `treasuryDaily`; Ownership page), `wealth.ts` (the owner's holdings kept in step with `owner.outside` by `syncHoldings`, monthly returns from the economy, personal-debt interest and margin calls, family office and trust, foundation with `giftDeduction` in `closeOwnerYear`, visibility and profile, business-conflict memos via `resolveWealthMemo`; `wealthDaily`; Owner > Money tab in `OwnerMoney.tsx`), `franchisemarket.ts` (appraisals, listings and CPU sales with `control` over `CONTROL`, the player's `deal` through diligence, bids, financing within `LEAGUE_DEBT_LIMIT`, the owners' vote; `franchiseDaily`; Ownership > Deals in `OwnershipDeals.tsx`), `takeover.ts` (`tenure` role control/buyer/minority with `ownerShare` honoring it, `closeDeal` selling the old club and `switchClub` rebuilding the `CLUB_SLICES`, `startAsBuyer`/`startAsMinority` from `OwnerSetup.entry`, `buyMore`, read-only pages in GameShell when not `inControl`; `takeoverDaily`), `succession.ts` (owner age/health and `mortality`, involvement, heirs read through `heirReport`, successor/trustee and league pre-approval, estate `liquidity` and insurance, `offerBuyout` via `buyOut`, `sellClub` with `saleNet`, family disputes, `endTenure` memo choosing heir / estate sale / `endGame`, `legacyReview`, `isGameOver` reads `succession.ended`, `startAsHeir`; `successionDaily`; Ownership > Succession in `OwnershipSuccession.tsx`, History > Owners). `late.ts` holds late-bound functions that break load-order loops | `office-followups.test.ts`, `investors.test.ts`, `wealth.test.ts`, `franchise.test.ts`, `succession.test.ts` |
| Stadium building | `construction.ts` (feasibility studies and sites, design, `baseCost` scaled by the cap, roof and `constructionFactor`, financing with `stadiumLoan`/`leagueStadiumLoan` in `debt.ts` and seat licenses, contractor bids and contract types, monthly build events and overruns, temporary home via `tempVenueFactor` in `homeGate`, opening with `newStadiumLift` in `projectEffects`; CPU builds seeded from the real projects; `bindConstruction` in `applySeason` lays opened buildings over `STADIUM_BY_TEAM` and then calls `bindLeases`; `fastTrack` for tests; `constructionDaily`), `politics.ts` (the public ask split by model, `voterSupport`, impact and independent studies, environmental review, rival suburbs, 9-member council vote, Election Day referendum on a tax district, rejection choices incl. `exploreRelocation`, sponsors' stadium question; `politicsDaily`). Both run after `projectsDaily` | `construction.test.ts` |
| Relocation and global | `relocation.ts` (open and second-team markets, `marketStudy`, `exitCosts` from the lease and the stay pledge, `relocationFee` over ten years, Jan 1-Feb 15 applications, committee review, the 24-vote decision weighing good faith, the move ending local deals and resetting fans, identity via the merch rebrand, `moveGateFactor` in `homeGate`, realignment votes, `cpuStadiumFailed` called by construction's failed deals; `bindRelocation` (lazy snapshots of `METRO`, `MARKETS`, `CLIMATE` in gameday.ts, `PLACE` in departments.ts, stadiums and team city/division) runs inside `bindConstruction` and before `buildSchedule` at rollover; `forceMove` for tests; `relocationDaily`), `global.ts` (league-granted market rights, content/events/merch levels, audiences and tracking, FX drift and hedges, sponsors outside `LEAGUE_CATEGORIES`, games abroad, the International Player Pathway with `ipp` players exempt in `psRoom`, `restorePathway` on load; `globalDaily`). Ledger categories `relocation` (non-operating) and `global` | `relocation.test.ts` |
| Business | `business.ts` (ledger, gate via `gateModel`/`inputs`, budgets, renewals), `stadiums.ts`, `commerce.ts` (named sponsors incl. digital, practice facility and stadium naming where `controlsNaming`, local radio/TV, February offers with exclusivity), `sponsors.ts` (inventory, `rightsConflict`, naming deals, deliverables and make-goods, account `rel`, defaults, scandals; `sponsorsDaily`), `ticketing.ts` (`sellGeneral`: four price zones, game tiers, dynamic pricing, groups, promotions, resale, no-shows; premium use and hospitality; `planRenewals` by tenure with the waiting list; seat licenses; research; state in `business.tix`), `fans.ts` (approximate `METRO` data, `fanDemand`/`priceSensitivity` fed into `inputs`, segments, trust and scar, core loyalty, reach, surveys, lifetime value; `fansDaily`), `merch.ts` (jersey orders by player, stores and online channels, counterfeits, markdowns and liquidation, licensing, rebrands with league approval and `bindBrand` renaming `TEAM_BY_ID`, throwbacks; `merchDaily`; state in `state.merch`), `teammedia.ts` (the league's TV deals and opt-out outlook, content staff and shows, followers and `audienceLift` for digital deals, beat writers' notebooks, `spokesperson`, headline archive and sagas; `teamMediaDaily`), `venue.ts` (game-day plan, lines, food, faults, incidents, inspections, complaints, event P&L, experiments; `venueGame` called from `homeGate`), `facilities.ts` (stadium and team-facility parts with wear, the director's `readOf` or a study, the maintenance plan and `upkeepLines` splitting the stadium line, backlog, surface, `faultFactor`/`networkFactor` for the venue, `facilityPull` in free agency, stadium value, project payback, yearly survey; `facilitiesDaily`), `community.ts` (foundation and grants, programs, appearances, player services with `disciplineCut`/`loyaltyPull`, alumni, `cityGoodwill` in lease talks, `communityScore` in the scorecard; `communityDaily`), `departments.ts` (travel with `roadTrip` reports and `travelEdge` in `gameday.ts`, security with `securityFactor` and `gamblingCut`, IT systems and incident memos resolved by `resolveIncident`; `departmentsDaily`), `projects.ts` (stadium and facility projects), `leases.ts` (lease renewals with the city, laid over `STADIUM_BY_TEAM` by `bindLeases`); `commerceDaily`, `fansDaily`, `sponsorsDaily`, `merchDaily`, `teamMediaDaily`, `facilitiesDaily`, `communityDaily`, `departmentsDaily`, `projectsDaily` and `leasesDaily` run after `businessDaily` | `business.test.ts`, `commerce.test.ts`, `leases.test.ts`, `selling.test.ts`, `merch.test.ts`, `teammedia.test.ts`, `venue.test.ts`, `facilities.test.ts`, `community.test.ts`, `departments.test.ts`, `business-report.ts` |
| Spring and camp | `spring.ts` (OTAs, minicamp, offseason injuries), `camp.ts` (practice reps, camp battles, `program(state)`), `discipline.ts` (suspensions, fines, owner decisions) | `camp.test.ts` |
| Owners and rules | `rules.ts` (rule catalog, `LEAGUE_RULES` read by the sim, `bindRules` in `applySeason`), `owners.ts` (relations, the March meeting, lobbying, votes, alliances), `hosting.ts` (Super Bowl and draft bids, host effects), `format.ts` (leaf module: `FORMAT` games/byes/weeks for the applied season, `formatFor(season)` bound by `bindSeasonFormat` in `rules.ts`; use `FORMAT.weeks`/`FORMAT.games`, never 17 or 18), `leaguemoney.ts` (revenue pools, monthly distribution with a holdback, the April 15 true-up and disputes, gate sharing and premium pool, TV renewals and opt-out, `capMediaBump` read by `setCap`; `leagueMoneyDaily`), `leagueoffice.ts` (made-up commissioner, committees and seats, issue stances and coalitions via `issuePull` in `support`, amendments to one-season trials (`until` on adopted rules, honored by `rulesFor`), briefings, technology trials, `scheduleDraw` for `buildSchedule`, flex and emergency moves after 2026; `leagueOfficeDaily`) | `owners.test.ts`, `hosting.test.ts`, `league-office.test.ts` |
| Compliance and legal | `compliance.ts` (office staffing and `violationRisk`, roster and yearly filings, certifications, guarantee funding in escrow (`escrow` ledger category, a balance-sheet asset) or a letter of credit, June cap audit, `tradePhysicals` called by `completeTrade` for our trades, league cases inquiry→interviews→findings→sanctioned→appeal with `forfeited` picks dropped by `buildOrder`/`picksOf`, strikes; CPU cases ~3 a year; `complianceDaily`), `crisis.ts` (crisis team, `PLAYBOOK` steps, fact-finding, findings judged against what we said, lasting `scar`, remediation; `crisisDaily`), `legal.ts` (club companies, `TERMS`, `authorization`, counsel's review of signings, matters negotiation→mediation→arbitration/litigation, `exposure`, access and retention policies; `legalDaily`). UI on the Legal page | `compliance.test.ts` |
| Economy and shocks | `economy.ts` (national economy monthly with condition-driven recessions, metro economies, `demandFactor` (also sets `fans.economy`) / `corporateFactor` / `wageFactor` / `constructionFactor` / `rateLean` in `marketRate` / `broadcastLean` in the streaming walk / `multipleShift` in `valuation`, `cpiFor`/`realDollars`, `forecastBand` in the books forecast, `scenario`, `VOLATILITY` setting; `economyDaily` before `businessDaily`), `shocks.ts` (stadium disruptions with `disruptGate` in `homeGate`, revenue and cost shocks, insurance covers priced by `riskScore`, the `insurance` ledger line offset on the stadium line, claims with disputes, `liabilityShare` read by legal.ts, distress and league supervision blocking distributions; `shocksDaily` after `businessDaily`). `longrun-report` takes `RECESSION=<year>` to force a downturn | `economy.test.ts` |
| Labor | `labor.ts` (the union, the 2020 CBA through 2030, talks with owners' and union proposals and `dealTerms` (the 18th game only for a 49.5%+ share), our stance and priorities weighted by the `labor` committee seat, hazard-paced deals (`laborOdds`: ~60% before the deadline, ~30% offseason lockout, ~5% lost games), lockouts that skip `contractsDaily`/`faDaily`/`tradesDaily`/`springDaily`/`campDaily` and block `checkOffer`/`proposeTrade`/`canSignAtMinimum`, cancelled games via `cancelGame` in `playGame` with deposit refunds and `distributionCut`, the 24-vote and ratification, `laborDrag` in the economy factors, grievances; `forceDeal`/`forceLockout` for tests; `laborDaily` after `leagueOfficeDaily`), `cbaterms.ts` (leaf: `termsFor(year)` read by `projectedCap`, `minimumSalary`, `rookieScale`, the benefits line, training risk/growth and the cash floor; bound by `bindLabor` in `applySeason`) | `labor.test.ts` |

Settings (`state.settings`): `capRules`, `finances`, `scouting` (`fogOf` in `staff.ts` widens only the user's reads), `ironman`, `pause` (multi-day sims in `season.ts`). Display preferences (text size, contrast, theme, folded sidebar groups, Today panels) live in browser storage via `ui/prefs.ts`.

UI: `src/ui/nav.ts` lists the pages by sidebar group (`NAV`, with `PAGE_HINT`
for page search); `src/ui/GameShell.tsx` holds the sidebar and renders
`src/ui/screens/<Name>Screen.tsx`; shared pieces are `ui.tsx`, `format.ts`,
`PlayerPanel.tsx`, `ContractTable.tsx`. A new screen is a file in `screens/`,
a name in a `NAV` group plus a `PAGE_HINT` line, and one render line.

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
  left open, ~880 people tracked (with position coaches).
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

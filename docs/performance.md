# Performance

## Where a season's time goes

The profile was taken in November 2026 with
`NODE_OPTIONS=--cpu-prof npx vite-node <script>`, simulating the 2026 season
from a new game for one seed. That season took 55 s.

No single system dominates. The largest costs by self time:

| Function | Self time | What it is |
|---|---|---|
| `perceivedAbility` (`staff.ts`) | 4.5 s | Every read of a player by a staff or the market. It's called everywhere, cheap each time, and inherent to the no-ratings design. |
| `teamSnapTotals` (`seasons.ts`) | 3.0 s | Rebuilt from every box score on each call. It's now cached with the season totals it derives from. |
| `teaching` and `roomStaff` (`positionCoaches.ts`) | 4.7 s | Each room scanned the whole coaching pool on its own. Now one pass fills a team's rooms. |
| `seasonTotals` (`stats.ts`) | 2.2 s | Mostly the cache key, which counts the box scores. |
| `addDate`, `weekday`, `dayOfWeek` | 3 s together | Date arithmetic in many loops. |

By inclusive time, the daily hooks that cost most are contracts and free
agency (5.7 s each), trades (4.1 s), the depth chart (3.8 s), games (3.5 s)
and the market curves (3.2 s).

After the two fixes above, the same season takes 47 s.

## Long sims off the page

A week, a run to game day or a jump to the next offseason event now goes
through `src/sim/runner.ts`. Each day is reported to the progress panel, and
Stop takes effect after the current day.

**On a host that allows it, the run happens in a worker.** The worker is
started from the page's own inline script, so the single-file build still
carries one copy of the engine and the data. Each run hands the save to the
worker and gets the save back, and loading that save re-binds the season's
rules and schedule on the page.

**Otherwise the page runs the days itself.** That happens when the page is
opened from a file, or the host blocks blob workers. Each day is still
reported, with a pause between days for painting and for Stop.

## What's next

- **A simulation context.** The season's rules, schedule and team bindings are
  module-level state in `league.ts` and friends. The worker sidesteps this
  because it has its own copy of every module. Moving them into a context
  passed with the state would let tests and tools run two games side by side
  without resetting modules.
- **A hosted split build.** We kept the single file. A split build would let
  the worker load an engine-only chunk, and let the browser cache the 6 MB of
  data across versions. It's worth doing if the game is hosted somewhere that
  serves separate files.

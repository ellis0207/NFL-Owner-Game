"""Real career stats before the three seasons in players.json.

Every player on file gets his regular-season totals back to his rookie year
(nflverse player stats start in 1999). Season totals only, one row per season
and team, in a compact column table so the bundle stays small. The game joins
these rows to the 2023-2025 rows in players.json and to the seasons it plays,
which is the career line a Hall of Fame vote or a career record reads.

Run from the repo root: python pipeline/career_stats.py
"""

import json
import math
from pathlib import Path

import pandas as pd

from sources import HISTORY_SEASONS, _fetch

OUT = Path(__file__).parent.parent / "data" / "league-2026" / "career.json"

# Counting stats only: rates and EPA are derived from them or not needed for
# career marks.
COLS = {
    "games": "g",
    "completions": "cmp", "attempts": "att", "passing_yards": "passYds", "passing_tds": "passTd",
    "passing_interceptions": "int", "sacks_suffered": "sacked",
    "carries": "car", "rushing_yards": "rushYds", "rushing_tds": "rushTd",
    "targets": "tgt", "receptions": "rec", "receiving_yards": "recYds", "receiving_tds": "recTd",
    "def_tackles_solo": "tklSolo", "def_tackle_assists": "tklAst", "def_tackles_for_loss": "tfl",
    "def_sacks": "sacks", "def_qb_hits": "qbHits", "def_interceptions": "defInt",
    "def_pass_defended": "pd", "def_fumbles_forced": "ff", "def_tds": "defTd",
    "fg_made": "fgm", "fg_att": "fga", "pat_made": "xpm", "pat_att": "xpa",
    "punt_returns": "pr", "punt_return_yards": "prYds", "kickoff_returns": "kr", "kickoff_return_yards": "krYds",
}


def _num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0
    f = float(v)
    return int(f) if f.is_integer() else round(f, 1)


def main() -> None:
    players = json.loads((OUT.parent / "players.json").read_text())
    ids = {p["id"]: p for p in players}
    first = min((p.get("rookieYear") or HISTORY_SEASONS[0]) for p in players)
    first = max(first, 1999)
    out: dict[str, list] = {}
    for season in range(first, HISTORY_SEASONS[0]):
        df = pd.read_csv(_fetch(f"stats_player/stats_player_reg_{season}.csv", False), low_memory=False)
        df = df[df.player_id.isin(ids)]
        for row in df.to_dict("records"):
            p = ids[row["player_id"]]
            if p.get("rookieYear") and season < p["rookieYear"]:
                continue
            vals = [_num(row.get(c)) for c in COLS]
            if not any(vals):
                continue
            out.setdefault(row["player_id"], []).append([season, row.get("recent_team") or row.get("team") or ""] + vals)
    payload = {"cols": ["season", "team"] + list(COLS.values()), "players": out}
    OUT.write_text(json.dumps(payload, separators=(",", ":")))
    rows = sum(len(v) for v in out.values())
    print(f"{len(out)} players, {rows} seasons {first}-{HISTORY_SEASONS[0] - 1}, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

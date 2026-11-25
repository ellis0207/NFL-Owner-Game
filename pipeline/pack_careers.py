"""Adds each player's real career before a pack's three stat seasons to that
season's data pack, so a historical start knows a veteran's whole career
(nflverse player stats begin in 1999).

    python pipeline/pack_careers.py            # every pack in data/packs
    python pipeline/pack_careers.py 2006       # one

Writes the same column table as data/league-2026/career.json under the pack's
"career" key. Nothing else in the pack changes, so older packs can be updated
without rebuilding their rosters.
"""

import gzip
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from career_stats import COLS, _num  # noqa: E402
from constants import TEAM_CODE_FIX  # noqa: E402
from sources import _fetch  # noqa: E402

PACKS = Path(__file__).parent.parent / "data" / "packs"
_stats: dict = {}


def season_stats(season: int) -> pd.DataFrame:
    if season not in _stats:
        _stats[season] = pd.read_csv(_fetch(f"stats_player/stats_player_reg_{season}.csv", False), low_memory=False)
    return _stats[season]


def add(season: int) -> None:
    path = PACKS / f"{season}.json.gz"
    pack = json.loads(gzip.decompress(path.read_bytes()))
    ids = {p["id"]: p for p in pack["players"] if isinstance(p.get("id"), str)}
    out: dict[str, list] = {}
    # The pack's own players carry the three seasons before the start; the career is everything before those.
    for year in range(1999, season - 3):
        df = season_stats(year)
        df = df[df.player_id.isin(ids)]
        for row in df.to_dict("records"):
            rookie = ids[row["player_id"]].get("rookieYear")
            if rookie and year < rookie:
                continue
            vals = [_num(row.get(c)) for c in COLS]
            if any(vals):
                team = row.get("recent_team") or row.get("team") or ""
                out.setdefault(row["player_id"], []).append([year, TEAM_CODE_FIX.get(team, team)] + vals)
    pack["career"] = {"cols": ["season", "team"] + list(COLS.values()), "players": out}
    raw = json.dumps(pack, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    path.write_bytes(gzip.compress(raw, 9, mtime=0))
    print(f"{season}: {len(out)} careers, {sum(len(v) for v in out.values())} seasons, {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    years = [int(a) for a in sys.argv[1:]] or sorted(int(p.name[:4]) for p in PACKS.glob("*.json.gz"))
    for y in years:
        add(y)

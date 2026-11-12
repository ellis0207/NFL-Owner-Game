"""Downloads (and caches) the open nflverse data files the league is built from."""

from pathlib import Path
import urllib.request

import pandas as pd

from constants import SEASON, TEAM_CODE_FIX

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
CACHE = Path(__file__).parent / ".cache"

# Seasons of history used for stats and hidden ratings. 2026 in-season data is
# deliberately never used for ratings: the game starts in August 2026.
HISTORY_SEASONS = [SEASON - 3, SEASON - 2, SEASON - 1]


def _fetch(release_path: str, refresh: bool) -> Path:
    CACHE.mkdir(exist_ok=True)
    target = CACHE / release_path.replace("/", "__")
    if refresh or not target.exists():
        print(f"  downloading {release_path}")
        urllib.request.urlretrieve(f"{BASE}/{release_path}", target)
    return target


def load_all(refresh: bool = False) -> dict:
    data = {
        "weekly_rosters": _fix_teams(pd.read_csv(_fetch(f"weekly_rosters/roster_weekly_{SEASON}.csv", refresh), low_memory=False)),
        "contracts": pd.read_parquet(_fetch("contracts/historical_contracts.parquet", refresh)),
        "games": pd.read_csv(_fetch("schedules/games.csv", refresh), low_memory=False),
        # Master player table: fills ids and draft rounds the weekly roster leaves blank.
        "players": pd.read_csv(_fetch("players/players.csv", refresh), low_memory=False),
        # Athletic testing, used for hidden traits (speed, strength, agility).
        "combine": pd.read_csv(_fetch("combine/combine.csv", refresh), low_memory=False),
        "stats": {},
        "snaps": {},
    }
    for season in HISTORY_SEASONS:
        data["stats"][season] = pd.read_csv(_fetch(f"stats_player/stats_player_reg_{season}.csv", refresh), low_memory=False)
        # Snap counts start in 2012: earlier seasons simply have none.
        if season >= 2012:
            data["snaps"][season] = _fix_teams(pd.read_csv(_fetch(f"snap_counts/snap_counts_{season}.csv", refresh), low_memory=False))
    if SEASON != 2026:
        g = data["games"]
        for col in ("home_team", "away_team"):
            g[col] = g[col].replace(TEAM_CODE_FIX)
        for season in HISTORY_SEASONS:
            st = data["stats"][season]
            for col in ("team", "recent_team", "opponent_team"):
                if col in st.columns:
                    st[col] = st[col].replace(TEAM_CODE_FIX)
    return data


def _fix_teams(df: pd.DataFrame) -> pd.DataFrame:
    """Older files use legacy club codes (STL, SD, OAK, ARZ...): map them to the club's id."""
    if SEASON != 2026 and "team" in df.columns:
        df["team"] = df["team"].replace(TEAM_CODE_FIX)
    return df

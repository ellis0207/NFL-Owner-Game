"""Downloads (and caches) the open nflverse data files the league is built from."""

from pathlib import Path
import urllib.request

import pandas as pd

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
CACHE = Path(__file__).parent / ".cache"

# Seasons of history used for stats and hidden ratings. 2026 in-season data is
# deliberately never used for ratings: the game starts in August 2026.
HISTORY_SEASONS = [2023, 2024, 2025]


def _fetch(release_path: str, refresh: bool) -> Path:
    CACHE.mkdir(exist_ok=True)
    target = CACHE / release_path.replace("/", "__")
    if refresh or not target.exists():
        print(f"  downloading {release_path}")
        urllib.request.urlretrieve(f"{BASE}/{release_path}", target)
    return target


def load_all(refresh: bool = False) -> dict:
    data = {
        "weekly_rosters": pd.read_csv(_fetch("weekly_rosters/roster_weekly_2026.csv", refresh), low_memory=False),
        "contracts": pd.read_parquet(_fetch("contracts/historical_contracts.parquet", refresh)),
        "games": pd.read_csv(_fetch("schedules/games.csv", refresh), low_memory=False),
        # Master player table: fills ids and draft rounds the weekly roster leaves blank.
        "players": pd.read_csv(_fetch("players/players.csv", refresh), low_memory=False),
        "stats": {},
        "snaps": {},
    }
    for season in HISTORY_SEASONS:
        data["stats"][season] = pd.read_csv(_fetch(f"stats_player/stats_player_reg_{season}.csv", refresh), low_memory=False)
        data["snaps"][season] = pd.read_csv(_fetch(f"snap_counts/snap_counts_{season}.csv", refresh), low_memory=False)
    return data

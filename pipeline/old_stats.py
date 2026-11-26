"""Season totals before 1999, when nflverse player stats begin.

Offense only: Pro Football Reference's yearly passing, rushing and receiving
totals as kept in the open fantasydatapros/data repository on GitHub
(`yearly/<year>.csv`, 1970-2019). The rows carry names, not ids, so each is
matched to that season's nflverse roster by name (and club where the row has
one). Defense and kicking have no open season totals: those players are rated
from their careers instead (see `career_signal`).

The frames come out shaped like nflverse's `stats_player` files, so the rest of
the pipeline reads them unchanged. There is no play-by-play before 1999, so
the EPA columns are estimates from yards, touchdowns and interceptions (only
their order within a position matters to the ratings).
"""

from pathlib import Path
import re
import urllib.request

import pandas as pd

CACHE = Path(__file__).parent / ".cache"
URL = "https://raw.githubusercontent.com/fantasydatapros/data/master/yearly/{year}.csv"

# Pro Football Reference's club codes for the clubs of the 1990s, as the
# game's ids (the Oilers are Tennessee's club, the 1990s Browns Baltimore's).
PFR_CODE = {
    "GNB": "GB", "KAN": "KC", "NOR": "NO", "NWE": "NE", "SFO": "SF", "TAM": "TB", "SDG": "LAC", "RAI": "LV", "OAK": "LV",
    "RAM": "LA", "STL": "LA", "PHO": "ARI", "HOU": "TEN", "TEN": "TEN", "CLE": "BAL", "BAL": "BAL",
}


def _name(s) -> str:
    return re.sub(r"[^a-z]", "", str(s).lower())


def _fetch(year: int) -> Path:
    CACHE.mkdir(exist_ok=True)
    target = CACHE / f"pfr_offense_{year}.csv"
    if not target.exists():
        print(f"  downloading season totals {year}")
        urllib.request.urlretrieve(URL.format(year=year), target)
    return target


def old_roster_team(code: str, season: int) -> str:
    """An nflverse season-roster club code before 1999, as the game's id."""
    if code == "CLE" and season <= 1995:
        return "BAL"  # the Browns who moved to Baltimore in 1996
    if code == "HOU" and season <= 1996:
        return "TEN"  # the Oilers
    return {"RAI": "LV", "OAK": "LV", "RAM": "LA", "STL": "LA", "SD": "LAC", "ARZ": "ARI", "PHO": "ARI"}.get(code, code)


def season_frame(year: int, roster: pd.DataFrame) -> pd.DataFrame:
    """One season's offensive totals as a stats_player frame. `roster` is that
    season's nflverse roster (gsis_id, full_name, team as the game's ids)."""
    df = pd.read_csv(_fetch(year))
    df = df[df.Player.notna()].copy()
    df["key"] = df.Player.map(_name)
    df["club"] = df.Tm.map(lambda t: PFR_CODE.get(t, t))
    r = roster[roster.gsis_id.notna()].copy()
    r["key"] = r.full_name.map(_name)
    by_club = {(k, t): g for k, t, g in zip(r.key, r.team, r.gsis_id)}
    by_name = r.drop_duplicates("key", keep=False).set_index("key").gsis_id.to_dict()
    team_of = dict(zip(r.gsis_id, r.team))
    ids = [by_club.get((k, t)) or by_name.get(k) for k, t in zip(df.key, df.club)]
    df["player_id"] = ids
    df = df[df.player_id.notna()].drop_duplicates("player_id")
    f = lambda c: df[c].fillna(0) if c in df else pd.Series(0, index=df.index)
    att, yds, td, ints = f("PassingAtt"), f("PassingYds"), f("PassingTD"), f("Int")
    car, ryds, rtd = f("RushingAtt"), f("RushingYds"), f("RushingTD")
    tgt, rec, cyds, ctd = f("Tgt"), f("Rec"), f("ReceivingYds"), f("ReceivingTD")
    # Targets were first counted in 1992: before that, catches over a typical 60% rate.
    tgt = tgt.where(tgt > 0, (rec / 0.6).round())
    out = pd.DataFrame({
        "player_id": df.player_id,
        "recent_team": [team_of.get(p, c) if c in ("2TM", "3TM", "4TM") else c for p, c in zip(df.player_id, df.club)],
        "games": f("G"), "attempts": att, "completions": 0, "passing_yards": yds, "passing_tds": td,
        "passing_interceptions": ints, "carries": car, "rushing_yards": ryds, "rushing_tds": rtd,
        "targets": tgt, "receptions": rec, "receiving_yards": cyds, "receiving_tds": ctd,
        # Rough expected points from the box score (league passing ran about 5.5
        # adjusted net yards an attempt in the 1990s).
        "passing_epa": 0.12 * (yds + 20 * td - 45 * ints) - 0.66 * att,
        "rushing_epa": 0.08 * (ryds + 20 * rtd) - 0.33 * car,
        "receiving_epa": 0.08 * (cyds + 20 * ctd) - 0.45 * tgt,
        # Not kept before 1999: rough shares of the yards (traits.py reads them).
        "passing_air_yards": 0.55 * yds, "receiving_air_yards": 0.55 * cyds, "receiving_yards_after_catch": 0.45 * cyds,
        "receiving_first_downs": (rec * 0.55 + cyds / 25).round(),
        "def_sacks": 0, "def_qb_hits": 0, "def_interceptions": 0, "def_pass_defended": 0, "def_tackles_for_loss": 0,
        "def_tackles_solo": 0, "fg_att": 0, "fg_made": 0, "pt_att": 0, "pt_yards": 0,
    })
    return out.reset_index(drop=True)


def career_signal(players: list, season: int, draft_picks: pd.DataFrame, seasons_listed: dict) -> dict:
    """A career-outcome number for each player before 1999 (no defensive or
    kicking totals survive in open data): approximate value a season and Pro
    Bowls a season from the draft record, or, for players drafted before 1980
    or not at all, how many seasons a club carried him. {id: value}."""
    dp = draft_picks[draft_picks.gsis_id.notna()].drop_duplicates("gsis_id").set_index("gsis_id")
    out = {}
    for p in players:
        pid = p["id"]
        listed = seasons_listed.get(pid, 0)
        if pid in dp.index:
            r = dp.loc[pid]
            years = max(1, (r["to"] if pd.notna(r["to"]) else season) - r["season"] + 1)
            av = (r.w_av if pd.notna(r.w_av) else 0) / years
            pb = (r.probowls if pd.notna(r.probowls) else 0) / years
            st = (r.seasons_started if pd.notna(r.seasons_started) else 0) / years
            out[pid] = av / 8 + pb * 1.5 + st * 0.6
        elif listed:
            out[pid] = min(listed, 14) / 14 * 1.1
    return out

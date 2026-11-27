"""Downloads (and caches) the open nflverse data files the league is built from."""

from pathlib import Path
import functools
import urllib.request

import pandas as pd

from constants import SEASON, TEAM_CODE_FIX

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
CACHE = Path(__file__).parent / ".cache"

# Seasons of history used for stats and hidden ratings. 2026 in-season data is
# deliberately never used for ratings: the game starts in August 2026.
# nflverse player stats begin in 1999, so a 1999-2001 start has fewer.
# Before 1999 the offensive totals come from Pro Football Reference instead
# (old_stats.py), so a 1994-1998 start has its three seasons too.
HISTORY_SEASONS = [y for y in (SEASON - 3, SEASON - 2, SEASON - 1) if y >= 1999 or SEASON < 1999]
# Seasons the hidden ratings read. Before 2002 there aren't three seasons of
# history, so the ratings also read the start season and the one after it
# (what the club's staff would have seen in camp, judged by how the year went).
# The owner never sees these: the stats shown are the seasons before the start.
RATING_SEASONS = HISTORY_SEASONS + [y for y in (SEASON, SEASON + 1, SEASON + 2) if SEASON < 2002][:3 - len(HISTORY_SEASONS)]
# Weekly rosters begin in 2002; earlier starts read the season roster.
WEEKLY_FROM = 2002


def _fetch(release_path: str, refresh: bool) -> Path:
    CACHE.mkdir(exist_ok=True)
    target = CACHE / release_path.replace("/", "__")
    if refresh or not target.exists():
        print(f"  downloading {release_path}")
        urllib.request.urlretrieve(f"{BASE}/{release_path}", target)
    return target


def load_all(refresh: bool = False) -> dict:
    data = {
        "weekly_rosters": _fix_teams(pd.read_csv(_fetch(f"weekly_rosters/roster_weekly_{SEASON}.csv", refresh), low_memory=False))
        if SEASON >= WEEKLY_FROM else season_roster(SEASON, refresh),
        "contracts": pd.read_parquet(_fetch("contracts/historical_contracts.parquet", refresh)),
        "games": pd.read_csv(_fetch("schedules/games.csv", refresh), low_memory=False),
        # Master player table: fills ids and draft rounds the weekly roster leaves blank.
        "players": pd.read_csv(_fetch("players/players.csv", refresh), low_memory=False),
        # Athletic testing, used for hidden traits (speed, strength, agility).
        "combine": pd.read_csv(_fetch("combine/combine.csv", refresh), low_memory=False),
        "stats": {},
        "rating_stats": {},
        "snaps": {},
    }
    for season in RATING_SEASONS:
        if season < 1999:
            from old_stats import season_frame
            data["rating_stats"][season] = season_frame(season, old_roster(season, refresh))
            data["stats"][season] = data["rating_stats"][season]
            continue
        data["rating_stats"][season] = pd.read_csv(_fetch(f"stats_player/stats_player_reg_{season}.csv", refresh), low_memory=False)
        if season in HISTORY_SEASONS:
            data["stats"][season] = data["rating_stats"][season]
        # Snap counts start in 2012: earlier seasons simply have none.
        if season >= 2012:
            data["snaps"][season] = _fix_teams(pd.read_csv(_fetch(f"snap_counts/snap_counts_{season}.csv", refresh), low_memory=False))
    if SEASON != 2026:
        g = data["games"]
        for col in ("home_team", "away_team"):
            g[col] = g[col].replace(TEAM_CODE_FIX)
        for season in RATING_SEASONS:
            st = data["rating_stats"][season]
            for col in ("team", "recent_team", "opponent_team"):
                if col in st.columns:
                    st[col] = st[col].replace(TEAM_CODE_FIX)
    return data


def _fix_teams(df: pd.DataFrame) -> pd.DataFrame:
    """Older files use legacy club codes (STL, SD, OAK, ARZ...): map them to the club's id."""
    if SEASON != 2026 and "team" in df.columns:
        df["team"] = df["team"].replace(TEAM_CODE_FIX)
    return df


# Statuses in a season roster that mean the player left that club during the
# year (traded, released, contract ended): he was there before the row he ended on.
LEFT = {"TRD", "TRT", "TRC", "CUT"}


def season_roster(season: int, refresh: bool = False) -> pd.DataFrame:
    """A Week 1 roster rebuilt from the season roster (before 2002 nflverse has
    no weekly file). The season file lists everyone a club carried at any point,
    one row per club. A player with two rows started the year with the club he
    left; anyone signed in season is in camp with the club he finished with.
    Approximate: a few late signings start in camp a little early."""
    df = old_roster(season, refresh) if season < 1999 else _fix_teams(pd.read_csv(_fetch(f"rosters/roster_{season}.csv", refresh), low_memory=False))
    df = df[df.gsis_id.notna()].copy()
    df["_left"] = df.status.isin(LEFT)
    df = df.sort_values("_left", ascending=False).drop_duplicates("gsis_id")
    df["status"] = df.status.map(lambda s: "ACT" if s in LEFT or s in ("NWT", "EXE") else "RES" if s in ("PUP", "SUS") else s)
    df["week"] = 1
    df["game_type"] = "REG"
    df["ngs_position"] = None
    # The season file leaves experience and the draft blank: the master player table has them.
    m = pd.read_csv(_fetch("players/players.csv", refresh), low_memory=False).drop_duplicates("gsis_id").set_index("gsis_id")
    m = m.reindex(df.gsis_id)
    df["rookie_year"] = m.rookie_season.values
    df["entry_year"] = m.rookie_season.values
    df["years_exp"] = (season - m.rookie_season).clip(lower=0).values
    # Supplemental picks read as pick 1 of their round: placed mid-round instead.
    rnd = m.draft_round.values
    df["draft_number"] = [None if pd.isna(k) else (r - 1) * 30 + 15 if r > 1 and k < (r - 1) * 28 else k for k, r in zip(m.draft_pick.values, rnd)]
    df["draft_club"] = m.draft_team.values
    if SEASON < SYNTH_FROM:
        # Made-up ids: experience from the first season listed, the draft by name.
        first = first_listed(season)
        made = df.gsis_id.str.startswith("h-")
        for col in ("rookie_year", "entry_year", "years_exp", "draft_number"):
            df[col] = df[col].astype(float)
        df["draft_club"] = df.draft_club.astype(object)
        df["college"] = df.college.astype(object)
        df.loc[made, "rookie_year"] = df.loc[made, "entry_year"] = [first.get(g, season) for g in df.gsis_id[made]]
        df.loc[made, "years_exp"] = season - df.loc[made, "rookie_year"]
        picks = draft_by_name(refresh)
        for i in df.index[made]:
            y0 = int(df.at[i, "rookie_year"])
            r = next((picks[k] for k in ((_slug(df.at[i, "full_name"]), y0), (_slug(df.at[i, "full_name"]), y0 - 1)) if k in picks), None)
            if r is not None:
                df.at[i, "draft_number"] = r.pick if r.round <= 1 or r.pick >= (r.round - 1) * 28 else (r.round - 1) * 30 + 15
                df.at[i, "draft_club"] = r.team
                df.at[i, "college"] = df.at[i, "college"] if pd.notna(df.at[i, "college"]) else r.college
    df["college"] = df.college.fillna(pd.Series(m.college_name.values, index=df.index))
    df["pfr_id"] = df.pfr_id.fillna(pd.Series(m.pfr_id.values, index=df.index))
    # Old position labels: OT and SAF, and a plain DB where the master table has
    # nothing finer (heavier backs played safety: approximate).
    pos = df.depth_chart_position.replace({"OT": "T", "SAF": "S"})
    finer = pd.Series(m.position.values, index=df.index).replace({"SAF": "S"})
    db = pos == "DB"
    pos[db] = finer[db].where(finer[db].isin(["CB", "S", "FS", "SS"]), None)
    pos[db & pos.isna()] = ["S" if (w or 0) >= 205 else "CB" for w in df.weight[db & pos.isna()]]
    df["depth_chart_position"] = pos
    return df.drop(columns="_left")


def old_roster(season: int, refresh: bool = False) -> pd.DataFrame:
    """A season roster before 1999 with clubs as the game's ids (the Oilers are
    Tennessee's club, the 1994-95 Browns Baltimore's, the Los Angeles Rams and
    Raiders the LA and LV clubs)."""
    from old_stats import old_roster_team
    df = pd.read_csv(_fetch(f"rosters/roster_{season}.csv", refresh), low_memory=False)
    df["team"] = df.team.map(lambda t: old_roster_team(t, season))
    if SEASON < SYNTH_FROM:
        df = with_ids(df)
    return df


# Before about 1990 most season-roster rows carry no player id. Starts before
# 1994 give those players one made from the name and birth date, the same in
# every season's file. Starts from 1994 keep the rosters they were built with.
SYNTH_FROM = 1994


def _slug(s) -> str:
    import re
    return re.sub(r"[^a-z]", "", str(s).lower())


def with_ids(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["gsis_id"] = df.gsis_id.astype(object)
    miss = df.gsis_id.isna() & df.full_name.notna()
    df.loc[miss, "gsis_id"] = ["h-" + _slug(n)[:16] + "-" + str(b or "")[:10].replace("-", "") for n, b in zip(df.full_name[miss], df.birth_date[miss].fillna(""))]
    return df


@functools.lru_cache(maxsize=None)
def first_listed(last: int) -> dict:
    """The first season each player was on a club's roster (1960 on), by id (made-up ids included)."""
    out: dict[str, int] = {}
    for y in range(1960, last + 1):
        df = with_ids(pd.read_csv(_fetch(f"rosters/roster_{y}.csv", False), usecols=["gsis_id", "full_name", "birth_date"], low_memory=False))
        for g in df.gsis_id.dropna():
            out.setdefault(g, y)
    return out


def draft_by_name(refresh: bool = False) -> dict:
    """Draft rows by (name, draft season) for players with no id in the master table."""
    dp = pd.read_csv(_fetch("draft_picks/draft_picks.csv", refresh), low_memory=False)
    return {(_slug(n), int(s)): r for n, s, r in zip(dp.pfr_player_name, dp.season, dp.itertuples(index=False))}


@functools.lru_cache(maxsize=None)
def seasons_listed(first: int, last: int, refresh: bool = False) -> dict:
    """How many seasons each player was on a club's roster, first through last."""
    out: dict[str, int] = {}
    for y in range(first, last + 1):
        df = pd.read_csv(_fetch(f"rosters/roster_{y}.csv", refresh), usecols=["gsis_id", "status", "full_name", "birth_date"], low_memory=False)
        if SEASON < SYNTH_FROM:
            df = with_ids(df)
        for g in set(df[df.gsis_id.notna() & ~df.status.isin(["CUT"])].gsis_id):
            out[g] = out.get(g, 0) + 1
    return out


def fte_games(season: int) -> pd.DataFrame:
    """One season's games from FiveThirtyEight's NFL file (1920-2020: dates and
    scores only), shaped like nflverse's schedule for the seasons before 1999.
    Playoff rounds follow from the dates."""
    df = pd.read_csv(Path(CACHE / "fte__nfl_games.csv") if (CACHE / "fte__nfl_games.csv").exists() else _fte(), low_memory=False)
    df = df[df.season == season].copy()
    code = {"LAR": "LA", "OAK": "LV", "WSH": "WAS", **TEAM_CODE_FIX}
    out = pd.DataFrame({
        "season": season, "gameday": df.date, "home_team": df.team1.replace(code), "away_team": df.team2.replace(code),
        "home_score": df.score1, "away_score": df.score2, "playoff": df.playoff,
    })
    if season <= 1995:
        # The Browns of 1995 and before are the club that moved to Baltimore.
        out[["home_team", "away_team"]] = out[["home_team", "away_team"]].replace({"CLE": "BAL"})
    days = sorted(set(out[out.playoff == 1].gameday))
    # Playoff weekends: wild card, divisional, conference, then the Super Bowl.
    weekend = {d: i for i, d in enumerate(sorted({pd.Timestamp(d).to_period("W").start_time for d in days}))}
    rounds = ["WC", "DIV", "CON", "SB"][-len(weekend):] if weekend else []
    out["game_type"] = [rounds[weekend[pd.Timestamp(d).to_period("W").start_time]] if p else "REG" for d, p in zip(out.gameday, out.playoff)]
    return out.drop(columns="playoff")


def _fte() -> Path:
    CACHE.mkdir(exist_ok=True)
    target = CACHE / "fte__nfl_games.csv"
    urllib.request.urlretrieve("https://raw.githubusercontent.com/fivethirtyeight/nfl-elo-game/master/data/nfl_games.csv", target)
    return target

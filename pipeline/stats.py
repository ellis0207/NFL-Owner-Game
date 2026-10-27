"""Past-season player stats: what an owner can actually see about a player."""

import math

import pandas as pd

# Stat columns kept per season. Everything else in the nflverse file is dropped
# to keep the bundle small; zeros are omitted from the output too.
KEEP = {
    "games": "g",
    "completions": "cmp", "attempts": "att", "passing_yards": "passYds", "passing_tds": "passTd",
    "passing_interceptions": "int", "sacks_suffered": "sacked", "passing_epa": "passEpa",
    "carries": "car", "rushing_yards": "rushYds", "rushing_tds": "rushTd", "rushing_epa": "rushEpa",
    "rushing_fumbles_lost": "rushFumLost",
    "targets": "tgt", "receptions": "rec", "receiving_yards": "recYds", "receiving_tds": "recTd",
    "receiving_epa": "recEpa", "target_share": "tgtShare", "wopr": "wopr",
    "def_tackles_solo": "tklSolo", "def_tackle_assists": "tklAst", "def_tackles_for_loss": "tfl",
    "def_sacks": "sacks", "def_qb_hits": "qbHits", "def_interceptions": "defInt",
    "def_pass_defended": "pd", "def_fumbles_forced": "ff", "def_tds": "defTd",
    "fg_made": "fgm", "fg_att": "fga", "fg_long": "fgLong", "fg_made_50_59": "fgm50", "fg_made_60_": "fgm60",
    "pat_made": "xpm", "pat_att": "xpa",
    "pt_att": "punts", "pt_yards": "puntYds", "pt_net_yards": "puntNet", "pt_inside_20": "puntIn20",
    "punt_returns": "pr", "punt_return_yards": "prYds", "kickoff_returns": "kr", "kickoff_return_yards": "krYds",
    "penalties": "pen", "penalty_yards": "penYds",
}


def _num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0
    return round(float(v), 3) if isinstance(v, float) and not float(v).is_integer() else int(v)


def season_stats(stats_by_season: dict) -> dict:
    """{gsis_id: [{season, team, ...stats}]}"""
    out: dict[str, list] = {}
    for season, df in sorted(stats_by_season.items()):
        for row in df.to_dict("records"):
            entry = {"season": season, "team": row.get("recent_team")}
            for src, dst in KEEP.items():
                value = _num(row.get(src))
                if value:
                    entry[dst] = value
            out.setdefault(row["player_id"], []).append(entry)
    return out


def season_snaps(snaps_by_season: dict) -> dict:
    """{pfr_id: {season: {offense, defense, st, games, offPct, defPct, stPct}}}"""
    out: dict[str, dict] = {}
    for season, df in snaps_by_season.items():
        reg = df[df.game_type == "REG"]
        grouped = reg.groupby("pfr_player_id").agg(
            games=("game_id", "nunique"),
            offense=("offense_snaps", "sum"), defense=("defense_snaps", "sum"), st=("st_snaps", "sum"),
            offPct=("offense_pct", "sum"), defPct=("defense_pct", "sum"), stPct=("st_pct", "sum"),
        )
        for pfr_id, r in grouped.iterrows():
            # Pct columns become "share of the team's snaps across a 17-game season".
            out.setdefault(pfr_id, {})[season] = {
                "games": int(r.games), "offense": int(r.offense), "defense": int(r.defense), "st": int(r.st),
                "offShare": round(r.offPct / 17, 3), "defShare": round(r.defPct / 17, 3), "stShare": round(r.stPct / 17, 3),
            }
    return out


def pass_rush_rates(stats_by_season: dict) -> dict:
    """Sacks + QB hits per game over the history window, used to tell
    edge-rushing outside linebackers from off-ball ones."""
    frames = [df[["player_id", "games", "def_sacks", "def_qb_hits"]] for df in stats_by_season.values()]
    df = pd.concat(frames).fillna(0).groupby("player_id").sum()
    df = df[df.games >= 4]
    return ((df.def_sacks + df.def_qb_hits) / df.games).to_dict()

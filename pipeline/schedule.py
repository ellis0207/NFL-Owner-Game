"""The real 2026-27 schedule: preseason (hand entered), all 272 regular-season
games (nflverse), and postseason slots (dates fixed, teams decided in-game)."""

from datetime import date

import pandas as pd

from constants import SEASON, STADIUM_NAME_OVERRIDES, TEAMS
from preseason_2026 import HALL_OF_FAME_GAME, PLAYOFF_SLOTS, PRESEASON_GAMES, SUPER_BOWL_SITE

DIVISION = {t[0]: (t[3], t[4]) for t in TEAMS}


def _weekday(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%A")


def home_stadiums(games: pd.DataFrame) -> dict:
    reg = games[(games.season == SEASON) & (games.game_type == "REG") & (games.location == "Home")]
    out = {}
    for team, rows in reg.groupby("home_team"):
        r = rows.iloc[0]
        out[team] = {
            "stadiumId": r.stadium_id,
            "stadium": STADIUM_NAME_OVERRIDES.get(r.stadium_id, r.stadium),
            "roof": r.roof,
            "surface": r.surface,
        }
    return out


def build_schedule(games: pd.DataFrame, stadiums: dict) -> list:
    out = []

    hof = HALL_OF_FAME_GAME
    out.append({
        "id": f"{SEASON}_P0_{hof['away']}_{hof['home']}", "type": "PRE", "week": 0, "date": hof["date"],
        "weekday": _weekday(hof["date"]), "timeET": hof["time"], "away": hof["away"], "home": hof["home"],
        "neutral": True, "stadium": hof["stadium"], "stadiumId": None, "city": hof["city"],
        "roof": "outdoors", "surface": "fieldturf", "divisionGame": False, "label": "Hall of Fame Game",
    })
    for week, day, time, away, home in PRESEASON_GAMES:
        s = stadiums[home]
        out.append({
            "id": f"{SEASON}_P{week}_{away}_{home}", "type": "PRE", "week": week, "date": day,
            "weekday": _weekday(day), "timeET": time, "away": away, "home": home, "neutral": False,
            "stadium": s["stadium"], "stadiumId": s["stadiumId"], "roof": s["roof"], "surface": s["surface"],
            "divisionGame": DIVISION[away] == DIVISION[home],
        })

    # Only scheduling facts are kept. Real scores, betting lines, starting QBs,
    # referees and weather are dropped so the season plays out on its own.
    reg = games[(games.season == SEASON) & (games.game_type == "REG")].sort_values(["gameday", "gametime"])
    for r in reg.itertuples(index=False):
        out.append({
            "id": r.game_id, "type": "REG", "week": int(r.week), "date": r.gameday, "weekday": r.weekday,
            "timeET": r.gametime, "away": r.away_team, "home": r.home_team, "neutral": r.location == "Neutral",
            "stadium": STADIUM_NAME_OVERRIDES.get(r.stadium_id, r.stadium), "stadiumId": r.stadium_id,
            "roof": r.roof, "surface": r.surface, "divisionGame": bool(r.div_game),
            "awayRest": int(r.away_rest), "homeRest": int(r.home_rest),
        })

    conference_order = iter(["NFC", "AFC"])  # NFC title game kicks off first
    for i, (rnd, day, time) in enumerate(PLAYOFF_SLOTS):
        game = {
            "id": f"{SEASON}_POST_{rnd}_{i + 1}", "type": "POST", "round": rnd, "date": day,
            "weekday": _weekday(day), "timeET": time, "away": None, "home": None,
            "neutral": rnd == "SB",
        }
        if rnd == "CONF":
            game["conference"] = next(conference_order)
        if rnd == "SB":
            game.update(SUPER_BOWL_SITE)
            game["label"] = "Super Bowl LXI"
        out.append(game)
    return out

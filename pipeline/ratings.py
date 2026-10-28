"""Hidden "true" player ratings.

The owner never sees these. They drive the game engine, and staff (coaches,
scouts) report on them with more or less accuracy. This is a first pass built
only from information available before the 2026 season:

  * usage      - share of the team's snaps the last three seasons (coaches' own verdict)
  * production - position-specific per-game or per-play output
  * market     - 2026 veteran-contract APY as a share of the cap
  * draft      - where the player was drafted (fades with experience)

Signals are turned into percentiles within each position, blended, mapped to
a 35-99 scale, and given a little seeded noise so the true rating is never
exactly what the public numbers say.
"""

import hashlib
import math
import random

import numpy as np

from constants import SEASON

SEASON_WEIGHTS = {2025: 0.6, 2024: 0.3, 2023: 0.1}
SIDE = {
    "QB": "off", "RB": "off", "FB": "off", "WR": "off", "TE": "off", "OT": "off", "OG": "off", "C": "off",
    "EDGE": "def", "IDL": "def", "LB": "def", "CB": "def", "S": "def",
    "K": "st", "P": "st", "LS": "st",
}


def _rng(player_id: str, salt: str) -> random.Random:
    seed = int(hashlib.sha256(f"{player_id}:{salt}".encode()).hexdigest()[:12], 16)
    return random.Random(seed)


def _age(birth_date: str | None) -> float:
    if not birth_date:
        return 25.0
    y, m, d = (int(x) for x in birth_date.split("-"))
    return (SEASON - y) + (9 - m) / 12 - d / 365  # age on Sept 1 of the season


def _usage(player: dict, snaps: dict) -> float | None:
    seasons = snaps.get(player["ids"]["pfr"]) or {}
    key = {"off": "offShare", "def": "defShare", "st": "stShare"}[SIDE.get(player["position"], "off")]
    total, weight = 0.0, 0.0
    for season, w in SEASON_WEIGHTS.items():
        s = seasons.get(season)
        if s and s["games"] >= 4:
            # Share per game played, so a season cut short by injury does not
            # read as a benching (durability covers the missed games).
            total += w * min(1.0, s[key] * 17 / s["games"])
            weight += w
    return total / weight if weight else None


def _per_game(entry: dict, *keys_weights) -> float:
    return sum(entry.get(k, 0) * w for k, w in keys_weights) / max(entry.get("g", 0), 1)


def _production_one(pos: str, e: dict) -> float | None:
    """One season's production number, or None when the sample is too small."""
    g = e.get("g", 0)
    if pos == "QB":
        plays = e.get("att", 0) + e.get("sacked", 0) + e.get("car", 0)
        return (e.get("passEpa", 0) + e.get("rushEpa", 0)) / plays if plays >= 150 else None
    if pos in ("RB", "FB"):
        touches = e.get("car", 0) + e.get("tgt", 0)
        if touches < 50:
            return None
        return (e.get("rushEpa", 0) + e.get("recEpa", 0)) / touches + (e.get("rushYds", 0) + e.get("recYds", 0)) / max(g, 1) / 100
    if pos in ("WR", "TE"):
        if e.get("tgt", 0) < 20:
            return None
        return e.get("recYds", 0) / max(g, 1) / 60 + e.get("wopr", 0) + e.get("recEpa", 0) / e["tgt"]
    if g < 6:
        return None
    if pos in ("EDGE", "IDL"):
        return _per_game(e, ("sacks", 2), ("qbHits", 1), ("tfl", 1))
    if pos == "LB":
        return _per_game(e, ("tklSolo", 1), ("tklAst", 0.5), ("tfl", 2), ("pd", 2), ("defInt", 4), ("sacks", 2), ("ff", 3))
    if pos in ("CB", "S"):
        return _per_game(e, ("pd", 2), ("defInt", 4), ("tklSolo", 0.3), ("ff", 3))
    if pos == "K":
        if e.get("fga", 0) < 10:
            return None
        return (e.get("fgm", 0) + 0.5 * e.get("fgm50", 0) + e.get("fgm60", 0)) / e["fga"]
    if pos == "P":
        return e.get("puntNet", 0) / e["punts"] if e.get("punts", 0) >= 20 else None
    return None  # offensive line and long snappers: usage only


def _production(player: dict, history: list) -> float | None:
    total, weight = 0.0, 0.0
    for entry in history:
        w = SEASON_WEIGHTS.get(entry["season"], 0)
        value = _production_one(player["position"], entry)
        if value is not None and w:
            total += w * value
            weight += w
    return total / weight if weight else None


def _market(player: dict) -> float | None:
    c = player["contract"]
    if c["source"] == "estimated-minimum" or c.get("type") == "Drafted":
        return None  # rookie-scale and minimum deals say little beyond draft slot
    return c["apy"] / 301_200_000 if c.get("apy") else None


def _draft(player: dict) -> float:
    pick = player["draft"]["overall"]
    return 1 - math.log(pick) / math.log(262) if pick else 0.02


def _percentiles(values: dict) -> dict:
    if not values:
        return {}
    ids = list(values)
    ranks = np.argsort(np.argsort([values[i] for i in ids]))
    n = max(len(ids) - 1, 1)
    return {pid: float(r) / n for pid, r in zip(ids, ranks)}


def rate_players(players: list, stats: dict, snaps: dict) -> dict:
    by_pos: dict[str, list] = {}
    for p in players:
        by_pos.setdefault(p["position"], []).append(p)

    ratings = {}
    for pos, group in by_pos.items():
        signals = {"usage": {}, "production": {}, "market": {}, "draft": {}}
        for p in group:
            for name, value in (
                ("usage", _usage(p, snaps)),
                ("production", _production(p, stats.get(p["id"], []))),
                ("market", _market(p)),
                ("draft", _draft(p)),
            ):
                if value is not None:
                    signals[name][p["id"]] = value
        pct = {name: _percentiles(v) for name, v in signals.items()}
        # Usage is already a 0-1 share. Ranking it would turn tiny differences
        # between full-time starters (a QB rested in a blowout) into big ones.
        pct["usage"] = dict(signals["usage"])
        # Players on rookie deals have no market signal. Leaving it out would
        # rank every full-time starter on a rookie deal above veterans with the
        # same usage, so they get the typical market standing of veterans who
        # play as much as they do.
        bins: dict[int, list] = {}
        for pid, m in pct["market"].items():
            if pid in pct["usage"]:
                bins.setdefault(min(4, int(pct["usage"][pid] * 5)), []).append(m)
        for p in group:
            pid = p["id"]
            if pid not in pct["market"] and pid in pct["usage"] and p["yearsExp"] > 0:
                peers = bins.get(min(4, int(pct["usage"][pid] * 5)))
                if peers:
                    pct["market"][pid] = float(np.median(peers))

        blended = {}
        for p in group:
            pid, exp = p["id"], p["yearsExp"]
            weights = {
                "usage": 0.30, "production": 0.35 if pos not in ("OT", "OG", "C", "LS") else 0.0,
                "market": 0.30, "draft": max(0.05, 0.6 - 0.2 * exp),
            }
            if exp == 0:
                # Rookies are judged on draft slot alone, and even a top pick
                # starts below established starters: 0.15-0.75 before ranking.
                blended[pid] = 0.15 + 0.6 * pct["draft"].get(pid, 0) ** 1.3
                continue
            num = sum(w * pct[s][pid] for s, w in weights.items() if pid in pct[s])
            den = sum(w for s, w in weights.items() if pid in pct[s])
            # Missing usage for a veteran is itself a signal: he was not playing.
            if exp > 0 and pid not in pct["usage"]:
                num += 0.30 * 0.05
                den += 0.30
            blended[pid] = num / den if den else 0.1
        ranked = _percentiles(blended)

        for p in group:
            pid = p["id"]
            rng = _rng(pid, "rating")
            overall = 42 + 54 * ranked[pid] ** 1.5 + rng.gauss(0, 2)
            age = _age(p["birthDate"])
            growth = 0.0
            if age < 24:
                growth = rng.uniform(3, 14) * (0.5 + 0.5 * _draft(p))
            elif age < 26:
                growth = rng.uniform(1, 7)
            elif age < 28:
                growth = rng.uniform(0, 3)
            ratings[pid] = {
                "overall": int(round(min(99, max(35, overall)))),
                "potential": int(round(min(99, max(35, overall + growth)))),
                "durability": _durability(snaps.get(p["ids"]["pfr"]) or {}, rng),
                "signals": {s: round(pct[s][pid], 3) for s in pct if pid in pct[s]},
            }
    return ratings


def _durability(snap_seasons: dict, rng: random.Random) -> int:
    """Games appeared in (any snap, special teams included) per season in the
    league. Healthy backups still play special teams, so misses mostly mean injury."""
    seasons = [s for season, s in snap_seasons.items() if season in SEASON_WEIGHTS]
    if not seasons:
        return int(round(min(95, max(40, rng.gauss(72, 8)))))
    played = sum(s["games"] for s in seasons) / (17 * len(seasons))
    return int(round(min(97, max(30, 40 + 55 * played + rng.gauss(0, 5)))))

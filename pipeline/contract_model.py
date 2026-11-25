"""Modeled contracts for historical starts, where OverTheCap kept no deal.

Before about 2011 the open contract archive covers only part of each roster
(roughly 100 players in 2003, 250 in 2006, 500 in 2009), so most deals in an
early pack are modeled here, and labeled "modeled". Two rules:

* Rookie deals before the 2011 rookie wage scale: priced by draft slot as a
  share of that year's cap (the first pick near 10%, the 32nd near 1.5%, late
  rounds at about the minimum), five years in round one and four after, with
  a large guarantee in round one. No fifth-year option existed.
* Veterans: the share of the cap a player of his standing at his position
  earns in the 2026 market (data/league-2026, by hidden rating), times the
  season's cap, for a length set by age, part of it already served.

Anyone who would earn under the minimum for his experience gets the minimum.
"""

import hashlib
import json
import random
from bisect import bisect_left
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "league-2026"
ROOKIE_SCALE_FROM = 2011  # the 2011 labor deal brought the rookie wage scale

_curve = None


def _rng(key: str) -> random.Random:
    return random.Random(int(hashlib.sha256(key.encode()).hexdigest()[:12], 16))


def market_curve() -> dict:
    """{position: sorted [(overall, share of cap)]} for 2026 veterans on market deals."""
    global _curve
    if _curve is None:
        players = json.loads((DATA / "players.json").read_text())
        ratings = json.loads((DATA / "hidden-ratings.json").read_text())
        _curve = {}
        for p in players:
            c = p.get("contract") or {}
            if not p.get("team") or c.get("type") not in ("SFA", "UFA", "Extension", "Franchise", "RFA"):
                continue
            share, r = c.get("apyCapPct"), ratings.get(p["id"])
            if share and r:
                _curve.setdefault(p["position"], []).append((r["overall"], share))
        for pos in _curve:
            _curve[pos].sort()
    return _curve


def vet_share(position: str, overall: int) -> float:
    """Median 2026 cap share of veterans within three points of this rating at the position."""
    pts = market_curve().get(position) or market_curve()["LB"]
    lo, hi = bisect_left(pts, (overall - 3, 0)), bisect_left(pts, (overall + 4, 0))
    near = sorted(s for _, s in pts[lo:hi])
    if not near:  # off the end of the table: the nearest player's deal
        near = [pts[-1][1] if overall > pts[-1][0] else pts[0][1]]
    return near[len(near) // 2]


def rookie_share(overall_pick: int) -> float:
    """Share of the cap a rookie deal paid per year before the wage scale (approximate)."""
    if overall_pick <= 32:
        return 0.10 * overall_pick ** -0.55
    return 0.0149 * (overall_pick / 32) ** -1.0


def _seasons(start: int, end: int, apy: int, floor, team) -> list:
    out = []
    for i, year in enumerate(range(start, end + 1)):
        salary = int(max(floor(year), round(apy * (1.03 ** i), -3)))
        out.append({"year": year, "team": team, "baseSalary": salary, "proratedBonus": 0, "rosterBonus": 0,
                    "optionBonus": 0, "workoutBonus": 0, "otherBonus": 0, "guaranteedSalary": 0, "capHit": salary})
    return out


def model_contract(p: dict, overall: int, season: int, cap: int, minimum) -> dict | None:
    """A modeled deal for a rostered player, or None to keep the estimated minimum.

    `minimum(years_exp, year)` is that year's minimum salary for his experience."""
    exp = p.get("yearsExp") or 0
    draft = p.get("draft") or {}
    pick, rookie_year = draft.get("overall"), p.get("rookieYear")
    rng = _rng(f"contract:{season}:{p['id']}")
    floor = lambda year: minimum(exp + year - season, year)
    if pick and rookie_year and rookie_year < ROOKIE_SCALE_FROM:
        length = 5 if draft.get("round") == 1 else 4
        last = rookie_year + length - 1
        if last >= season:
            apy = round(cap * rookie_share(pick), -3)
            seasons = _seasons(season, last, apy, floor, p.get("team"))
            total = sum(s["capHit"] for s in seasons)
            guaranteed = round(total * (0.6 if pick <= 32 else 0.3 if pick <= 64 else 0.1), -3)
            return _deal("Drafted", rookie_year, length, seasons, guaranteed, cap)
    if exp < 3:
        return None  # young players off their rookie deal sign at or near the minimum
    share = vet_share(p["position"], overall)
    if share * cap < minimum(exp, season) * 1.15:
        return None
    age = season - int((p.get("birthDate") or f"{season - 22 - exp}")[:4])
    length = 5 if age < 27 else 4 if age < 29 else 3 if age < 31 else 2 if age < 33 else 1
    served = rng.randint(0, length - 1)
    apy = round(cap * min(share, 0.12 if p["position"] == "QB" else 0.09), -3)
    seasons = _seasons(season, season + length - served - 1, apy, floor, p.get("team"))
    guaranteed = round(apy * length * (0.35 if share > 0.05 else 0.15), -3)
    return _deal("UFA", season - served, length, seasons, guaranteed, cap)


def _deal(kind: str, signed: int, length: int, seasons: list, guaranteed: int, cap: int) -> dict:
    apy = seasons[0]["baseSalary"]
    return {
        "source": "modeled", "signedYear": signed, "years": length,
        "totalValue": sum(s["baseSalary"] for s in seasons), "apy": apy, "guaranteed": guaranteed,
        "apyCapPct": round(apy / cap, 4), "type": kind, "otcTeam": None, "seasons": seasons,
    }

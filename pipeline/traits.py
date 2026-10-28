"""Hidden player traits: the "type" of player, so scheme fit can matter.

Every trait sits on the same 30-99 scale as overall and is anchored to it: a
good player is good at most things, and the trait says where he is better
or worse than his overall. The tilt comes from real data:

  * athletic testing (nflverse combine: 40, bench, 3-cone, shuttle), and
  * how the player actually produced (air yards, catch rate, YAC, sacks...).

Players with no testing or stats lean on position averages plus noise.
"""

import hashlib
import math
import random

import numpy as np
import pandas as pd

from constants import SEASON

# Traits per position. "speed" and "strength" exist for everyone.
POSITION_TRAITS = {
    "QB": ["arm", "accuracy", "mobility", "decisions"],
    "RB": ["vision", "power", "receiving", "burst"],
    "FB": ["blocking", "power", "receiving"],
    "WR": ["deep", "routes", "hands", "yac"],
    "TE": ["receiving", "blocking", "hands"],
    "OT": ["passBlock", "runBlock"],
    "OG": ["passBlock", "runBlock"],
    "C": ["passBlock", "runBlock"],
    "EDGE": ["passRush", "runStop"],
    "IDL": ["passRush", "runStop"],
    "LB": ["coverage", "runStop", "blitz"],
    "CB": ["man", "zone", "press"],
    "S": ["range", "box", "coverage"],
    "K": ["kickPower", "kickAccuracy"],
    "P": ["kickPower", "placement"],
    "LS": [],
}


def _rng(pid: str) -> random.Random:
    return random.Random(int(hashlib.sha256(f"{pid}:traits".encode()).hexdigest()[:12], 16))


def _pct(values: dict) -> dict:
    if not values:
        return {}
    ids = list(values)
    ranks = np.argsort(np.argsort([values[i] for i in ids]))
    n = max(len(ids) - 1, 1)
    return {pid: float(r) / n for pid, r in zip(ids, ranks)}


def _career(stats_by_season: dict) -> pd.DataFrame:
    """2023-25 regular-season totals per player (later seasons weigh more)."""
    frames = []
    for season, df in stats_by_season.items():
        w = {2025: 1.0, 2024: 0.7, 2023: 0.4}.get(season, 0.3)
        num = df.copy().select_dtypes("number").drop(columns=["season"], errors="ignore").fillna(0) * w
        frames.append(num.assign(player_id=df["player_id"].values))
    return pd.concat(frames).groupby("player_id").sum()


def _safe(num, den):
    return num / den if den else None


def _production_tilts(pos: str, r) -> dict:
    """Raw (un-normalized) production measures for one player, by trait."""
    g = r.get("games", 0)
    out = {}
    if pos == "QB" and r.get("attempts", 0) >= 80:
        out["arm"] = _safe(r["passing_air_yards"], r["attempts"])
        out["accuracy"] = _safe(r.get("passing_cpoe", 0), 1)  # weighted sum; relative order is what matters
        out["decisions"] = -_safe(r["passing_interceptions"], r["attempts"])
        out["mobility"] = _safe(r["rushing_yards"], g)
    elif pos in ("RB", "FB") and r.get("carries", 0) >= 25:
        out["vision"] = _safe(r["rushing_epa"], r["carries"])
        out["burst"] = _safe(r["rushing_yards"], r["carries"])
        out["receiving"] = _safe(r["targets"], g)
    elif pos in ("WR", "TE") and r.get("targets", 0) >= 15:
        catch = _safe(r["receptions"], r["targets"])
        out["hands"] = catch
        out["routes"] = _safe(r["receiving_first_downs"], r["targets"])
        if pos == "WR":
            out["deep"] = _safe(r["receiving_air_yards"], r["targets"])
            out["yac"] = _safe(r["receiving_yards_after_catch"], r["receptions"])
        else:
            out["receiving"] = _safe(r["receiving_yards"], g)
            out["blocking"] = -_safe(r["targets"], g)
    elif pos in ("EDGE", "IDL") and g >= 6:
        out["passRush"] = _safe(r["def_sacks"] * 2 + r["def_qb_hits"], g)
        out["runStop"] = _safe(r["def_tackles_for_loss"] * 2 + r["def_tackles_solo"], g)
    elif pos == "LB" and g >= 6:
        out["coverage"] = _safe(r["def_pass_defended"] * 2 + r["def_interceptions"] * 3, g)
        out["runStop"] = _safe(r["def_tackles_solo"] + r["def_tackles_for_loss"] * 2, g)
        out["blitz"] = _safe(r["def_sacks"] * 2 + r["def_qb_hits"], g)
    elif pos == "CB" and g >= 6:
        out["man"] = _safe(r["def_pass_defended"], g)
        out["zone"] = _safe(r["def_interceptions"] * 3 + r["def_pass_defended"], g)
    elif pos == "S" and g >= 6:
        out["range"] = _safe(r["def_interceptions"] * 3 + r["def_pass_defended"], g)
        out["box"] = _safe(r["def_tackles_solo"] + r["def_tackles_for_loss"] * 2, g)
        out["coverage"] = _safe(r["def_pass_defended"], g)
    elif pos == "K" and r.get("fg_att", 0) >= 8:
        out["kickAccuracy"] = _safe(r["fg_made"], r["fg_att"])
        out["kickPower"] = _safe(r["fg_made_50_59"] * 2 + r["fg_made_60_"] * 4 + r["fg_made_40_49"], r["fg_att"])
    elif pos == "P" and r.get("pt_att", 0) >= 15:
        out["kickPower"] = _safe(r["pt_yards"], r["pt_att"])
        out["placement"] = _safe(r["pt_inside_20"], r["pt_att"])
    return {k: v for k, v in out.items() if v is not None and not (isinstance(v, float) and math.isnan(v))}


# Which athletic test feeds which trait, and its sign (+ = higher is better).
ATHLETIC = {
    "speed": [("forty", -1.0)],
    "strength": [("bench", 1.0), ("wt", 0.6)],
    "agility": [("cone", -1.0), ("shuttle", -1.0)],
}
# Position traits that lean on athleticism, as (trait, athletic trait, weight).
ATHLETIC_TILTS = [
    ("QB", "mobility", "speed", 0.5), ("RB", "burst", "speed", 0.5), ("RB", "power", "strength", 1.0),
    ("WR", "deep", "speed", 0.5), ("WR", "routes", "agility", 0.3), ("TE", "blocking", "strength", 0.5),
    ("FB", "blocking", "strength", 1.0), ("FB", "power", "strength", 1.0),
    ("OT", "passBlock", "agility", 0.6), ("OG", "runBlock", "strength", 0.6), ("C", "runBlock", "strength", 0.6),
    ("OT", "runBlock", "strength", 0.4), ("OG", "passBlock", "agility", 0.4), ("C", "passBlock", "agility", 0.4),
    ("EDGE", "passRush", "speed", 0.4), ("EDGE", "runStop", "strength", 0.5), ("IDL", "runStop", "strength", 0.6),
    ("IDL", "passRush", "agility", 0.4), ("LB", "coverage", "speed", 0.5), ("LB", "runStop", "strength", 0.4),
    ("CB", "man", "speed", 0.6), ("CB", "press", "strength", 0.6), ("S", "range", "speed", 0.6), ("S", "box", "strength", 0.5),
]


def _combine_lookup(combine: pd.DataFrame, players: list) -> dict:
    """{player id: combine row} matched by pfr id, else by name and draft year."""
    by_pfr = {r.pfr_id: r for r in combine.itertuples() if isinstance(r.pfr_id, str)}
    by_name = {(str(r.player_name).lower(), int(r.season)): r for r in combine.itertuples()}
    out = {}
    for p in players:
        row = by_pfr.get(p["ids"]["pfr"]) if p["ids"]["pfr"] else None
        if row is None and p["rookieYear"]:
            row = by_name.get((p["name"].lower(), p["rookieYear"]))
        if row is not None:
            out[p["id"]] = row
    return out


def build_traits(players: list, ratings: dict, stats_by_season: dict, combine: pd.DataFrame) -> dict:
    career = _career(stats_by_season)
    combine = combine.copy()
    combine["wt"] = pd.to_numeric(combine["wt"], errors="coerce")
    tests = _combine_lookup(combine, players)

    by_pos: dict[str, list] = {}
    for p in players:
        by_pos.setdefault(p["position"], []).append(p)

    traits = {}
    for pos, group in by_pos.items():
        # Athletic percentiles within the position.
        athletic_raw = {name: {} for name in ATHLETIC}
        for p in group:
            row = tests.get(p["id"])
            for name, parts in ATHLETIC.items():
                vals = []
                for col, sign in parts:
                    v = getattr(row, col, None) if row is not None else None
                    if col == "wt" and (v is None or (isinstance(v, float) and math.isnan(v))):
                        v = p["weightLb"]
                    if v is not None and not (isinstance(v, float) and math.isnan(v)):
                        vals.append((sign, float(v)))
                if vals:
                    athletic_raw[name][p["id"]] = vals
        athletic_pct = {}
        for name, raw in athletic_raw.items():
            # Each test is ranked separately, then the ranks are averaged.
            cols = {}
            for pid, vals in raw.items():
                for i, (sign, v) in enumerate(vals):
                    cols.setdefault(i, {})[pid] = sign * v
            ranked = [_pct(c) for c in cols.values()]
            athletic_pct[name] = {pid: float(np.mean([r[pid] for r in ranked if pid in r])) for pid in raw}

        production = {}
        for p in group:
            if p["id"] in career.index:
                production[p["id"]] = _production_tilts(pos, career.loc[p["id"]].to_dict())
        prod_pct = {}
        for trait in POSITION_TRAITS.get(pos, []):
            prod_pct[trait] = _pct({pid: t[trait] for pid, t in production.items() if trait in t})

        for p in group:
            pid = p["id"]
            rng = _rng(pid)
            overall = ratings[pid]["overall"]

            def scaled(tilt):  # tilt in [0, 1], 0.5 = average for the position
                raw = overall + (tilt - 0.5) * 24 + rng.gauss(0, 3)
                if raw > 90:  # soft ceiling, so stars still differ from each other
                    raw = 90 + (raw - 90) * 9 / (raw - 90 + 9)
                return int(round(max(30, raw)))

            t = {}
            for name in ATHLETIC:
                tilt = athletic_pct[name].get(pid)
                t[name] = scaled(tilt if tilt is not None else rng.uniform(0.3, 0.7))
            for trait in POSITION_TRAITS.get(pos, []):
                parts, weights = [], []
                if pid in prod_pct[trait]:
                    parts.append(prod_pct[trait][pid])
                    weights.append(1.0)
                for tpos, ttrait, athletic, w in ATHLETIC_TILTS:
                    if tpos == pos and ttrait == trait and pid in athletic_pct[athletic]:
                        parts.append(athletic_pct[athletic][pid])
                        weights.append(w)
                tilt = float(np.average(parts, weights=weights)) if parts else rng.uniform(0.3, 0.7)
                t[trait] = scaled(tilt)
            traits[pid] = t
    return traits

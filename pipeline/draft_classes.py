"""Builds the real draft classes a save can play: every player drafted from
2002 to 2026, the undrafted players who were invited to the combine or made
a club, and the early 2027 board.

    python pipeline/draft_classes.py

Writes data/draft-classes/classes.json and schools.json (the schools outside the
game's FBS list, placed at their state's center for scouting travel). Sources, all open: nflverse
draft_picks (every pick), combine (measurables and the undrafted invitees),
players (birth dates, undrafted rookies), and the game's own season packs
(data/packs and data/league-2026), whose hidden ratings say what each player
turned into on the game's scale.

What a prospect becomes (engine only) comes from his real career: the mean of
his three best seasons in the packs after his draft year, with seasons out of
the league counted low. Classes too recent to have three seasons lean on what
their draft slot usually becomes; the 2026 class and the 2027 board have no
career yet, so the game draws theirs like a generated class. The 2027 board is
PFF's early top 150 (November 2026); the rest of that class is made up in game.
"""

import gzip
import json
import math
import sys
import zlib
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CACHE = HERE / ".cache"
OUT = ROOT / "data" / "draft-classes" / "classes.json"
sys.path.insert(0, str(HERE / "draft"))
from schools import norm, slug  # noqa: E402
from small_schools import CENTER, SMALL  # noqa: E402

FIRST, LAST = 2000, 2026
# Pro Football Reference club codes to the game's.
TEAM_FIX = {"KAN": "KC", "SFO": "SF", "GNB": "GB", "NWE": "NE", "NOR": "NO", "TAM": "TB", "SDG": "LAC", "STL": "LA", "RAM": "LA",
            "LAR": "LA", "OAK": "LV", "RAI": "LV", "LVR": "LV", "SD": "LAC"}
BASE = "https://github.com/nflverse/nflverse-data/releases/download"


def fetch(path: str) -> Path:
    import urllib.request
    CACHE.mkdir(exist_ok=True)
    target = CACHE / path.replace("/", "__")
    if not target.exists():
        print(f"  downloading {path}")
        urllib.request.urlretrieve(f"{BASE}/{path}", target)
    return target


# Every player's hidden rating by season, from the game's own data.
def rating_history() -> dict:
    hist: dict = {}

    def add(season, players, ratings):
        for x in players:
            r = ratings.get(x["id"])
            if r:
                hist.setdefault(x["id"], {})[season] = (r["overall"], x["position"], r["traits"])

    for y in range(1999, 2026):
        p = json.load(gzip.open(ROOT / "data" / "packs" / f"{y}.json.gz"))
        add(y, p["players"], p["ratings"])
    add(2026, json.load(open(ROOT / "data/league-2026/players.json")), json.load(open(ROOT / "data/league-2026/hidden-ratings.json")))
    return hist


POS_MAP = {"QB": "QB", "RB": "RB", "FB": "FB", "WR": "WR", "TE": "TE", "T": "OT", "OT": "OT", "G": "OG", "OG": "OG",
           "C": "C", "OL": "OG", "DE": "EDGE", "ED": "EDGE", "DT": "IDL", "NT": "IDL", "DL": "IDL", "DI": "IDL", "ILB": "LB",
           "LB": "LB", "MLB": "LB", "CB": "CB", "S": "S", "SAF": "S", "FS": "S", "SS": "S", "K": "K", "P": "P", "LS": "LS",
           "HB": "RB", "OLB": "OLB", "DB": "DB"}


def position(raw: str, weight: float | None) -> str:
    p = POS_MAP.get(str(raw).upper(), "LB")
    if p == "OLB":
        return "EDGE" if (weight or 245) >= 240 else "LB"
    if p == "DB":
        return "S" if (weight or 195) >= 200 else "CB"
    return p


def height(v) -> int | None:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v)
    if "-" in s:
        a, b = s.split("-")[:2]
        return int(a) * 12 + int(b)
    try:
        return int(float(s))
    except ValueError:
        return None


def num(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else v


def hashf(s: str) -> float:
    return (zlib.crc32(s.encode()) & 0xFFFFFF) / 0xFFFFFF


def main():
    teams = json.load(open(ROOT / "data/college-2026/teams.json"))["teams"]
    fbs = {t["school"]: t["id"] for t in teams}
    hist = rating_history()
    picks = pd.read_csv(fetch("draft_picks/draft_picks.csv"))
    combine = pd.read_csv(fetch("combine/combine.csv"))
    players = pd.read_csv(fetch("players/players.csv"), low_memory=False)
    by_gsis = players.set_index("gsis_id")
    by_pfr = players.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id").set_index("pfr_id")
    comb_pfr = combine.dropna(subset=["pfr_id"]).drop_duplicates("pfr_id").set_index("pfr_id")

    small: dict = {}
    # Each state's scouting region, from the FBS programs there; the rest by hand.
    REGION = {"SD": "Midwest", "MT": "West", "ME": "Northeast", "NH": "Northeast", "RI": "Northeast", "VT": "Northeast", "DC": "Northeast",
              "AB": "West", "BC": "West", "SK": "Midwest", "MB": "Midwest", "ON": "Northeast", "QC": "Northeast", "NS": "Northeast"}
    for t in teams:
        REGION.setdefault(t["state"], t["region"])
    missing: dict = {}

    def school_id(name) -> str:
        n = norm(str(name).split(";")[0]) if num(name) is not None else "Unknown"
        if n in fbs:
            return fbs[n]
        info = SMALL.get(n)
        if not info:
            missing[n] = missing.get(n, 0) + 1
            info = ("??", None)
        sid = slug(info[1] or n)
        if sid not in small:
            lat, lon = CENTER.get(info[0], CENTER["??"])
            small[sid] = [info[1] or n, info[0], lat, lon, REGION.get(info[0], "Midwest")]
        return sid

    def career(gsis, season):
        """Settled level (mean of the three best later seasons), first-season level, the trait shape and position."""
        h = hist.get(gsis, {}) if isinstance(gsis, str) else {}
        later = {s: v for s, v in h.items() if s > season}
        avail = 2026 - season
        k = min(3, avail)
        if k == 0:
            return None
        vals = sorted((v[0] for v in later.values()), reverse=True)
        lvl = sum((vals + [45] * k)[:k]) / k
        first = later.get(season + 1, (None,))[0]
        shape = None
        pos = None
        if later:
            best = max(later.items(), key=lambda kv: kv[1][0])[1]
            pos = best[1]
            shape = {t: v - best[0] for t, v in best[2].items()}
        return lvl, first, shape, pos, k

    rows_by_year: dict = {}
    for year in range(FIRST, LAST + 1):
        rows = []
        d = picks[picks.season == year].sort_values("pick")
        drafted_pfr = set(d.pfr_player_id.dropna())
        drafted_gsis = set(d.gsis_id.dropna())
        for _, x in d.iterrows():
            pl = by_gsis.loc[x.gsis_id] if isinstance(x.gsis_id, str) and x.gsis_id in by_gsis.index else None
            if isinstance(pl, pd.DataFrame):
                pl = pl.iloc[0]
            cb = comb_pfr.loc[x.pfr_player_id] if isinstance(x.pfr_player_id, str) and x.pfr_player_id in comb_pfr.index else None
            rows.append(entry(year, x.pfr_player_name, x.college, x.position, int(x.pick), x.team, x.gsis_id, pl, cb, school_id, career))
        # Undrafted: combine invitees, and rookies who made a club and stuck.
        und = []
        cu = combine[(combine.season == year) & combine.draft_ovr.isna()]
        seen = set()
        for _, cb in cu.iterrows():
            if isinstance(cb.pfr_id, str) and cb.pfr_id in drafted_pfr:
                continue
            pl = by_pfr.loc[cb.pfr_id] if isinstance(cb.pfr_id, str) and cb.pfr_id in by_pfr.index else None
            g = pl.gsis_id if pl is not None else None
            if g in drafted_gsis:
                continue
            seen.add(g or cb.player_name)
            und.append(entry(year, cb.player_name, cb.school, cb.pos, 0, None, g, pl, cb, school_id, career, invited=True))
        ur = players[players.draft_pick.isna() & (players.rookie_season == year)]
        need = 2 if year <= 2024 else 1
        for _, pl in ur.iterrows():
            g = pl.gsis_id
            if g in seen or g in drafted_gsis:
                continue
            n_later = sum(1 for s in hist.get(g, {}) if s > year)
            if n_later < need and not (year == 2026 and g in hist):
                continue
            cb = comb_pfr.loc[pl.pfr_id] if isinstance(pl.pfr_id, str) and pl.pfr_id in comb_pfr.index else None
            und.append(entry(year, pl.display_name, pl.college_name, pl.position, 0, None, g, pl, cb, school_id, career))
        # The public's order for the undrafted: invitees first, otherwise no better than a coin flip.
        und.sort(key=lambda r: (0 if r["inv"] else 1, hashf(r["name"] + str(year))))
        # A class runs to about 560: the undrafted who never made a club give way first.
        room = max(0, 560 - len(rows))
        if len(und) > room:
            keep = sorted(und, key=lambda r: (not r["inv"], -(r["lvl"] or 0)))[:room]
            und = [r for r in und if any(r is k for k in keep)]
        rows += und
        rows_by_year[year] = rows

    # What a draft slot usually becomes, fitted on classes with three seasons
    # behind them (2011 on, as when the curve was first set, so the later
    # classes read the same however far back the earlier ones go).
    pts = []
    for year in range(2011, 2024):
        for i, r in enumerate(rows_by_year[year]):
            if r["lvl"] is not None:
                pts.append((r["pick"] or 270 + i * 0, r["lvl"]))
    curve = []
    for lo, hi in [(1, 10), (11, 32), (33, 64), (65, 100), (101, 140), (141, 180), (181, 220), (221, 262), (270, 271)]:
        v = [l for p, l in pts if lo <= p <= hi]
        curve.append(((lo + hi) / 2, sum(v) / len(v)))
    print("slot curve", [(round(a), round(b, 1)) for a, b in curve])

    def expect(pick):
        p = pick or 270
        for (x0, y0), (x1, y1) in zip(curve, curve[1:]):
            if p <= x1:
                return y0 + (y1 - y0) * (max(p, x0) - x0) / (x1 - x0)
        return curve[-1][1]

    out = {}
    for year, rows in rows_by_year.items():
        cls = []
        for r in rows:
            truth = None
            if r["lvl"] is not None:
                e = expect(r["pick"])
                w = r["k"] / 3
                pot = w * r["lvl"] + (1 - w) * e - 1
                first = r["first"]
                ent = min(pot, 0.5 * first + 0.5 * pot - 1.5) if first is not None else pot - 5
                truth = [round(max(35, min(94, ent))), round(max(35, min(97, pot))), round(pot - e, 1)]
            shape = None
            if r["shape"] and r["gpos"] == r["pos"]:
                shape = [round(v) for v in r["shape"].values()]
            cls.append([r["name"], r["school"], r["pos"], r["birth"], r["ht"], r["wt"], r["forty"], r["pick"], TEAM_FIX.get(r["team"], r["team"]) if r["team"] else "",
                        truth, shape, 1 if r["inv"] else 0])
        out[year] = cls
        drafted = sum(1 for c in cls if c[7])
        known = [c for c in cls if c[9]]
        print(year, len(cls), "drafted", drafted, "with careers", len(known))

    board = pd.read_csv(HERE / "draft" / "board_2027.csv")
    out[2027] = [[r["name"], school_id(r["school"]), position(r["position"], None), None, None, None, None, int(r["rank"]), "",
                  None, None, 1] for _, r in board.iterrows()]

    if missing:
        print("schools with no location:", sorted(missing.items(), key=lambda kv: -kv[1]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    json.dump({"classes": out}, open(OUT, "w"), separators=(",", ":"))
    # Kept apart so the college world can place these schools without loading the classes.
    json.dump(dict(sorted(small.items())), open(OUT.parent / "schools.json", "w"), separators=(",", ":"))
    print("wrote", OUT, OUT.stat().st_size // 1024, "KB")


def entry(year, name, college, raw_pos, pick, team, gsis, pl, cb, school_id, career, invited=False):
    wt = num(cb.wt) if cb is not None else None
    if wt is None and pl is not None:
        wt = num(pl.weight)
    ht = height(cb.ht) if cb is not None else None
    if ht is None and pl is not None:
        ht = height(pl.height)
    birth = pl.birth_date if pl is not None and isinstance(pl.birth_date, str) else None
    forty = num(cb.forty) if cb is not None else None
    c = career(gsis, year)
    pos = position(raw_pos, wt)
    gpos = c[3] if c else None
    if gpos and gpos != pos and gpos in POS_MAP.values():
        pos = gpos
    return {
        "name": str(name), "school": school_id(college), "pos": pos, "birth": birth, "ht": ht, "wt": int(wt) if wt else None,
        "forty": float(forty) if forty else None, "pick": pick, "team": team, "inv": invited,
        "lvl": c[0] if c else None, "first": c[1] if c else None, "shape": c[2] if c else None, "gpos": gpos, "k": c[4] if c else 0,
    }


if __name__ == "__main__":
    main()

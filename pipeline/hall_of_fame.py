"""The Pro Football Hall of Fame and the careers it judges.

Writes data/hof/hof.json:
- classes: every real class, 1963-2026, as keys into `people`.
- people: every Hall of Famer (players, coaches, contributors) and every real
  candidate still waiting: position, years, clubs, Pro Bowls, first-team
  All-Pros, titles and awards, career totals, and season rows from 1999 on.
- pre: Pro Bowls and All-Pros before a save begins for players still active in
  some playable season, so a later vote counts the honors they already had.

Sources: nflverse's draft table (Pro Football Reference careers for every pick
since 1980: totals, Pro Bowls, All-Pros, the Hall flag), nflverse season stats
(1999 on), nflverse's player table (ids for the undrafted), and the hand
compiled tables in pipeline/hof/ for everyone the draft table doesn't reach.

Run from the repo root: python pipeline/hall_of_fame.py
"""

import json
import math
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent / "hof"))
from sources import _fetch  # noqa: E402
from classes import CLASSES  # noqa: E402
from legends import PLAYERS as LEGENDS, BUILDERS as LEGEND_BUILDERS  # noqa: E402
from extras import HONORS, UNDRAFTED, SENIORS, BUILDERS, RESERVATIONS, DECEASED  # noqa: E402

ROOT = Path(__file__).parent.parent
OUT = ROOT / "data" / "hof" / "hof.json"
LAST = 2025  # last finished season before the 2026 start

POS = {"T": "OT", "OT": "OT", "G": "OG", "OG": "OG", "OL": "OG", "C": "C", "DE": "EDGE", "OLB": "LB", "DT": "IDL", "NT": "IDL",
       "DL": "IDL", "LB": "LB", "ILB": "LB", "DB": "CB", "CB": "CB", "S": "S", "SAF": "S", "FS": "S", "SS": "S", "QB": "QB",
       "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE", "K": "K", "P": "P", "LS": "LS", "KR": "WR"}
LEGEND_POS = {"DE": "EDGE", "DT": "IDL"}
# Pro Football Reference club codes in the draft table, as the game writes them.
CLUB = {"GNB": "GB", "KAN": "KC", "LAR": "LA", "LVR": "LV", "NOR": "NO", "NWE": "NE", "RAI": "LA Raiders", "RAM": "LA Rams",
        "SDG": "SD", "SFO": "SF", "TAM": "TB"}

DRAFT_COLS = {"games": "g", "pass_completions": "cmp", "pass_attempts": "att", "pass_yards": "passYds", "pass_tds": "passTd",
              "pass_ints": "int", "rush_atts": "car", "rush_yards": "rushYds", "rush_tds": "rushTd", "receptions": "rec",
              "rec_yards": "recYds", "rec_tds": "recTd", "def_solo_tackles": "tklSolo", "def_ints": "defInt", "def_sacks": "sacks"}
ALIAS = {"py": "passYds", "ptd": "passTd", "pint": "int", "ry": "rushYds", "rtd": "rushTd", "rec": "rec", "recy": "recYds",
         "rectd": "recTd", "di": "defInt", "sk": "sacks", "fg": "fgm", "xp": "xpm", "pavg": "puntAvg"}
ROW_COLS = {"games": "g", "completions": "cmp", "attempts": "att", "passing_yards": "passYds", "passing_tds": "passTd",
            "passing_interceptions": "int", "carries": "car", "rushing_yards": "rushYds", "rushing_tds": "rushTd",
            "receptions": "rec", "receiving_yards": "recYds", "receiving_tds": "recTd", "def_tackles_solo": "tklSolo",
            "def_tackle_assists": "tklAst", "def_sacks": "sacks", "def_interceptions": "defInt", "def_pass_defended": "pd",
            "def_fumbles_forced": "ff", "def_tds": "defTd", "fg_made": "fgm", "fg_att": "fga", "pat_made": "xpm"}


def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def slug(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def num(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 0
    f = float(v)
    return int(f) if f.is_integer() else round(f, 1)


def old_code(team: str, season: int) -> str:
    """nflverse writes today's club codes for every season: the game shows the
    club as it was (San Diego, Oakland, St. Louis)."""
    if team == "LAC" and season < 2017:
        return "SD"
    if team == "LV" and season < 2020:
        return "OAK"
    if team == "LA" and season < 2016:
        return "STL"
    return team


def kv(text: str, alias=None) -> dict:
    out = {}
    for part in text.split():
        k, v = part.split("=")
        k = alias.get(k, k) if alias else k
        if float(v):
            out[k] = num(float(v))
    return out


def main() -> None:
    draft = pd.read_csv(_fetch("draft_picks/draft_picks.csv", False), low_memory=False)
    players = pd.read_csv(_fetch("players/players.csv", False), low_memory=False)
    league = {p["id"] for p in json.loads((ROOT / "data" / "league-2026" / "players.json").read_text())}

    inducted = {norm(n): y for y, names in CLASSES.items() for n in names}
    people: dict[str, dict] = {}
    by_norm: dict[str, str] = {}

    def add(name: str, rec: dict) -> str:
        key = slug(name.replace(" (CB)", "-cb").replace(" (coach)", "-coach"))
        rec["n"] = re.sub(r" \((CB|coach)\)", "", name)
        if norm(name) in inducted:
            rec["hof"] = inducted[norm(name)]
        people[key] = {k: v for k, v in rec.items() if v not in (None, "", {}, [])}
        by_norm[norm(name)] = key
        return key

    # Drafted players since 1980: Hall of Famers and everyone with a case.
    for r in draft.to_dict("records"):
        name = r["pfr_player_name"]
        hof = r["hof"] is True or str(r["hof"]).upper() == "TRUE"
        to = int(r["to"]) if not pd.isna(r["to"]) else None
        pb, ap = int(num(r["probowls"])), int(num(r["allpro"]))
        gsis = r["gsis_id"] if isinstance(r["gsis_id"], str) else None
        if not hof:
            if to is None or to > LAST or (gsis and gsis in league):
                continue
            big = num(r["pass_yards"]) >= 30000 or num(r["rush_yards"]) >= 9000 or num(r["rec_yards"]) >= 10000 or num(r["def_sacks"]) >= 90 or num(r["def_ints"]) >= 45
            if pb < 3 and ap < 1 and not big and name not in HONORS:
                continue
        stats = {v: num(r[k]) for k, v in DRAFT_COLS.items() if num(r[k])}
        add(name, {"pos": POS.get(r["position"], "LB"), "kind": "player", "from": int(r["season"]), "to": to, "draft": [int(r["season"]), int(r["round"]), int(r["pick"]), CLUB.get(r["team"], r["team"])],
                   "pb": pb, "ap": ap, "hon": kv(HONORS.get(name, "")), "st": stats, "gsis": gsis, "av": int(num(r["w_av"]))})

    # Everyone the draft table doesn't reach.
    for name, pos, f, t, teams, pb, ap, rings, st, hon in LEGENDS + SENIORS:
        h = kv(hon)
        if rings:
            h["rings"] = rings
        add(name, {"pos": LEGEND_POS.get(pos, pos), "kind": "player", "from": f, "to": t, "teams": teams, "pb": pb, "ap": ap, "hon": h, "st": kv(st, ALIAS)})
    for name, kind, f, t, office, record, rings, note in LEGEND_BUILDERS:
        add(name, {"kind": kind, "from": f, "to": t, "teams": office, "record": record, "hon": {"rings": rings} if rings else {}, "note": note})
    for name, kind, f, t, office, record, rings, note, elig in BUILDERS:
        add(name, {"kind": kind, "from": f, "to": t, "teams": office, "record": record, "hon": {"rings": rings} if rings else {}, "note": note, "elig": elig})

    # Undrafted: ids from the player table, careers from the season rows below.
    for name, pos, pb, ap, hon in UNDRAFTED:
        m = players[players.display_name == name]
        if m.empty:
            print("  no id for", name)
            continue
        row = m.iloc[0]
        key = by_norm.get(norm(name))
        rec = people.get(key, {"pos": pos, "kind": "player", "pb": pb, "ap": ap, "hon": kv(hon)}) if key else {"pos": pos, "kind": "player", "pb": pb, "ap": ap, "hon": kv(hon)}
        rec["gsis"] = row["gsis_id"]
        if row["gsis_id"] in league:
            continue
        add(name, rec)

    # Season rows from 1999 on for everyone with an id.
    ids = {p["gsis"]: k for k, p in people.items() if p.get("gsis")}
    rows: dict[str, list] = {}
    for season in range(1999, LAST + 1):
        df = pd.read_csv(_fetch(f"stats_player/stats_player_reg_{season}.csv", False), low_memory=False)
        df = df[df.player_id.isin(ids)]
        for r in df.to_dict("records"):
            line = {"s": season, "t": old_code(r.get("recent_team") or r.get("team") or "", season)}
            line.update({v: num(r.get(k)) for k, v in ROW_COLS.items() if num(r.get(k))})
            rows.setdefault(ids[r["player_id"]], []).append(line)
    for key, lines in rows.items():
        p = people[key]
        p["rows"] = lines
        teams = []
        for ln in lines:
            if ln["t"] and ln["t"] not in teams:
                teams.append(ln["t"])
        if not p.get("teams"):
            p["teams"] = "/".join(teams)
        if not p.get("st"):  # undrafted: the rows are the career
            tot: dict = {}
            for ln in lines:
                for k, v in ln.items():
                    if k not in ("s", "t"):
                        tot[k] = num(tot.get(k, 0) + v)
            p["st"] = tot
            p["from"], p["to"] = lines[0]["s"], lines[-1]["s"]
        else:  # kicking and the defensive extras the draft table lacks
            for k in ("fgm", "xpm", "ff", "pd", "tklAst"):
                v = sum(ln.get(k, 0) for ln in lines)
                if v and k not in p["st"] and (k in ("fgm", "xpm")) == (p.get("pos") in ("K", "P")):
                    p["st"][k] = num(v)
    for name, extra in (("Morten Andersen", {"fgm": 565, "xpm": 849}),):
        people[by_norm[norm(name)]]["st"].update(extra)

    for name, (char, media, why) in RESERVATIONS.items():
        key = by_norm.get(norm(name))
        if key:
            people[key]["res"] = [char, media, why]

    for name in DECEASED:
        people[by_norm[norm(name)]]["d"] = 1

    classes = {}
    for y, names in CLASSES.items():
        classes[y] = []
        for n in names:
            key = by_norm.get(norm(n))
            if not key:
                raise SystemExit(f"missing Hall of Famer: {n}")
            classes[y].append(key)

    # Honors already earned by players active in a playable season (2011 on).
    pre = {}
    for r in draft.to_dict("records"):
        to = r["to"]
        if pd.isna(to) or to < 2010 or not isinstance(r["gsis_id"], str):
            continue
        pb, ap = int(num(r["probowls"])), int(num(r["allpro"]))
        if pb or ap:
            pre[r["gsis_id"]] = [pb, ap, int(r["season"]), int(to)]

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"classes": classes, "people": people, "pre": pre}, separators=(",", ":")))
    waiting = sum(1 for p in people.values() if "hof" not in p)
    print(f"{sum(len(v) for v in classes.values())} enshrined, {waiting} candidates, {len(pre)} honor lines, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

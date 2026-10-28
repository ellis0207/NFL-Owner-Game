"""The free agent pool on the day camps open in 2026.

nflverse has no snapshot of the unsigned players either, so the pool is
rebuilt from two groups that were certainly available in late July 2026:

  * players who signed with a team after Week 1 of the 2026 season without
    having been on any team at final cutdown (veterans who waited, released
    camp bodies who came back), and
  * players who were in the league in 2025 and are on no 2026 roster at all,
    minus the ones who are known to have retired.

Players cut during camp before the final cutdown are missing from the camp
rosters, so the first group also covers some of them.
"""

import re

import pandas as pd

from constants import DEPTH_TO_GAME_POSITION, SEASON
from rosters import DRAFT_CLUB_FIX, _clean, _int, game_position

# Announced retirements after the 2025 season (PFR, SI and team releases,
# through spring 2026). Players on this list who later signed anyway are in
# the first group and stay in the pool.
RETIRED_2026 = [
    "Philip Rivers", "C.J. Ham", "Adam Thielen", "Rob Havenstein", "Robert Woods", "Bradley Bozeman",
    "Dan Skipper", "Rick Lovato", "Will Clapp", "Drew Dalman", "Ryan Kelly", "Lane Johnson",
    "Marcus Davenport", "Russell Wilson", "David Bell", "Za'Darius Smith", "Xavien Howard", "Derek Carr",
    "Julio Jones", "Patrick Peterson", "Zack Martin", "Frank Ragnow", "Tyron Smith", "Terron Armstead",
    "Ryan Ramczyk", "Jason Peters", "Mike Williams", "C.J. Mosley", "Ndamukong Suh", "Brandon Graham",
    "Sam Hubbard", "David Andrews", "Micah Hyde", "Mason Crosby", "Mitch Morse", "Michael Pierce",
    "Keanu Neal", "John Cominsky", "Jordan Travis", "Chris Conley", "Kelvin Beachum", "Nick Bellore",
    "Aaron Brewer", "Lavonte David", "Graham Gano", "DeAndre Hopkins", "Marcedes Lewis", "Jake McQuaide",
    "Jason Pierre-Paul", "Jordan Poyer", "Matt Prater", "Darius Slay", "Bobby Wagner", "Pat O'Donnell",
    "Joel Bitonio", "Cornelius Lucas", "Mike Pennel", "Teddy Bridgewater",
]
# Older players with no team a year on have almost always retired, announced or not.
MAX_AGE = 37

MASTER_POSITION_FIX = {"OT": "T", "SAF": "S", "OL": "G", "DL": "DT", "DB": "CB"}


def _norm(name: str) -> str:
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", str(name).lower())
    return re.sub(r"[^a-z]", "", name)


def _age(birth: str | None) -> float | None:
    if not birth:
        return None
    y, m, _ = (int(x) for x in birth.split("-"))
    return SEASON - y + (7 - m) / 12


def _last_team(pid: str, stats: dict, snaps_by_pfr: dict, pfr: str | None, fallback: str | None) -> str | None:
    seasons = sorted(stats.get(pid, []), key=lambda s: s["season"])
    if seasons and seasons[-1].get("team"):
        return DRAFT_CLUB_FIX.get(seasons[-1]["team"], seasons[-1]["team"])
    return DRAFT_CLUB_FIX.get(fallback, fallback) if fallback else None


def build_free_agents(weekly: pd.DataFrame, camp: pd.DataFrame, master: pd.DataFrame, stats: dict,
                      snaps: dict, pass_rush: dict) -> list:
    week1 = weekly[(weekly.season == SEASON) & (weekly.week == 1)]
    in_camp = set(camp.gsis_id)
    retired_week1 = set(week1[week1.status == "RET"].gsis_id)
    on_2026 = set(weekly.gsis_id)
    master = master.drop_duplicates("gsis_id").set_index("gsis_id")
    retired = {_norm(n) for n in RETIRED_2026}

    rows = []
    # 1. Signed during the 2026 season after sitting out cutdown: their weekly row has everything.
    later = weekly[(weekly.week > 1) & ~weekly.gsis_id.isin(in_camp) & ~weekly.gsis_id.isin(retired_week1)]
    later = later.sort_values("week").drop_duplicates("gsis_id")
    for row in later.itertuples(index=False):
        if pd.isna(row.gsis_id):
            continue
        m = master.loc[row.gsis_id] if row.gsis_id in master.index else None
        rows.append({
            "id": row.gsis_id, "name": row.full_name, "first": _clean(row.first_name), "last": _clean(row.last_name),
            "depth": _clean(row.depth_chart_position), "roster_pos": row.position, "jersey": _int(row.jersey_number),
            "birth": _clean(row.birth_date), "height": _int(row.height), "weight": _int(row.weight),
            "college": _clean(row.college), "exp": _int(row.years_exp) or 0,
            "rookie_year": _int(row.rookie_year) or _int(row.entry_year),
            "draft_club": _clean(row.draft_club), "draft_number": _int(row.draft_number),
            "draft_round": None if m is None else _int(m.draft_round),
            "pfr": _clean(row.pfr_id) or (None if m is None else _clean(m.pfr_id)),
            "espn": _int(row.espn_id) or (None if m is None else _int(m.espn_id)),
            "sleeper": _clean(row.sleeper_id), "headshot": _clean(row.headshot_url),
            "fallback_team": None if m is None else _clean(m.latest_team),
        })

    # 2. In the league in 2025, on nobody's roster in 2026.
    seen = {r["id"] for r in rows}
    gone = master[(master.last_season == SEASON - 1) & ~master.index.isin(on_2026)]
    for gid, m in gone.iterrows():
        if gid in seen or m.status == "RET" or _norm(m.display_name) in retired:
            continue
        age = _age(_clean(m.birth_date))
        if age is not None and age >= MAX_AGE:
            continue
        pfr = _clean(m.pfr_id)
        played = sum((snaps.get(pfr) or {}).get(y, {}).get("games", 0) for y in (SEASON - 2, SEASON - 1)) if pfr else 0
        exp = _int(m.years_of_experience) or 0
        # Veterans who didn't play the last two years are out of the league in all but name.
        if not played and exp > 2:
            continue
        pos = _clean(m.position)
        rows.append({
            "id": gid, "name": m.display_name, "first": _clean(m.first_name), "last": _clean(m.last_name),
            "depth": MASTER_POSITION_FIX.get(pos, pos), "roster_pos": _clean(m.position_group), "jersey": _int(m.jersey_number),
            "birth": _clean(m.birth_date), "height": _int(m.height), "weight": _int(m.weight),
            "college": _clean(m.college_name), "exp": exp, "rookie_year": _int(m.rookie_season),
            "draft_club": _clean(m.draft_team), "draft_number": _int(m.draft_pick), "draft_round": _int(m.draft_round),
            "pfr": pfr, "espn": _int(m.espn_id), "sleeper": None, "headshot": _clean(m.headshot),
            "fallback_team": _clean(m.latest_team),
        })

    players = []
    for r in rows:
        row = pd.Series({"depth_chart_position": r["depth"], "position": r["roster_pos"], "weight": r["weight"]})
        pos = game_position(row, pass_rush.get(r["id"]))
        if pos not in DEPTH_TO_GAME_POSITION.values() and pos not in ("EDGE", "LB"):
            continue
        players.append({
            "id": r["id"], "name": r["name"], "firstName": r["first"], "lastName": r["last"],
            "team": None,
            "lastTeam": _last_team(r["id"], stats, snaps, r["pfr"], r["fallback_team"]),
            "position": pos, "depthChartPosition": r["depth"], "jersey": r["jersey"],
            "birthDate": r["birth"], "heightIn": r["height"], "weightLb": r["weight"], "college": r["college"],
            "yearsExp": r["exp"], "rookieYear": r["rookie_year"],
            "draft": {
                "team": DRAFT_CLUB_FIX.get(r["draft_club"], r["draft_club"]),
                "round": r["draft_round"] if r["draft_number"] else None,
                "overall": r["draft_number"],
            },
            "contract": {
                "source": "free-agent", "signedYear": None, "years": None, "totalValue": None, "apy": None,
                "guaranteed": None, "apyCapPct": None, "type": None, "otcTeam": None, "seasons": [],
            },
            "ids": {"pfr": r["pfr"], "espn": r["espn"], "sleeper": r["sleeper"]},
            "headshotUrl": r["headshot"],
        })
    return players


def waiver_order(games: pd.DataFrame) -> list:
    """Waiver priority until late September follows the 2026 draft order: teams
    that missed the 2025 playoffs worst record first, then playoff teams by how
    far they went. Ties fall back to point differential (the league uses
    strength of schedule)."""
    g = games[(games.season == SEASON - 1)]
    reg = g[g.game_type == "REG"].dropna(subset=["home_score"])
    rec: dict = {}
    for r in reg.itertuples(index=False):
        for team, pf, pa in ((r.home_team, r.home_score, r.away_score), (r.away_team, r.away_score, r.home_score)):
            w, l, t, diff = rec.get(team, (0, 0, 0, 0))
            rec[team] = (w + (pf > pa), l + (pf < pa), t + (pf == pa), diff + pf - pa)
    depth = {"WC": 1, "DIV": 2, "CON": 3, "SB": 4}
    went: dict = {}
    for r in g[g.game_type.isin(list(depth))].dropna(subset=["home_score"]).itertuples(index=False):
        loser = r.away_team if r.home_score > r.away_score else r.home_team
        went[loser] = depth[r.game_type]
        if r.game_type == "SB":
            went[r.home_team if loser == r.away_team else r.away_team] = 5

    def key(team):
        w, l, t, diff = rec[team]
        return (went.get(team, 0), (w + 0.5 * t) / max(1, w + l + t), diff)
    return sorted(rec, key=key)

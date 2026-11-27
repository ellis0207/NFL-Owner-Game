"""Builds the data pack for a historical start (1999-2025): the league as it
stood when that season's camps opened, from the same open nflverse files as
the 2026 build.

    python pipeline/history_pack.py 2015          # one season
    python pipeline/history_pack.py 2011 2025     # a range

Writes data/packs/<season>.json.gz: teams, players, hidden ratings, schedule,
staff, hidden staff and rules in one file. The game loads a pack only when a
player picks that start, so the 2026 page stays small.

What is real: rosters (the Week 1 snapshot: the 53, practice squad and reserve
lists), contracts signed by then (OverTheCap; extensions signed later are
replaced by the deal in force), the regular-season schedule, the playoff
dates, stadiums and the clubs' names and cities that season, head coaches,
the salary cap, minimum salaries and practice-squad pay and size.

What is made up or derived, and labeled as such: the preseason schedule
(generated: nflverse carries only regular-season games), the other key dates
(the league's usual rules applied to that season's kickoff), coordinators,
general managers and other staff (generated names), team schemes (drawn per
team), and team dead money (none: the archive has no per-team figure), and before about
2011 most contracts (contract_model.py: the archive covers only part of each
roster, so the rest are priced from the player's standing, draft slot and the
cap, and labeled "modeled").
Before 2002 there is no weekly roster: the camp roster is rebuilt from the
season roster (sources.season_roster), the league is 31 clubs in the old six
divisions (Houston joins in 2002), the hidden ratings also read the start
season (sources.RATING_SEASONS) and the waiver order for 1999 comes from
FiveThirtyEight's 1998 results.
Camp rosters run short of 90 before 2020 because the Week 1 snapshot then
listed no one released at cutdown; clubs fill camp from the free agent pool.
"""

import datetime as dt
import gzip
import hashlib
import json
import os
import random
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "data" / "packs"

# Real salary caps by league year (OverTheCap).
CAPS = {
    # No cap before 1994: each figure is the league's payroll ceiling, a yardstick
    # about a fifth over the clubs' average payroll (the average salary ran
    # about $352,000 in 1990, $415,000 in 1991, $488,000 in 1992 and $737,000 in
    # the first free-agent year, 1993). Clubs' payrolls are set below it by their
    # owners' budgets (price_contracts). Approximate.
    # The 1980s ceilings follow the average salary the same way (about $79,000
    # in 1980, $163,000 in 1984 and $300,000 in 1989).
    1980: 5_000_000, 1981: 5_500_000, 1982: 6_500_000, 1983: 8_500_000, 1984: 10_000_000,
    1985: 12_000_000, 1986: 12_000_000, 1987: 12_500_000, 1988: 14_500_000, 1989: 18_000_000,
    1990: 24_000_000, 1991: 28_000_000, 1992: 33_000_000, 1993: 40_000_000,
    # The cap began with the 1993 agreement, in 1994.
    1994: 34_608_000, 1995: 37_100_000, 1996: 40_753_000, 1997: 41_454_000, 1998: 52_388_000,
    1999: 57_288_000, 2000: 62_172_000, 2001: 67_405_000,
    2002: 71_101_000, 2003: 75_007_000, 2004: 80_582_000, 2005: 85_500_000, 2006: 102_000_000,
    2007: 109_000_000, 2008: 116_000_000, 2009: 123_000_000,
    # 2010 had no cap at all (the owners opted out of the 2006 extension). The
    # game keeps 2009's figure as the yardstick and marks the year uncapped.
    2010: 123_000_000,
    2011: 120_000_000, 2012: 120_600_000, 2013: 123_000_000, 2014: 133_000_000, 2015: 143_280_000,
    2016: 155_270_000, 2017: 167_000_000, 2018: 177_200_000, 2019: 188_200_000, 2020: 198_200_000,
    2021: 182_500_000, 2022: 208_200_000, 2023: 224_800_000, 2024: 255_400_000, 2025: 279_200_000,
    2026: 301_200_000,
}

# Minimum salaries by credited seasons (0, 1, 2, 3, 4-6, 7+). The 2011 CBA
# raised each step $15,000 a year; the 2020 CBA reset the table.
MINIMUMS = {
    2020: (610_000, 675_000, 750_000, 825_000, 910_000, 1_050_000),
    2021: (660_000, 780_000, 850_000, 920_000, 990_000, 1_075_000),
    2022: (705_000, 825_000, 895_000, 965_000, 1_035_000, 1_120_000),
    2023: (750_000, 870_000, 940_000, 1_010_000, 1_080_000, 1_165_000),
    2024: (795_000, 915_000, 985_000, 1_055_000, 1_125_000, 1_210_000),
    2025: (840_000, 960_000, 1_030_000, 1_100_000, 1_170_000, 1_255_000),
    2026: (885_000, 1_005_000, 1_075_000, 1_145_000, 1_215_000, 1_300_000),
    2027: (930_000, 1_050_000, 1_120_000, 1_190_000, 1_260_000, 1_345_000),
}
# The 1993 agreement as extended in 2006: rookie minimum $225,000 in 2002 and
# $320,000 in 2010; the steps between are approximate (about +3% a year).
# Rookie minimums $175,000 in 1999, $193,000 in 2000 and $209,000 in 2001.
# Rookie minimums $108,000 in 1994, $119,000 in 1995, $131,000 in 1996-97 and
# $158,000 in 1998; the steps above them approximate.
for _y, _r in ((1994, 108_000), (1995, 119_000), (1996, 131_000), (1997, 131_000), (1998, 158_000), (1999, 175_000), (2000, 193_000), (2001, 209_000)):
    MINIMUMS[_y] = (_r, _r + 75_000, _r + 150_000, _r + 225_000, _r + 310_000, _r + 435_000)
# Before the 1993 agreement: rookie minimums about $50,000 in 1990 rising to
# $75,000 in 1992, then $100,000 in 1993 (approximate).
for _y, _r in ((1990, 50_000), (1991, 60_000), (1992, 75_000), (1993, 100_000)):
    MINIMUMS[_y] = (_r, _r + 25_000, _r + 50_000, _r + 75_000, _r + 110_000, _r + 175_000)
# The 1980s: rookie minimums about $22,000 in 1980, $30,000 under the 1982
# agreement, $50,000 by 1986; the steps above them in the same proportions as
# 1990's (approximate).
for _y, _r in ((1980, 22_000), (1981, 25_000), (1982, 30_000), (1983, 35_000), (1984, 40_000), (1985, 45_000),
               (1986, 50_000), (1987, 50_000), (1988, 50_000), (1989, 50_000)):
    MINIMUMS[_y] = tuple(int(round(_r * k, -3)) for k in (1, 1.5, 2, 2.5, 3.2, 4.5))
for _y in range(2002, 2011):
    _r = 225_000 + round((_y - 2002) * 95_000 / 8, -4)
    MINIMUMS[_y] = (_r, _r + 75_000, _r + 150_000, _r + 225_000, _r + 310_000, _r + 435_000)
for _y in range(2011, 2020):
    _k = (_y - 2011) * 15_000
    MINIMUMS[_y] = (375_000 + _k, 450_000 + _k, 525_000 + _k, 600_000 + _k, 685_000 + _k, 810_000 + _k)

# Practice squad: weekly pay (standard) and size by season.
# The league's developmental squad began in 1989; before that the game keeps
# a five-man squad at the same pay (an approximation).
PS_WEEKLY = {**{_y: 1_000 for _y in range(1980, 1990)}, 1990: 1_000, 1991: 1_000, 1992: 1_000, 1993: 3_000, 1994: 3_000, 1995: 3_200, 1996: 3_500, 1997: 3_500, 1998: 3_800, 1999: 4_000, 2000: 4_150, 2001: 4_250, 2002: 4_350, 2003: 4_350, 2004: 4_700, 2005: 4_700, 2006: 4_700, 2007: 5_200, 2008: 5_200,
             2009: 5_200, 2010: 5_200, 2011: 5_700, 2012: 5_700, 2013: 6_000, 2014: 6_300, 2015: 6_600, 2016: 6_900, 2017: 7_200,
             2018: 7_600, 2019: 8_000, 2020: 8_400, 2021: 9_200, 2022: 11_500, 2023: 12_000, 2024: 12_500,
             2025: 13_000}


def ps_size(season: int) -> int:
    if season <= 2003:
        return 5
    if season <= 2013:
        return 8
    if season <= 2019:
        return 10
    if season <= 2021:
        return 16
    return 17  # 16 plus one International Pathway player


def identity(season: int) -> dict:
    """Clubs whose city or name differed that season (ids stay the current ones)."""
    out = {}
    if season <= 1993:
        out["ARI"] = ("St. Louis" if season <= 1987 else "Phoenix", "Cardinals")
    if season <= 1983:
        out["IND"] = ("Baltimore", "Colts")
    if season <= 2015:
        out["LA"] = ("Los Angeles" if season <= 1994 else "St. Louis", "Rams")
    if season <= 2016:
        out["LAC"] = ("San Diego", "Chargers")
    if season <= 2019:
        out["LV"] = ("Oakland" if season <= 1981 or season >= 1995 else "Los Angeles", "Raiders")
    if season <= 1998:
        out["TEN"] = ("Houston" if season <= 1996 else "Tennessee", "Oilers")
    if season <= 1995:
        out["BAL"] = ("Cleveland", "Browns")
    out["WAS"] = ("Washington", "Redskins" if season <= 2019 else "Football Team" if season <= 2021 else "Commanders")
    return out


# Before the 2002 realignment: 31 clubs in three divisions a conference (ids
# are the current ones: LA is St. Louis, LAC San Diego, LV Oakland).
OLD_ALIGNMENT = {
    "AFC": {"East": ["BUF", "IND", "MIA", "NE", "NYJ"], "Central": ["BAL", "CIN", "CLE", "JAX", "PIT", "TEN"],
            "West": ["DEN", "KC", "LAC", "LV", "SEA"]},
    "NFC": {"East": ["ARI", "DAL", "NYG", "PHI", "WAS"], "Central": ["CHI", "DET", "GB", "MIN", "TB"],
            "West": ["ATL", "CAR", "LA", "NO", "SF"]},
}


def alignment(season: int, teams: list, present: set | None = None) -> list:
    """(abbr, city, name, conference, division) for the clubs that played that season."""
    if season >= 2002:
        return teams
    where = {t: (conf, div) for conf, divs in OLD_ALIGNMENT.items() for div, ids in divs.items() for t in ids}
    return [(a, city, name, *where[a]) for a, city, name, _, _ in teams if a in where and (present is None or a in present)]


WEST = {"DEN", "LV", "LAC", "SF", "SEA", "ARI"}


def fill_times(games, season: int):
    """nflverse has no kickoff times for 1999: the usual slots of the day
    (Sunday 1 PM, 4:05 PM at western clubs, Monday 9 PM, Thursday 8:30 PM,
    late-season Saturdays 12:30 and 4 PM, the Super Bowl at 6:25 PM). Approximate."""
    rows = (games.season == season) & games.gametime.isna()
    if not rows.any():
        return games
    games = games.copy()

    def slot(r):
        day = dt.date.fromisoformat(r.gameday).weekday()
        if r.game_type == "SB":
            return "18:25"
        if day == 0:
            return "21:00"
        if day == 3:
            return "20:30"
        if day == 5:
            return "16:00" if r.home_team in WEST else "12:30"
        return "16:05" if r.home_team in WEST else "13:00"
    games.loc[rows, "gametime"] = [slot(r) for r in games[rows].itertuples(index=False)]
    return games


def _rng(key: str) -> random.Random:
    return random.Random(int(hashlib.sha256(key.encode()).hexdigest()[:12], 16))


def _iso(d: dt.date) -> str:
    return d.isoformat()


def key_dates(season: int, games) -> dict:
    """Real kickoff, season end and playoff dates; the rest by the league's usual rules."""
    reg = games[(games.season == season) & (games.game_type == "REG")]
    post = games[(games.season == season) & (games.game_type != "REG")]
    k = dt.date.fromisoformat(reg.gameday.min())
    end = dt.date.fromisoformat(reg.gameday.max())
    day = lambda t: dt.date.fromisoformat(post[post.game_type == t].gameday.min())
    nxt = season + 1
    mar1 = dt.date(nxt, 3, 1)
    nly = mar1 + dt.timedelta(days=(2 - mar1.weekday()) % 7 + 7)  # second Wednesday of March
    apr24 = dt.date(nxt, 4, 24)
    draft = apr24 + dt.timedelta(days=(3 - apr24.weekday()) % 7)
    ext = dt.date(season, 7, 15)
    ext += dt.timedelta(days={5: 2, 6: 1}.get(ext.weekday(), 0))
    cut = k - dt.timedelta(days=9)
    deadline = k + dt.timedelta(days=61)
    meeting = nly + dt.timedelta(days=10)
    meeting += dt.timedelta(days=(6 - meeting.weekday()) % 7)
    return {
        "franchiseTagExtensionDeadline": _iso(ext),
        "hallOfFameGame": _iso(k - dt.timedelta(days=35)),
        "rosterCutdown": _iso(cut),
        "cutdownWaiversExpire": _iso(cut + dt.timedelta(days=1)),
        "practiceSquadSigningOpens": _iso(cut + dt.timedelta(days=1)),
        "regularSeasonStart": _iso(k),
        "waiverOrderByStandings": _iso(k + dt.timedelta(days=19)),
        "tradeDeadline": _iso(deadline),
        "veteranWaiversBegin": _iso(deadline + dt.timedelta(days=1)),
        "unsignedTenderDeadline": _iso(deadline + dt.timedelta(days=7)),
        "regularSeasonEnd": _iso(end),
        "reserveFutureSigningsOpen": _iso(end + dt.timedelta(days=1)),
        "postseasonRosterFreeze": _iso(end + dt.timedelta(days=3)),
        "wildCardWeekend": _iso(day("WC")),
        "divisionalRound": _iso(day("DIV")),
        "conferenceChampionships": _iso(day("CON")),
        "superBowl": _iso(day("SB")),
        "franchiseTagWindowOpens": _iso(nly - dt.timedelta(days=22)),
        "scoutingCombineStart": _iso(nly - dt.timedelta(days=10)),
        "franchiseTagDeadline": _iso(nly - dt.timedelta(days=8)),
        "negotiatingWindowOpens": _iso(nly - dt.timedelta(days=2)),
        "newLeagueYear": _iso(nly),
        "annualLeagueMeeting": _iso(meeting),
        "draftStart": _iso(draft),
    }


def rules_for(season: int, games) -> dict:
    m, n = MINIMUMS[season], MINIMUMS[season + 1]
    table = lambda t: dict(zip(("0", "1", "2", "3", "4", "7"), t))
    weekly = PS_WEEKLY[season]
    return {
        "season": season,
        # 2010 had no cap: the game's ceiling sits about 6% over 2009's (pack.ts REAL_CAPS).
        "salaryCap": 130_000_000 if season == 2010 else CAPS[season],
        **({"uncapped": True} if season == 2010 or season < 1994 else {}),
        "minimumSalary": table(m),
        "minimumSalaryNextYear": table(n),
        "practiceSquadWeekly": {"standard": weekly, "veteranMin": round(weekly * 1.33, -1), "veteranMax": round(weekly * 1.66, -1)},
        "rosterLimits": {"offseason": 90, "regularSeason": 53, "practiceSquad": ps_size(season), "gameDayActive": 45 if season < 2011 else 46 if season < 2020 else 48},
        "veteranReportDaysBeforeOpener": 47,
        "veteranReportDaysBeforeMondayOpener": 48,
        "rookieEarlyReportDays": 7,
        "keyDates": key_dates(season, games),
        # The real tables for every year to 2027, so later seasons keep the real minimums.
        "minimumByYear": {str(y): table(MINIMUMS[y]) for y in range(season, 2028)},
        # Last season's playoff clubs (incentives read them).
        "lastPlayoffs": last_playoffs(season - 1, games),
    }


def last_playoffs(season: int, games) -> list:
    post = games[(games.season == season) & (games.game_type != "REG")]
    return sorted(set(post.home_team) | set(post.away_team))


def preseason(season: int, keys: dict, teams: list) -> tuple[dict, list]:
    """Generated: nflverse carries no preseason games. Four weeks before 2021, three after."""
    rng = _rng(f"preseason:{season}")
    k = dt.date.fromisoformat(keys["regularSeasonStart"])
    pair = rng.sample(teams, 2)
    hof = {"week": 0, "date": keys["hallOfFameGame"], "time": "20:00", "away": pair[0], "home": pair[1],
           "neutral": True, "stadium": "Tom Benson Hall of Fame Stadium" if season >= 2016 else "Fawcett Stadium",
           "city": "Canton, OH"}
    weeks = 4 if season < 2021 else 3
    games = []
    for w in range(1, weeks + 1):
        order = teams[:]
        rng.shuffle(order)
        thursday = k - dt.timedelta(days=14 + 7 * (weeks - w))
        # With an odd number of clubs one sits the week out.
        for i in range(0, len(order) - 1, 2):
            day = thursday + dt.timedelta(days=(i // 2) % 4)
            away, home = (order[i], order[i + 1]) if rng.random() < 0.5 else (order[i + 1], order[i])
            games.append((w, _iso(day), "19:00" if day.weekday() != 6 else "13:00", away, home))
    return hof, games


def playoff_slots(season: int, games) -> tuple[list, dict]:
    post = games[(games.season == season) & (games.game_type != "REG")].sort_values(["gameday", "gametime"])
    names = {"WC": "WC", "DIV": "DIV", "CON": "CONF", "SB": "SB"}
    slots = [(names[r.game_type], r.gameday, r.gametime) for r in post.itertuples(index=False)]
    sb = post[post.game_type == "SB"].iloc[0]
    site = {"stadium": sb.stadium, "city": None, "stadiumId": sb.stadium_id}
    return slots, site


def head_coaches(season: int, games) -> dict:
    reg = games[(games.season == season) & (games.game_type == "REG")].sort_values("gameday")
    out = {}
    for r in reg.itertuples(index=False):
        out.setdefault(r.home_team, r.home_coach)
        out.setdefault(r.away_team, r.away_coach)
    return out


def build_staff_for(season: int, games, teams: list):
    """Real head coaches; generated coordinators, GMs and support staff (made up)."""
    from staff_2026 import ATTRS, DEFENSE_SCHEMES, FIRST, LAST, OFFENSE_SCHEMES, _slug
    hcs = head_coaches(season, games)
    people, hidden, used, schemes = [], {}, set(), {}
    offs, defs = list(OFFENSE_SCHEMES), list(DEFENSE_SCHEMES)
    for team in teams:
        rng = _rng(f"staff:{season}:{team}")
        schemes[team] = {"offense": rng.choice(offs), "defense": rng.choice(defs)}
        def person(role, name=None, generated=False):
            while not name or name in used:
                name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                generated = True
            used.add(name)
            born = rng.randint(1950, 1975) if role == "HC" else rng.randint(1955, 1985)
            sid = f"{_slug(name)}-{born}"
            side = "offense" if role == "OC" else "defense" if role == "DC" else ("offense" if rng.random() < 0.6 else "defense") if role == "HC" else None
            calls = ["offense"] if role == "OC" else ["defense"] if role == "DC" else []
            people.append({
                "id": sid, "name": name, "team": team, "role": role, "birthYear": born, "birthYearEstimated": True,
                "hiredYear": season - rng.randint(0, 5), "background": None, "side": side, "callsPlays": calls,
                "scheme": schemes[team]["offense"] if side == "offense" else schemes[team]["defense"] if side == "defense" else None,
                **({"generated": True} if generated else {}),
            })
            attrs = ATTRS.get(role) or {"TRN": ("prevention", "recovery"), "PRO": ("evaluation",), "COL": ("evaluation",)}[role]
            hidden[sid] = {a: int(min(90, max(42, rng.gauss(66, 8)))) for a in attrs}
        person("HC", hcs.get(team))
        for role in ("OC", "DC", "STC", "GM", "TRN", "PRO", "COL"):
            person(role)
    return people, hidden, schemes


def season_minimum(years_exp: int, year: int) -> int:
    """That league year's minimum salary for a player's credited seasons (real tables to 2027, +4% a year after)."""
    t = MINIMUMS[min(year, 2027)]
    step = 5 if years_exp >= 7 else 4 if years_exp >= 4 else max(0, years_exp)
    return round(t[step] * 1.04 ** max(0, year - 2027), -3)


def price_contracts(season: int, players: list, ratings: dict) -> None:
    """Players with no deal on record: a modeled deal (contract_model.py) or that
    season's minimum. The estimated minimums the roster step wrote used the 2026
    table, so they are redone at the season's own figures."""
    from contract_model import model_contract
    cap = CAPS[season]
    modeled = 0
    for p in players:
        c = p["contract"]
        if c.get("source") != "estimated-minimum":
            continue
        deal = model_contract(p, ratings[p["id"]]["overall"], season, cap, season_minimum)
        if deal:
            modeled += 1
            p["contract"] = deal
            continue
        for s in c["seasons"]:
            pay = season_minimum((p.get("yearsExp") or 0) + s["year"] - season, s["year"])
            s.update({"baseSalary": pay, "capHit": pay})
        c["apy"] = c["seasons"][0]["baseSalary"]
        c["totalValue"] = sum(s["baseSalary"] for s in c["seasons"])
    # A few archive rows carry a cap hit off by a factor of 100 (Haynesworth's
    # 2006 reads $174.5M): any season over 30% of the cap falls back to the APY.
    for p in players:
        c = p["contract"]
        for s in c["seasons"]:
            if s["capHit"] > 0.3 * cap:
                pay = int(c.get("apy") or 0) if (c.get("apy") or 0) < 0.3 * cap else season_minimum(p.get("yearsExp") or 0, s["year"])
                s.update({"baseSalary": pay, "proratedBonus": 0, "rosterBonus": 0, "optionBonus": 0,
                          "workoutBonus": 0, "otherBonus": 0, "capHit": pay})
    # Clubs spent close to the cap (most ended a season within a few million of
    # it), so each club's modeled veteran deals are scaled toward a payroll of
    # 90-98% of the cap, up or down, never below the minimum.
    by_team = {}
    for p in players:
        by_team.setdefault(p["team"], []).append(p)
    for team, mine in by_team.items():
        hit = lambda p: next((s["capHit"] for s in p["contract"]["seasons"] if s["year"] == season), 0)
        total = sum(hit(p) for p in mine)
        # Before the cap each owner set his own budget: payrolls ran from about two-thirds of the ceiling to nearly all of it.
        target = cap * _rng(f"payroll:{season}:{team}").uniform(*((0.66, 0.94) if season < 1994 else (0.90, 0.98)))
        flex = [p for p in mine if p["contract"]["source"] == "modeled" and p["contract"]["type"] == "UFA"]
        room = sum(hit(p) for p in flex)
        if not room:
            continue
        # A club already past the target (a big camp roster, the deals on record) has its modeled deals cut back instead.
        k = min(2.2, max(0.2, 1 + (target - total) / room))
        for p in flex:
            c = p["contract"]
            # The era's top deals ran about 12% of the cap for a quarterback, 9% for anyone else.
            top = cap * (0.12 if p["position"] == "QB" else 0.09)
            for s in c["seasons"]:
                floor = season_minimum((p.get("yearsExp") or 0) + s["year"] - season, s["year"])
                s["baseSalary"] = s["capHit"] = int(max(floor, round(min(s["capHit"] * k, top * 1.03 ** (s["year"] - season)), -3)))
            c["apy"] = c["seasons"][0]["baseSalary"]
            c["totalValue"] = sum(s["baseSalary"] for s in c["seasons"])
            c["apyCapPct"] = round(c["apy"] / cap, 4)
    print(f"  {modeled} modeled contracts")


def build(season: int) -> Path:
    os.environ["NFL_SEASON"] = str(season)
    sys.path.insert(0, str(HERE))
    import build_league as bl
    import schedule as sch
    from constants import TEAMS
    from free_agents import build_free_agents, waiver_order
    from ratings import rate_players
    from rosters import build_camp_rosters, build_players
    from sources import load_all
    from stats import pass_rush_rates, season_snaps, season_stats
    from traits import build_traits
    from staff_2026 import DEFENSE_SCHEMES, OFFENSE_SCHEMES

    data = load_all(False)
    games = data["games"]
    if season < 1999:
        # Before nflverse's schedule: the season itself from FiveThirtyEight, with the real stadiums and coaches.
        import pandas as pd
        from old_seasons import old_schedule
        from sources import fte_games
        fte = fte_games(season)
        present = set(fte.home_team) | set(fte.away_team)
        division = {t[0]: (t[3], t[4]) for t in alignment(season, TEAMS, present)}
        games = pd.concat([games, old_schedule(fte, season, division)], ignore_index=True)
    if season - 1 < 1999:
        # nflverse games begin in 1999: last season's results (waiver order, playoff clubs) from FiveThirtyEight.
        import pandas as pd
        from sources import fte_games
        games = pd.concat([games, fte_games(season - 1)], ignore_index=True)
    games = fill_times(games, season)
    rules = rules_for(season, games)
    stats = season_stats(data["stats"])
    snaps = season_snaps(data["snaps"])
    rating_stats = season_stats(data["rating_stats"])
    rush = pass_rush_rates(data["rating_stats"])
    camp = build_camp_rosters(data["weekly_rosters"])
    players, coverage = build_players(camp, data["contracts"], data["players"], rush)
    players = [p for p in players if isinstance(p["id"], str)]
    for p in players:
        p["stats"] = stats.get(p["id"], [])
        p["snaps"] = (snaps.get(p["ids"]["pfr"]) or {}) if p["ids"]["pfr"] else {}
    career = {}
    if season < 1999:
        # No defensive or kicking totals before 1999: careers fill in (old_stats.py).
        import pandas as pd
        from old_stats import career_signal
        from sources import _fetch, seasons_listed
        picks = pd.read_csv(_fetch("draft_picks/draft_picks.csv", False), low_memory=False)
        career = career_signal(players, season, picks, seasons_listed(1985, 2010))
    ratings = rate_players(players, rating_stats, snaps, career=career)
    free_agents = build_free_agents(data["weekly_rosters"], camp, data["players"], stats, snaps, rush)
    # A few old rows have no player id at all: they can't be tracked, so they're left out.
    rostered = {p["id"] for p in players}
    free_agents = [p for p in free_agents if isinstance(p["id"], str) and p["id"] not in rostered]
    for p in free_agents:
        p["stats"] = stats.get(p["id"], [])
        p["snaps"] = (snaps.get(p["ids"]["pfr"]) or {}) if p["ids"]["pfr"] else {}
    if career:
        career.update(career_signal(free_agents, season, picks, seasons_listed(1985, 2010)))
    combined = rate_players(players + free_agents, rating_stats, snaps, unsigned={p["id"] for p in free_agents}, career=career)
    for p in free_agents:
        ratings[p["id"]] = combined[p["id"]]
    traits = build_traits(players + free_agents, ratings, data["rating_stats"], data["combine"])
    price_contracts(season, players, ratings)

    # Some Week 1 snapshots (2016-2019) still list everyone released at the
    # cutdown, past a 90-man camp. The weakest of those go back to the pool.
    week1 = dict(zip(camp.gsis_id, camp.status))
    for team in {p["team"] for p in players}:
        mine = [p for p in players if p["team"] == team]
        keep = {"ACT", "INA", "RES"}
        cut = sorted(mine, key=lambda p: (week1.get(p["id"]) in keep, ratings[p["id"]]["overall"]))
        for p in cut[:max(0, len(mine) - 90)]:
            p.update({"team": None, "lastTeam": team, "contract": {**p["contract"], "source": "free-agent", "seasons": []}})
    released = [p for p in players if p["team"] is None]
    players = [p for p in players if p["team"] is not None]
    free_agents = released + free_agents

    league = alignment(season, TEAMS, set(games[games.season == season].home_team))
    team_ids = [t[0] for t in league]
    sch.DIVISION = {t[0]: (t[3], t[4]) for t in league}
    sch.HALL_OF_FAME_GAME, sch.PRESEASON_GAMES = preseason(season, rules["keyDates"], team_ids)
    sch.PLAYOFF_SLOTS, sch.SUPER_BOWL_SITE = playoff_slots(season, games)
    stadiums = sch.home_stadiums(games)
    schedule = sch.build_schedule(games, stadiums)
    names = identity(season)
    teams = [{
        "id": abbr, "city": names.get(abbr, (city, name))[0], "name": names.get(abbr, (city, name))[1],
        "conference": conf, "division": div, **stadiums[abbr],
        "cap2026": {"adjustedCap": CAPS[season], "deadMoney": 0},
    } for abbr, city, name, conf, div in league]
    staff, staff_hidden, schemes = build_staff_for(season, games, team_ids)

    pack = {
        "season": season,
        "teams": teams,
        "players": players + free_agents,
        "ratings": {pid: {**{k: v for k, v in r.items() if k != "signals"}, "traits": traits[pid]} for pid, r in ratings.items()},
        "schedule": schedule,
        "staff": {"people": staff, "teamSchemes": schemes, "schemeNames": {"offense": OFFENSE_SCHEMES, "defense": DEFENSE_SCHEMES}},
        "hiddenStaff": staff_hidden,
        "rules": {**rules, "waiverOrder": waiver_order(games)},
        "coverage": coverage,
    }
    pack = bl._no_nan(pack)
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{season}.json.gz"
    raw = json.dumps(pack, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    path.write_bytes(gzip.compress(raw, 9, mtime=0))
    from pack_careers import add as add_careers
    add_careers(season)
    reg = [g for g in schedule if g["type"] == "REG"]
    by_team = {}
    for p in players:
        by_team[p["team"]] = by_team.get(p["team"], 0) + 1
    print(f"{season}: {len(players)} rostered ({min(by_team.values())}-{max(by_team.values())} a team), "
          f"{len(free_agents)} free agents, {len(reg)} games, {path.stat().st_size / 1024:.0f} KB packed, coverage {coverage}")
    return path


if __name__ == "__main__":
    a = int(sys.argv[1])
    b = int(sys.argv[2]) if len(sys.argv) > 2 else a
    if a == b:
        build(a)
    else:
        # Each season in its own process: the build modules read the season at import.
        for y in range(a, b + 1):
            subprocess.run([sys.executable, __file__, str(y)], check=True)

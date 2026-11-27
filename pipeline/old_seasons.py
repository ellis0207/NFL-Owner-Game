"""The 1980-1998 seasons, which nflverse's schedule file doesn't reach.

Dates and scores come from FiveThirtyEight (sources.fte_games). Kickoff times
are the usual slots of the day (history_pack.fill_times). Home stadiums, the
Super Bowl sites and opening-day head coaches are the real ones, entered by
hand below. Ids are the game's: the Oilers are Tennessee's club, the 1994-95
Browns Baltimore's (they moved in 1996), the Los Angeles Rams and Raiders the
LA and LV clubs, the Baltimore Colts Indianapolis's and the St. Louis
Cardinals Arizona's.
"""

import datetime as dt

import pandas as pd

# (first season, last season, stadium, roof, surface) for each club's home.
_HOMES = {
    "ARI": [(1980, 1987, "Busch Memorial Stadium", "outdoors", "astroturf"), (1988, 1998, "Sun Devil Stadium", "outdoors", "grass")],
    "ATL": [(1980, 1991, "Atlanta-Fulton County Stadium", "outdoors", "grass"), (1992, 1998, "Georgia Dome", "dome", "astroturf")],
    "BAL": [(1980, 1995, "Cleveland Stadium", "outdoors", "grass"), (1996, 1997, "Memorial Stadium", "outdoors", "grass"),
            (1998, 1998, "Ravens Stadium at Camden Yards", "outdoors", "grass")],
    "BUF": [(1980, 1997, "Rich Stadium", "outdoors", "astroturf"), (1998, 1998, "Ralph Wilson Stadium", "outdoors", "astroturf")],
    "CAR": [(1995, 1995, "Memorial Stadium (Clemson)", "outdoors", "grass"), (1996, 1998, "Ericsson Stadium", "outdoors", "grass")],
    "CHI": [(1980, 1987, "Soldier Field", "outdoors", "astroturf"), (1988, 1998, "Soldier Field", "outdoors", "grass")],
    "CIN": [(1980, 1996, "Riverfront Stadium", "outdoors", "astroturf"), (1997, 1998, "Cinergy Field", "outdoors", "astroturf")],
    "DAL": [(1980, 1998, "Texas Stadium", "outdoors", "astroturf")],
    "DEN": [(1980, 1998, "Mile High Stadium", "outdoors", "grass")],
    "DET": [(1980, 1998, "Pontiac Silverdome", "dome", "astroturf")],
    "GB": [(1980, 1998, "Lambeau Field", "outdoors", "grass")],
    "IND": [(1980, 1983, "Memorial Stadium", "outdoors", "grass"), (1984, 1993, "Hoosier Dome", "dome", "astroturf"), (1994, 1998, "RCA Dome", "dome", "astroturf")],
    "JAX": [(1995, 1996, "Jacksonville Municipal Stadium", "outdoors", "grass"), (1997, 1998, "Alltel Stadium", "outdoors", "grass")],
    "KC": [(1980, 1993, "Arrowhead Stadium", "outdoors", "astroturf"), (1994, 1998, "Arrowhead Stadium", "outdoors", "grass")],
    "LA": [(1980, 1994, "Anaheim Stadium", "outdoors", "grass"), (1995, 1998, "Trans World Dome", "dome", "astroturf")],
    "LAC": [(1980, 1980, "San Diego Stadium", "outdoors", "grass"), (1981, 1996, "Jack Murphy Stadium", "outdoors", "grass"), (1997, 1998, "Qualcomm Stadium", "outdoors", "grass")],
    "LV": [(1980, 1981, "Oakland-Alameda County Coliseum", "outdoors", "grass"), (1982, 1994, "Los Angeles Memorial Coliseum", "outdoors", "grass"), (1995, 1998, "Oakland Coliseum", "outdoors", "grass")],
    "MIA": [(1980, 1986, "Miami Orange Bowl", "outdoors", "grass"), (1987, 1995, "Joe Robbie Stadium", "outdoors", "grass"), (1996, 1998, "Pro Player Stadium", "outdoors", "grass")],
    "MIN": [(1980, 1981, "Metropolitan Stadium", "outdoors", "grass"), (1982, 1998, "Hubert H. Humphrey Metrodome", "dome", "astroturf")],
    "NE": [(1980, 1982, "Schaefer Stadium", "outdoors", "astroturf"), (1983, 1989, "Sullivan Stadium", "outdoors", "astroturf"), (1990, 1998, "Foxboro Stadium", "outdoors", "grass")],
    "NO": [(1980, 1998, "Louisiana Superdome", "dome", "astroturf")],
    "NYG": [(1980, 1998, "Giants Stadium", "outdoors", "astroturf")],
    "NYJ": [(1980, 1983, "Shea Stadium", "outdoors", "grass"), (1984, 1998, "Giants Stadium", "outdoors", "astroturf")],
    "PHI": [(1980, 1998, "Veterans Stadium", "outdoors", "astroturf")],
    "PIT": [(1980, 1998, "Three Rivers Stadium", "outdoors", "astroturf")],
    "SEA": [(1980, 1998, "Kingdome", "dome", "astroturf")],
    "SF": [(1980, 1995, "Candlestick Park", "outdoors", "grass"), (1996, 1998, "3Com Park", "outdoors", "grass")],
    "TB": [(1980, 1995, "Tampa Stadium", "outdoors", "grass"), (1996, 1997, "Houlihan's Stadium", "outdoors", "grass"),
           (1998, 1998, "Raymond James Stadium", "outdoors", "grass")],
    "TEN": [(1980, 1996, "Astrodome", "dome", "astroturf"), (1997, 1997, "Liberty Bowl Memorial Stadium", "outdoors", "grass"),
            (1998, 1998, "Vanderbilt Stadium", "outdoors", "grass")],
    "WAS": [(1980, 1996, "RFK Stadium", "outdoors", "grass"), (1997, 1998, "Jack Kent Cooke Stadium", "outdoors", "grass")],
}

# Super Bowl sites by the season they closed (neutral).
SUPER_BOWL = {
    1979: ("Rose Bowl", "outdoors", "grass"), 1980: ("Louisiana Superdome", "dome", "astroturf"),
    1981: ("Pontiac Silverdome", "dome", "astroturf"), 1982: ("Rose Bowl", "outdoors", "grass"),
    1983: ("Tampa Stadium", "outdoors", "grass"), 1984: ("Stanford Stadium", "outdoors", "grass"),
    1985: ("Louisiana Superdome", "dome", "astroturf"), 1986: ("Rose Bowl", "outdoors", "grass"),
    1987: ("Jack Murphy Stadium", "outdoors", "grass"), 1988: ("Joe Robbie Stadium", "outdoors", "grass"),
    1989: ("Louisiana Superdome", "dome", "astroturf"), 1990: ("Tampa Stadium", "outdoors", "grass"),
    1991: ("Hubert H. Humphrey Metrodome", "dome", "astroturf"), 1992: ("Rose Bowl", "outdoors", "grass"),
    1993: ("Georgia Dome", "dome", "astroturf"), 1994: ("Joe Robbie Stadium", "outdoors", "grass"),
    1995: ("Sun Devil Stadium", "outdoors", "grass"), 1996: ("Louisiana Superdome", "dome", "astroturf"),
    1997: ("Qualcomm Stadium", "outdoors", "grass"), 1998: ("Pro Player Stadium", "outdoors", "grass"),
}

# Opening-day head coaches (real).
_C = {
    1990: "ARI Joe Bugel|ATL Jerry Glanville|BAL Bud Carson|BUF Marv Levy|CHI Mike Ditka|CIN Sam Wyche|DAL Jimmy Johnson|"
          "DEN Dan Reeves|DET Wayne Fontes|GB Lindy Infante|IND Ron Meyer|KC Marty Schottenheimer|LA John Robinson|"
          "LAC Dan Henning|LV Art Shell|MIA Don Shula|MIN Jerry Burns|NE Rod Rust|NO Jim Mora|NYG Bill Parcells|NYJ Bruce Coslet|"
          "PHI Buddy Ryan|PIT Chuck Noll|SEA Chuck Knox|SF George Seifert|TB Ray Perkins|TEN Jack Pardee|WAS Joe Gibbs",
    1991: "ARI Joe Bugel|ATL Jerry Glanville|BAL Bill Belichick|BUF Marv Levy|CHI Mike Ditka|CIN Sam Wyche|DAL Jimmy Johnson|"
          "DEN Dan Reeves|DET Wayne Fontes|GB Lindy Infante|IND Ron Meyer|KC Marty Schottenheimer|LA John Robinson|"
          "LAC Dan Henning|LV Art Shell|MIA Don Shula|MIN Jerry Burns|NE Dick MacPherson|NO Jim Mora|NYG Ray Handley|NYJ Bruce Coslet|"
          "PHI Rich Kotite|PIT Chuck Noll|SEA Chuck Knox|SF George Seifert|TB Ray Perkins|TEN Jack Pardee|WAS Joe Gibbs",
    1992: "ARI Joe Bugel|ATL Jerry Glanville|BAL Bill Belichick|BUF Marv Levy|CHI Mike Ditka|CIN Dave Shula|DAL Jimmy Johnson|"
          "DEN Dan Reeves|DET Wayne Fontes|GB Mike Holmgren|IND Ted Marchibroda|KC Marty Schottenheimer|LA Chuck Knox|"
          "LAC Bobby Ross|LV Art Shell|MIA Don Shula|MIN Dennis Green|NE Dick MacPherson|NO Jim Mora|NYG Ray Handley|NYJ Bruce Coslet|"
          "PHI Rich Kotite|PIT Bill Cowher|SEA Tom Flores|SF George Seifert|TB Sam Wyche|TEN Jack Pardee|WAS Joe Gibbs",
    1993: "ARI Joe Bugel|ATL Jerry Glanville|BAL Bill Belichick|BUF Marv Levy|CHI Dave Wannstedt|CIN Dave Shula|DAL Jimmy Johnson|"
          "DEN Wade Phillips|DET Wayne Fontes|GB Mike Holmgren|IND Ted Marchibroda|KC Marty Schottenheimer|LA Chuck Knox|"
          "LAC Bobby Ross|LV Art Shell|MIA Don Shula|MIN Dennis Green|NE Bill Parcells|NO Jim Mora|NYG Dan Reeves|NYJ Bruce Coslet|"
          "PHI Rich Kotite|PIT Bill Cowher|SEA Tom Flores|SF George Seifert|TB Sam Wyche|TEN Jack Pardee|WAS Richie Petitbon",
    1994: "ARI Buddy Ryan|ATL June Jones|BAL Bill Belichick|BUF Marv Levy|CHI Dave Wannstedt|CIN Dave Shula|DAL Barry Switzer|"
          "DEN Wade Phillips|DET Wayne Fontes|GB Mike Holmgren|IND Ted Marchibroda|KC Marty Schottenheimer|LA Chuck Knox|"
          "LAC Bobby Ross|LV Art Shell|MIA Don Shula|MIN Dennis Green|NE Bill Parcells|NO Jim Mora|NYG Dan Reeves|NYJ Pete Carroll|"
          "PHI Rich Kotite|PIT Bill Cowher|SEA Tom Flores|SF George Seifert|TB Sam Wyche|TEN Jack Pardee|WAS Norv Turner",
    1995: "ARI Buddy Ryan|ATL June Jones|BAL Bill Belichick|BUF Marv Levy|CAR Dom Capers|CHI Dave Wannstedt|CIN Dave Shula|"
          "DAL Barry Switzer|DEN Mike Shanahan|DET Wayne Fontes|GB Mike Holmgren|IND Ted Marchibroda|JAX Tom Coughlin|"
          "KC Marty Schottenheimer|LA Rich Brooks|LAC Bobby Ross|LV Mike White|MIA Don Shula|MIN Dennis Green|NE Bill Parcells|"
          "NO Jim Mora|NYG Dan Reeves|NYJ Rich Kotite|PHI Ray Rhodes|PIT Bill Cowher|SEA Dennis Erickson|SF George Seifert|"
          "TB Sam Wyche|TEN Jeff Fisher|WAS Norv Turner",
    1996: "ARI Vince Tobin|ATL June Jones|BAL Ted Marchibroda|BUF Marv Levy|CAR Dom Capers|CHI Dave Wannstedt|CIN Dave Shula|"
          "DAL Barry Switzer|DEN Mike Shanahan|DET Wayne Fontes|GB Mike Holmgren|IND Lindy Infante|JAX Tom Coughlin|"
          "KC Marty Schottenheimer|LA Rich Brooks|LAC Bobby Ross|LV Mike White|MIA Jimmy Johnson|MIN Dennis Green|NE Bill Parcells|"
          "NO Jim Mora|NYG Dan Reeves|NYJ Rich Kotite|PHI Ray Rhodes|PIT Bill Cowher|SEA Dennis Erickson|SF George Seifert|"
          "TB Tony Dungy|TEN Jeff Fisher|WAS Norv Turner",
    1997: "ARI Vince Tobin|ATL Dan Reeves|BAL Ted Marchibroda|BUF Wade Phillips|CAR Dom Capers|CHI Dave Wannstedt|CIN Bruce Coslet|"
          "DAL Barry Switzer|DEN Mike Shanahan|DET Bobby Ross|GB Mike Holmgren|IND Lindy Infante|JAX Tom Coughlin|"
          "KC Marty Schottenheimer|LA Dick Vermeil|LAC Kevin Gilbride|LV Joe Bugel|MIA Jimmy Johnson|MIN Dennis Green|NE Pete Carroll|"
          "NO Mike Ditka|NYG Jim Fassel|NYJ Bill Parcells|PHI Ray Rhodes|PIT Bill Cowher|SEA Dennis Erickson|SF Steve Mariucci|"
          "TB Tony Dungy|TEN Jeff Fisher|WAS Norv Turner",
    1998: "ARI Vince Tobin|ATL Dan Reeves|BAL Ted Marchibroda|BUF Wade Phillips|CAR Dom Capers|CHI Dave Wannstedt|CIN Bruce Coslet|"
          "DAL Chan Gailey|DEN Mike Shanahan|DET Bobby Ross|GB Mike Holmgren|IND Jim Mora|JAX Tom Coughlin|KC Marty Schottenheimer|"
          "LA Dick Vermeil|LAC Kevin Gilbride|LV Jon Gruden|MIA Jimmy Johnson|MIN Dennis Green|NE Pete Carroll|NO Mike Ditka|"
          "NYG Jim Fassel|NYJ Bill Parcells|PHI Ray Rhodes|PIT Bill Cowher|SEA Dennis Erickson|SF Steve Mariucci|TB Tony Dungy|"
          "TEN Jeff Fisher|WAS Norv Turner",
}
# The 1980s: 1980's opening-day staff, then each season's changes (real).
_C80 = {1980: 'ARI Jim Hanifan|ATL Leeman Bennett|BAL Sam Rutigliano|BUF Chuck Knox|CHI Neill Armstrong|CIN Forrest Gregg|DAL Tom Landry|DEN Red Miller|DET Monte Clark|GB Bart Starr|IND Mike McCormack|KC Marv Levy|LA Ray Malavasi|LAC Don Coryell|LV Tom Flores|MIA Don Shula|MIN Bud Grant|NE Ron Erhardt|NO Dick Nolan|NYG Ray Perkins|NYJ Walt Michaels|PHI Dick Vermeil|PIT Chuck Noll|SEA Jack Patera|SF Bill Walsh|TB John McKay|TEN Bum Phillips|WAS Jack Pardee'}
_C80_CHANGES = {
    1981: 'DEN Dan Reeves|TEN Ed Biles|NO Bum Phillips|WAS Joe Gibbs',
    1982: 'CHI Mike Ditka|IND Frank Kush|NE Ron Meyer',
    1983: 'ATL Dan Henning|BUF Kay Stephenson|KC John Mackovic|LA John Robinson|NYG Bill Parcells|NYJ Joe Walton|PHI Marion Campbell|SEA Chuck Knox',
    1984: 'CIN Sam Wyche|GB Forrest Gregg|TEN Hugh Campbell|MIN Les Steckel|TB Leeman Bennett',
    1985: 'BAL Marty Schottenheimer|DET Darryl Rogers|IND Rod Dowhower|MIN Bud Grant|NE Raymond Berry',
    1986: 'BUF Hank Bullough|TEN Jerry Glanville|MIN Jerry Burns|NO Jim Mora|PHI Buddy Ryan|ARI Gene Stallings',
    1987: 'ATL Marion Campbell|BUF Marv Levy|IND Ron Meyer|KC Frank Gansz|LAC Al Saunders|TB Ray Perkins',
    1988: 'GB Lindy Infante|LV Mike Shanahan',
    1989: 'BAL Bud Carson|DAL Jimmy Johnson|DET Wayne Fontes|KC Marty Schottenheimer|LAC Dan Henning|SF George Seifert',
}
for _y in range(1981, 1990):
    _prev = dict(x.split(" ", 1) for x in _C80[_y - 1].split("|"))
    _prev.update(x.split(" ", 1) for x in _C80_CHANGES[_y].split("|"))
    _C80[_y] = "|".join(f"{k} {v}" for k, v in sorted(_prev.items()))
_C = {**_C80, **_C}
COACHES = {y: dict(x.split(" ", 1) for x in s.split("|")) for y, s in _C.items()}


def home_of(team: str, season: int):
    for a, b, name, roof, surface in _HOMES[team]:
        if a <= season <= b:
            return name, roof, surface
    raise KeyError((team, season))


def old_schedule(fte: pd.DataFrame, season: int, division: dict) -> pd.DataFrame:
    """One season of FiveThirtyEight games shaped like nflverse's schedule."""
    g = fte[fte.season == season].sort_values("gameday").reset_index(drop=True).copy()
    first = dt.date.fromisoformat(g[g.game_type == "REG"].gameday.min())
    tuesday = first - dt.timedelta(days=(first.weekday() - 1) % 7)
    g["week"] = [(dt.date.fromisoformat(d) - tuesday).days // 7 + 1 for d in g.gameday]
    g["weekday"] = [dt.date.fromisoformat(d).strftime("%A") for d in g.gameday]
    g["gametime"] = None
    g["game_id"] = [f"{season}_{w:02d}_{a}_{h}" for w, a, h in zip(g.week, g.away_team, g.home_team)]
    sb = g.game_type == "SB"
    g["location"] = ["Neutral" if s else "Home" for s in sb]
    site = [SUPER_BOWL[season] if s else home_of(h, season) for s, h in zip(sb, g.home_team)]
    g["stadium"] = [x[0] for x in site]
    g["roof"] = [x[1] for x in site]
    g["surface"] = [x[2] for x in site]
    g["stadium_id"] = [f"SB{season}" if s else f"{h}{season % 100:02d}" for s, h in zip(sb, g.home_team)]
    g["div_game"] = [int(division.get(a) == division.get(h)) for a, h in zip(g.away_team, g.home_team)]
    # Days since each club's last game (a week's rest to open the season).
    last: dict[str, dt.date] = {}
    rest = {"away_rest": [], "home_rest": []}
    for a, h, d in zip(g.away_team, g.home_team, g.gameday):
        day = dt.date.fromisoformat(d)
        for team, col in ((a, "away_rest"), (h, "home_rest")):
            rest[col].append((day - last[team]).days if team in last else 7)
            last[team] = day
    g["away_rest"], g["home_rest"] = rest["away_rest"], rest["home_rest"]
    coach = COACHES.get(season, {})
    g["home_coach"] = g.home_team.map(coach)
    g["away_coach"] = g.away_team.map(coach)
    return g

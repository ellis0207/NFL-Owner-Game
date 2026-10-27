"""Static league facts that are not in the nflverse data, or that we pin by hand."""

SEASON = 2026

# Team abbreviations follow nflverse (LA = Rams, LV = Raiders, WAS = Commanders).
TEAMS = [
    # abbr, city/region, nickname (matches OverTheCap), conference, division
    ("BUF", "Buffalo", "Bills", "AFC", "East"),
    ("MIA", "Miami", "Dolphins", "AFC", "East"),
    ("NE", "New England", "Patriots", "AFC", "East"),
    ("NYJ", "New York", "Jets", "AFC", "East"),
    ("BAL", "Baltimore", "Ravens", "AFC", "North"),
    ("CIN", "Cincinnati", "Bengals", "AFC", "North"),
    ("CLE", "Cleveland", "Browns", "AFC", "North"),
    ("PIT", "Pittsburgh", "Steelers", "AFC", "North"),
    ("HOU", "Houston", "Texans", "AFC", "South"),
    ("IND", "Indianapolis", "Colts", "AFC", "South"),
    ("JAX", "Jacksonville", "Jaguars", "AFC", "South"),
    ("TEN", "Tennessee", "Titans", "AFC", "South"),
    ("DEN", "Denver", "Broncos", "AFC", "West"),
    ("KC", "Kansas City", "Chiefs", "AFC", "West"),
    ("LV", "Las Vegas", "Raiders", "AFC", "West"),
    ("LAC", "Los Angeles", "Chargers", "AFC", "West"),
    ("DAL", "Dallas", "Cowboys", "NFC", "East"),
    ("NYG", "New York", "Giants", "NFC", "East"),
    ("PHI", "Philadelphia", "Eagles", "NFC", "East"),
    ("WAS", "Washington", "Commanders", "NFC", "East"),
    ("CHI", "Chicago", "Bears", "NFC", "North"),
    ("DET", "Detroit", "Lions", "NFC", "North"),
    ("GB", "Green Bay", "Packers", "NFC", "North"),
    ("MIN", "Minnesota", "Vikings", "NFC", "North"),
    ("ATL", "Atlanta", "Falcons", "NFC", "South"),
    ("CAR", "Carolina", "Panthers", "NFC", "South"),
    ("NO", "New Orleans", "Saints", "NFC", "South"),
    ("TB", "Tampa Bay", "Buccaneers", "NFC", "South"),
    ("ARI", "Arizona", "Cardinals", "NFC", "West"),
    ("LA", "Los Angeles", "Rams", "NFC", "West"),
    ("SF", "San Francisco", "49ers", "NFC", "West"),
    ("SEA", "Seattle", "Seahawks", "NFC", "West"),
]

NICKNAME_TO_ABBR = {t[2]: t[0] for t in TEAMS}

# The schedule data still carries an old name for Houston's stadium.
STADIUM_NAME_OVERRIDES = {"HOU00": "NRG Stadium"}

# League rules for 2026. Sources: OverTheCap (cap set Feb 2026, minimum salaries).
RULES_2026 = {
    "season": SEASON,
    "salaryCap": 301_200_000,
    "minimumSalary": {  # by credited seasons; "4" covers 4-6, "7" covers 7+
        "0": 885_000, "1": 1_005_000, "2": 1_075_000, "3": 1_145_000, "4": 1_215_000, "7": 1_300_000,
    },
    "minimumSalaryNextYear": {
        "0": 930_000, "1": 1_050_000, "2": 1_120_000, "3": 1_190_000, "4": 1_260_000, "7": 1_345_000,
    },
    "practiceSquadWeekly": {"standard": 13_750, "veteranMin": 18_350, "veteranMax": 22_850},
    "rosterLimits": {
        "offseason": 90,
        "regularSeason": 53,
        "practiceSquad": 17,  # includes one International Pathway player
        "gameDayActive": 48,
    },
    # Official 2026-27 league calendar (NFL "important dates" release).
    # Veterans report 47 days before a team's first regular-season game
    # (48 days before a Monday opener); rookies may report 7 days earlier.
    "veteranReportDaysBeforeOpener": 47,
    "veteranReportDaysBeforeMondayOpener": 48,
    "rookieEarlyReportDays": 7,
    "keyDates": {
        "franchiseTagExtensionDeadline": "2026-07-15",
        "hallOfFameGame": "2026-08-06",
        "rosterCutdown": "2026-08-30",
        "cutdownWaiversExpire": "2026-08-31",
        "practiceSquadSigningOpens": "2026-08-31",
        "regularSeasonStart": "2026-09-09",
        "waiverOrderByStandings": "2026-09-29",
        "tradeDeadline": "2026-11-10",
        "veteranWaiversBegin": "2026-11-11",
        "unsignedTenderDeadline": "2026-11-17",
        "regularSeasonEnd": "2027-01-10",
        "reserveFutureSigningsOpen": "2027-01-11",
        "postseasonRosterFreeze": "2027-01-13",
        "wildCardWeekend": "2027-01-16",
        "divisionalRound": "2027-01-23",
        "conferenceChampionships": "2027-01-31",
        "superBowl": "2027-02-14",
        "franchiseTagWindowOpens": "2027-02-17",
        "scoutingCombineStart": "2027-03-01",
        "franchiseTagDeadline": "2027-03-03",
        "negotiatingWindowOpens": "2027-03-09",
        "newLeagueYear": "2027-03-11",
        "annualLeagueMeeting": "2027-03-21",
        "draftStart": "2027-04-29",
    },
}

# Position used by the game engine. Most come straight from the depth chart
# position; outside linebackers are split into EDGE or LB from pass-rush stats.
DEPTH_TO_GAME_POSITION = {
    "QB": "QB", "RB": "RB", "FB": "FB", "WR": "WR", "TE": "TE",
    "T": "OT", "G": "OG", "C": "C",
    "DE": "EDGE", "DT": "IDL", "NT": "IDL",
    "ILB": "LB", "MLB": "LB", "LB": "LB", "OLB": "OLB",
    "CB": "CB", "DB": "CB", "S": "S", "FS": "S", "SS": "S",
    "K": "K", "P": "P", "LS": "LS",
}
FALLBACK_POSITION = {
    "QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE", "OL": "OG", "DL": "IDL",
    "LB": "LB", "DB": "CB", "K": "K", "P": "P", "LS": "LS",
}

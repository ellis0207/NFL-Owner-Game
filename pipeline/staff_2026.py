"""Every team's real 2026 football staff, and the schemes they run.

Head coaches, coordinators and general managers are the people in those jobs
for the 2026 season (team sites and press coverage, checked Oct 2026). Birth
years are estimates where no public date was found and are flagged as such.
Head athletic trainers and scouting directors are generated: there is no
reliable public list, and the owner judges them by results anyway.

The hidden attributes (0-100) are our reading of each person's reputation.
The owner never sees them: they come through in results, in reports, and in
how other teams talk about the person.
"""

import hashlib
import random

# Scheme families. The game engine (src/engine/schemes.ts) defines how each one plays.
OFFENSE_SCHEMES = {
    "wideZone": "Shanahan wide zone: outside-zone runs, heavy play-action and bootlegs, yards after the catch",
    "mcvay": "McVay tree: wide zone from 11 personnel, condensed formations, timing routes and play-action",
    "westCoast": "West Coast: short, rhythm passing, backs and tight ends in the pass game, screens",
    "erhardtPerkins": "Erhardt-Perkins: concept-based passing, tight-end heavy, power and duo runs",
    "spread": "Spread and RPO: quarterback runs and options, wide splits, tempo",
    "vertical": "Vertical passing: Air Coryell and Air Raid roots, deep shots, five-man protections",
    "gapMotion": "Gap and motion: pre-snap motion, gap and duo runs, play-action shots",
}
DEFENSE_SCHEMES = {
    "fangio": "Fangio two-high 3-4: light boxes, disguised two-deep shells, few blitzes, limits big plays",
    "cover3": "Seattle 4-3: single-high Cover 3, wide-nine rushers, fast linebackers",
    "pressure": "Pressure: blitz-heavy, man coverage behind it, boom-or-bust",
    "multiple": "Belichick multiple: week-to-week game plans built to take away the opponent's best option",
    "macdonald": "Macdonald multiple: simulated pressures and late rotation to confuse quarterbacks",
}

# (role, name, birth year, birth year is an estimate, years in this job with this team before 2026,
#  previous jobs, hidden attributes)
# HC attributes: playCalling, development, gameManagement, leadership, evaluation
# OC/DC: playCalling, development, evaluation
# STC: specialTeams, development
# GM: negotiation, evaluation, capManagement
STAFF = {
    "ARI": {
        "offense": "wideZone", "defense": "fangio", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Mike LaFleur", 1987, True, 0, "Rams offensive coordinator; Jets offensive coordinator", (74, 70, 66, 70, 70)),
        "OC": ("Nathaniel Hackett", 1979, True, 0, "Jets and Broncos offensive coordinator; Broncos head coach", (66, 66, 64)),
        "DC": ("Nick Rallis", 1993, True, 3, "Eagles linebackers coach", (70, 72, 68)),
        "STC": ("Michael Ghobrial", 1989, True, 0, "Eagles special teams coordinator", (70, 64)),
        "GM": ("Monti Ossenfort", 1978, True, 3, "Titans director of player personnel", (68, 70, 72)),
    },
    "ATL": {
        "offense": "wideZone", "defense": "cover3", "offCaller": "OC", "defCaller": "DC",
        "HC": ("Kevin Stefanski", 1982, False, 0, "Browns head coach (two-time Coach of the Year); Vikings OC", (82, 76, 78, 80, 76)),
        "OC": ("Tommy Rees", 1992, False, 0, "Browns offensive coordinator; Alabama and Notre Dame OC", (70, 72, 70)),
        "DC": ("Jeff Ulbrich", 1977, False, 1, "Jets defensive coordinator; Falcons interim head coach", (72, 72, 70)),
        "STC": ("Craig Aukerman", 1977, True, 0, "Titans special teams coordinator", (68, 64)),
        "GM": ("Ian Cunningham", 1985, True, 0, "Bears assistant GM; Eagles personnel", (64, 72, 68)),
    },
    "BAL": {
        "offense": "gapMotion", "defense": "macdonald", "offCaller": "OC", "defCaller": "HC",
        "HC": ("Jesse Minter", 1983, False, 0, "Chargers defensive coordinator; Michigan DC", (82, 80, 70, 76, 80)),
        "OC": ("Declan Doyle", 1996, False, 0, "Bears offensive coordinator; Broncos tight ends coach", (66, 70, 68)),
        "DC": ("Anthony Weaver", 1980, False, 0, "Dolphins defensive coordinator; Ravens assistant", (74, 76, 72)),
        "STC": ("Anthony Levine Sr.", 1987, False, 0, "Ravens assistant special teams coach", (66, 66)),
        "GM": ("Eric DeCosta", 1971, False, 7, "Ravens assistant GM under Ozzie Newsome", (84, 90, 82)),
    },
    "BUF": {
        "offense": "spread", "defense": "fangio", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Joe Brady", 1989, False, 0, "Bills offensive coordinator; Panthers OC; LSU passing game coordinator", (80, 74, 68, 74, 74)),
        "OC": ("Pete Carmichael Jr.", 1971, False, 0, "Saints offensive coordinator for 15 seasons", (72, 70, 72)),
        "DC": ("Jim Leonhard", 1982, False, 0, "Broncos defensive pass game coordinator; Wisconsin DC", (72, 74, 72)),
        "STC": ("Jeff Rodgers", 1974, True, 0, "Cowboys and Cardinals special teams coordinator", (70, 64)),
        "GM": ("Brandon Beane", 1976, False, 9, "Panthers assistant GM", (82, 82, 76)),
    },
    "CAR": {
        "offense": "wideZone", "defense": "fangio", "offCaller": "OC", "defCaller": "DC",
        "HC": ("Dave Canales", 1981, False, 2, "Buccaneers offensive coordinator; Seahawks QB coach", (72, 78, 66, 76, 70)),
        "OC": ("Brad Idzik", 1990, True, 2, "Panthers passing game coordinator; Buccaneers and Seahawks receivers coach", (64, 68, 64)),
        "DC": ("Ejiro Evero", 1981, False, 2, "Broncos defensive coordinator", (80, 76, 74)),
        "STC": ("Tracy Smith", 1972, True, 2, "Panthers assistant special teams coach", (64, 62)),
        "GM": ("Dan Morgan", 1978, False, 2, "Panthers assistant GM; Bills and Seahawks personnel", (68, 70, 66)),
    },
    "CHI": {
        "offense": "gapMotion", "defense": "pressure", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Ben Johnson", 1986, False, 1, "Lions offensive coordinator", (92, 80, 76, 80, 80)),
        "OC": ("Press Taylor", 1988, False, 1, "Jaguars offensive coordinator; Eagles assistant", (64, 68, 64)),
        "DC": ("Dennis Allen", 1972, False, 1, "Saints head coach and defensive coordinator", (80, 76, 74)),
        "STC": ("Richard Hightower", 1980, True, 2, "49ers and Bears special teams coordinator", (72, 66)),
        "GM": ("Ryan Poles", 1985, False, 4, "Chiefs executive director of player personnel", (72, 74, 70)),
    },
    "CIN": {
        "offense": "mcvay", "defense": "macdonald", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Zac Taylor", 1983, False, 7, "Rams quarterbacks coach under Sean McVay", (78, 70, 66, 72, 70)),
        "OC": ("Dan Pitcher", 1987, False, 1, "Bengals quarterbacks coach", (66, 70, 66)),
        "DC": ("Al Golden", 1969, False, 1, "Notre Dame defensive coordinator; Miami head coach", (70, 72, 68)),
        "STC": ("Darrin Simmons", 1973, False, 23, "Bengals special teams coordinator since 2003", (86, 70)),
        "GM": ("Duke Tobin", 1970, True, 11, "Bengals director of player personnel", (60, 76, 64)),
    },
    "CLE": {
        "offense": "vertical", "defense": "cover3", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Todd Monken", 1966, False, 0, "Ravens offensive coordinator; Georgia OC (two national titles)", (82, 72, 70, 74, 74)),
        "OC": ("Travis Switzer", 1995, True, 0, "Ravens tight ends coach", (60, 66, 62)),
        "DC": ("Mike Rutenberg", 1987, True, 0, "Browns linebackers coach; Falcons assistant", (66, 68, 64)),
        "STC": ("Byron Storer", 1984, True, 0, "Bears assistant special teams coach", (62, 62)),
        "GM": ("Andrew Berry", 1987, False, 6, "Eagles VP of football operations; Browns personnel", (74, 68, 62)),
    },
    "DAL": {
        "offense": "westCoast", "defense": "fangio", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Brian Schottenheimer", 1973, False, 1, "Cowboys offensive coordinator; Seahawks, Rams and Jets OC", (74, 70, 66, 74, 70)),
        "OC": ("Klayton Adams", 1983, True, 1, "Cardinals offensive line coach", (62, 70, 64)),
        "DC": ("Christian Parker", 1991, False, 0, "Eagles defensive passing game coordinator", (68, 74, 68)),
        "STC": ("Nick Sorensen", 1978, False, 1, "49ers defensive coordinator; Seahawks assistant", (68, 64)),
        "GM": ("Jerry Jones", 1942, False, 37, "Owner and general manager since 1989", (70, 66, 56)),
    },
    "DEN": {
        "offense": "westCoast", "defense": "pressure", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Sean Payton", 1963, False, 3, "Saints head coach (Super Bowl XLIV champion)", (90, 76, 80, 84, 82)),
        "OC": ("Davis Webb", 1995, False, 0, "Broncos quarterbacks coach and passing game coordinator", (62, 74, 66)),
        "DC": ("Vance Joseph", 1972, False, 3, "Cardinals defensive coordinator; Broncos head coach", (82, 74, 74)),
        "STC": ("Darren Rizzi", 1970, False, 0, "Saints interim head coach and special teams coordinator", (80, 66)),
        "GM": ("George Paton", 1970, False, 5, "Vikings assistant GM", (72, 74, 70)),
    },
    "DET": {
        "offense": "gapMotion", "defense": "pressure", "offCaller": "OC", "defCaller": "DC",
        "HC": ("Dan Campbell", 1976, False, 5, "Saints assistant head coach; Dolphins interim head coach", (70, 82, 74, 92, 78)),
        "OC": ("Drew Petzing", 1987, False, 0, "Cardinals offensive coordinator; Browns QB coach", (70, 70, 68)),
        "DC": ("Kelvin Sheppard", 1988, False, 1, "Lions linebackers coach", (68, 74, 68)),
        "STC": ("Dave Fipp", 1974, False, 0, "Lions and Eagles special teams coordinator", (82, 68)),
        "GM": ("Brad Holmes", 1979, False, 5, "Rams director of college scouting", (78, 88, 76)),
    },
    "GB": {
        "offense": "wideZone", "defense": "fangio", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Matt LaFleur", 1979, False, 7, "Titans offensive coordinator; Rams OC", (84, 78, 72, 78, 76)),
        "OC": ("Adam Stenavich", 1983, False, 4, "Packers offensive line coach", (62, 78, 70)),
        "DC": ("Jonathan Gannon", 1983, False, 0, "Cardinals head coach; Eagles defensive coordinator", (76, 72, 70)),
        "STC": ("Cam Achord", 1985, True, 0, "Patriots special teams coordinator", (66, 62)),
        "GM": ("Brian Gutekunst", 1973, False, 8, "Packers director of player personnel", (74, 82, 74)),
    },
    "HOU": {
        "offense": "mcvay", "defense": "cover3", "offCaller": "OC", "defCaller": "HC",
        "HC": ("DeMeco Ryans", 1984, False, 3, "49ers defensive coordinator", (82, 78, 72, 86, 78)),
        "OC": ("Nick Caley", 1983, False, 1, "Rams pass game coordinator; Patriots tight ends coach", (68, 70, 66)),
        "DC": ("Matt Burke", 1976, False, 3, "Cardinals and Dolphins defensive coordinator", (70, 72, 70)),
        "STC": ("Frank Ross", 1981, True, 3, "Seahawks and 49ers special teams assistant", (66, 64)),
        "GM": ("Nick Caserio", 1976, False, 5, "Patriots director of player personnel", (76, 80, 74)),
    },
    "IND": {
        "offense": "spread", "defense": "macdonald", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Shane Steichen", 1985, False, 3, "Eagles offensive coordinator", (80, 72, 68, 72, 72)),
        "OC": ("Jim Bob Cooter", 1984, False, 3, "Jaguars passing game coordinator; Lions OC", (64, 68, 64)),
        "DC": ("Lou Anarumo", 1966, False, 1, "Bengals defensive coordinator", (76, 72, 70)),
        "STC": ("Brian Mason", 1986, True, 0, "Colts special teams coordinator", (66, 62)),
        "GM": ("Chris Ballard", 1969, False, 9, "Chiefs director of football operations", (70, 74, 68)),
    },
    "JAX": {
        "offense": "mcvay", "defense": "cover3", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Liam Coen", 1985, False, 1, "Buccaneers offensive coordinator; Kentucky OC", (80, 74, 70, 74, 72)),
        "OC": ("Grant Udinski", 1995, False, 1, "Vikings assistant offensive coordinator", (64, 70, 66)),
        "DC": ("Anthony Campanile", 1982, False, 1, "Packers linebackers coach", (68, 72, 66)),
        "STC": ("Heath Farwell", 1981, False, 4, "Jaguars and Bills special teams coordinator", (68, 64)),
        "GM": ("James Gladstone", 1991, False, 1, "Rams director of scouting strategy", (68, 74, 72)),
    },
    "KC": {
        "offense": "westCoast", "defense": "pressure", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Andy Reid", 1958, False, 13, "Eagles head coach; three Super Bowl titles with Kansas City", (95, 84, 80, 92, 86)),
        "OC": ("Eric Bieniemy", 1969, False, 0, "Chiefs OC (returned); Commanders OC; UCLA OC", (68, 76, 70)),
        "DC": ("Steve Spagnuolo", 1959, False, 7, "Giants and Eagles defensive coordinator; Rams head coach", (88, 76, 78)),
        "STC": ("Dave Toub", 1962, False, 13, "Bears special teams coordinator", (88, 70)),
        "GM": ("Brett Veach", 1977, False, 9, "Chiefs co-director of player personnel", (82, 84, 80)),
    },
    "LV": {
        "offense": "wideZone", "defense": "multiple", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Klint Kubiak", 1987, False, 0, "Seahawks offensive coordinator; Saints OC", (78, 72, 66, 72, 70)),
        "OC": ("Andrew Janocko", 1988, True, 0, "Seahawks quarterbacks coach", (60, 68, 64)),
        "DC": ("Rob Leonard", 1987, True, 0, "Dolphins and Patriots defensive assistant", (64, 68, 64)),
        "STC": ("Joe DeCamillis", 1965, False, 0, "Rams and Cowboys special teams coordinator", (72, 64)),
        "GM": ("John Spytek", 1980, False, 1, "Buccaneers assistant GM", (68, 72, 68)),
    },
    "LAC": {
        "offense": "wideZone", "defense": "macdonald", "offCaller": "OC", "defCaller": "DC",
        "HC": ("Jim Harbaugh", 1963, False, 2, "Michigan head coach (national title); 49ers head coach", (78, 82, 82, 92, 82)),
        "OC": ("Mike McDaniel", 1983, False, 0, "Dolphins head coach; 49ers offensive coordinator", (86, 72, 72)),
        "DC": ("Chris O'Leary", 1990, True, 0, "Chargers safeties coach", (64, 70, 66)),
        "STC": ("Ryan Ficken", 1979, True, 2, "Chargers and Vikings special teams coordinator", (70, 64)),
        "GM": ("Joe Hortiz", 1976, False, 2, "Ravens director of player personnel", (74, 82, 76)),
    },
    "LA": {
        "offense": "mcvay", "defense": "fangio", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Sean McVay", 1986, False, 9, "Washington offensive coordinator; Super Bowl LVI champion", (94, 82, 80, 86, 84)),
        "OC": ("Nate Scheelhaase", 1990, True, 1, "Rams passing game coordinator; Iowa State OC", (64, 70, 66)),
        "DC": ("Chris Shula", 1986, False, 2, "Rams linebackers coach", (74, 76, 72)),
        "STC": ("Bubba Ventrone", 1982, False, 0, "Colts special teams coordinator", (74, 66)),
        "GM": ("Les Snead", 1970, False, 14, "Falcons director of player personnel", (82, 80, 70)),
    },
    "MIA": {
        "offense": "wideZone", "defense": "cover3", "offCaller": "OC", "defCaller": "HC",
        "HC": ("Jeff Hafley", 1979, False, 0, "Packers defensive coordinator; Boston College head coach", (76, 74, 66, 74, 72)),
        "OC": ("Bobby Slowik", 1987, False, 0, "Texans offensive coordinator", (70, 70, 66)),
        "DC": ("Sean Duggan", 1993, True, 0, "Packers linebackers coach", (60, 68, 64)),
        "STC": ("Chris Tabor", 1971, False, 0, "Panthers and Browns special teams coordinator", (72, 64)),
        "GM": ("Jon-Eric Sullivan", 1977, True, 0, "Packers vice president of player personnel", (64, 74, 66)),
    },
    "MIN": {
        "offense": "mcvay", "defense": "pressure", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Kevin O'Connell", 1985, False, 4, "Rams offensive coordinator", (86, 80, 74, 82, 78)),
        "OC": ("Wes Phillips", 1979, False, 4, "Rams tight ends coach and passing game coordinator", (62, 72, 66)),
        "DC": ("Brian Flores", 1981, False, 3, "Dolphins head coach; Patriots defensive play-caller", (90, 76, 78)),
        "STC": ("Matt Daniels", 1989, True, 3, "Vikings assistant special teams coach", (68, 64)),
        "GM": ("Nolan Teasley", 1985, True, 0, "Vikings assistant GM; Seahawks pro personnel", (62, 70, 64)),
    },
    "NE": {
        "offense": "erhardtPerkins", "defense": "multiple", "offCaller": "OC", "defCaller": "DC",
        "HC": ("Mike Vrabel", 1975, False, 1, "Titans head coach (2021 Coach of the Year)", (76, 82, 78, 90, 80)),
        "OC": ("Josh McDaniels", 1976, False, 1, "Patriots OC (six Super Bowl titles); Raiders and Broncos head coach", (82, 76, 74)),
        "DC": ("Zak Kuhr", 1991, True, 0, "Patriots linebackers coach; Titans assistant", (62, 68, 64)),
        "STC": ("Jeremy Springer", 1984, True, 1, "Rams special teams assistant; Texas A&M ST coordinator", (68, 62)),
        "GM": ("Eliot Wolf", 1982, False, 1, "Patriots director of scouting; Browns and Packers personnel", (68, 74, 72)),
    },
    "NO": {
        "offense": "westCoast", "defense": "fangio", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Kellen Moore", 1988, False, 1, "Eagles offensive coordinator (Super Bowl LIX); Cowboys OC", (80, 72, 66, 72, 70)),
        "OC": ("Doug Nussmeier", 1970, False, 1, "Eagles quarterbacks coach; college OC at Alabama and Michigan", (62, 70, 64)),
        "DC": ("Brandon Staley", 1982, False, 1, "Chargers head coach; Rams defensive coordinator", (76, 72, 70)),
        "STC": ("Phil Galiano", 1975, True, 1, "Saints assistant special teams coach", (66, 62)),
        "GM": ("Mickey Loomis", 1956, False, 24, "Saints executive since 2000", (76, 70, 58)),
    },
    "NYG": {
        "offense": "westCoast", "defense": "macdonald", "offCaller": "OC", "defCaller": "DC",
        "HC": ("John Harbaugh", 1962, False, 0, "Ravens head coach for 18 seasons (Super Bowl XLVII champion)", (76, 84, 84, 92, 84)),
        "OC": ("Matt Nagy", 1978, False, 0, "Chiefs offensive coordinator; Bears head coach", (70, 70, 68)),
        "DC": ("Dennard Wilson", 1982, False, 0, "Titans defensive coordinator; Ravens assistant", (68, 72, 68)),
        "STC": ("Chris Horton", 1984, True, 0, "Ravens assistant special teams coach", (68, 64)),
        "GM": ("Joe Schoen", 1979, False, 4, "Bills assistant GM", (68, 72, 68)),
    },
    "NYJ": {
        "offense": "spread", "defense": "pressure", "offCaller": "OC", "defCaller": "HC",
        "HC": ("Aaron Glenn", 1972, False, 1, "Lions defensive coordinator; Saints DB coach", (76, 74, 64, 76, 72)),
        "OC": ("Frank Reich", 1961, False, 0, "Colts and Panthers head coach; Eagles OC (Super Bowl LII)", (72, 70, 70)),
        "DC": ("Brian Duker", 1987, True, 0, "Lions defensive pass game coordinator", (62, 70, 66)),
        "STC": ("Chris Banjo", 1990, False, 1, "Lions assistant special teams coach", (64, 62)),
        "GM": ("Darren Mougey", 1988, False, 1, "Broncos assistant GM", (64, 70, 66)),
    },
    "PHI": {
        "offense": "wideZone", "defense": "fangio", "offCaller": "OC", "defCaller": "DC",
        "HC": ("Nick Sirianni", 1981, False, 5, "Colts offensive coordinator; Super Bowl LIX champion", (74, 78, 74, 84, 78)),
        "OC": ("Sean Mannion", 1992, False, 0, "Packers quarterbacks coach", (64, 70, 66)),
        "DC": ("Vic Fangio", 1958, False, 2, "Broncos head coach; architect of the two-high 3-4", (94, 80, 80)),
        "STC": ("Michael Clay", 1991, False, 5, "Eagles assistant special teams coach", (74, 66)),
        "GM": ("Howie Roseman", 1975, False, 16, "Eagles executive since 2000; two Super Bowl titles", (92, 84, 88)),
    },
    "PIT": {
        "offense": "westCoast", "defense": "multiple", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Mike McCarthy", 1963, False, 0, "Cowboys and Packers head coach (Super Bowl XLV champion)", (78, 72, 70, 78, 72)),
        "OC": ("Brian Angelichio", 1973, True, 0, "Vikings tight ends coach; Packers assistant", (60, 70, 64)),
        "DC": ("Patrick Graham", 1979, False, 0, "Raiders and Giants defensive coordinator", (76, 74, 72)),
        "STC": ("Danny Crossman", 1967, False, 0, "Dolphins and Bills special teams coordinator", (72, 64)),
        "GM": ("Omar Khan", 1977, False, 3, "Steelers vice president of football operations", (78, 74, 76)),
    },
    "SF": {
        "offense": "wideZone", "defense": "cover3", "offCaller": "HC", "defCaller": "DC",
        "HC": ("Kyle Shanahan", 1979, False, 9, "Falcons OC (2016 MVP offense); Washington OC", (95, 80, 72, 84, 86)),
        "OC": ("Klay Kubiak", 1991, True, 1, "49ers passing game coordinator", (62, 70, 66)),
        "DC": ("Raheem Morris", 1976, False, 0, "Falcons and Buccaneers head coach; Rams DC (Super Bowl LVI)", (80, 76, 74)),
        "STC": ("Brant Boyer", 1971, False, 1, "Jets special teams coordinator", (74, 64)),
        "GM": ("John Lynch", 1971, False, 9, "Hall of Fame safety; FOX analyst", (80, 78, 74)),
    },
    "SEA": {
        "offense": "wideZone", "defense": "macdonald", "offCaller": "OC", "defCaller": "HC",
        "HC": ("Mike Macdonald", 1987, False, 2, "Ravens defensive coordinator; Michigan DC", (92, 82, 76, 84, 84)),
        "OC": ("Brian Fleury", 1984, True, 0, "49ers tight ends coach and run game coordinator", (68, 72, 68)),
        "DC": ("Aden Durde", 1980, False, 2, "Cowboys defensive line coach", (72, 76, 70)),
        "STC": ("Jay Harbaugh", 1989, False, 2, "Michigan special teams coordinator", (74, 66)),
        "GM": ("John Schneider", 1971, False, 16, "Packers director of football operations", (82, 86, 76)),
    },
    "TB": {
        "offense": "mcvay", "defense": "pressure", "offCaller": "OC", "defCaller": "HC",
        "HC": ("Todd Bowles", 1963, False, 4, "Buccaneers DC (Super Bowl LV); Jets head coach", (80, 74, 68, 82, 74)),
        "OC": ("Zac Robinson", 1986, False, 0, "Falcons offensive coordinator; Rams passing game coordinator", (68, 70, 66)),
        "DC": None,
        "STC": ("Danny Smith", 1953, False, 0, "Steelers special teams coordinator", (74, 62)),
        "GM": ("Jason Licht", 1971, False, 12, "Cardinals vice president of player personnel", (80, 80, 76)),
    },
    "TEN": {
        "offense": "erhardtPerkins", "defense": "cover3", "offCaller": "OC", "defCaller": "HC",
        "HC": ("Robert Saleh", 1979, False, 0, "Jets head coach; 49ers defensive coordinator", (82, 76, 66, 82, 76)),
        "OC": ("Brian Daboll", 1975, False, 0, "Giants head coach (2022 Coach of the Year); Bills OC", (78, 74, 72)),
        "DC": ("Gus Bradley", 1966, False, 0, "Colts and Chargers defensive coordinator; Seahawks DC", (70, 70, 68)),
        "STC": ("John Fassel", 1974, False, 0, "Cowboys and Rams special teams coordinator", (82, 66)),
        "GM": ("Mike Borgonzi", 1981, True, 1, "Chiefs assistant GM", (66, 74, 70)),
    },
    "WAS": {
        "offense": "vertical", "defense": "pressure", "offCaller": "OC", "defCaller": "DC",
        "HC": ("Dan Quinn", 1970, False, 2, "Cowboys defensive coordinator; Falcons head coach", (76, 76, 70, 86, 74)),
        "OC": ("David Blough", 1995, False, 0, "Commanders quarterbacks coach", (62, 70, 64)),
        "DC": ("Daronte Jones", 1978, True, 0, "Vikings defensive pass game coordinator; LSU DC", (66, 70, 66)),
        "STC": ("Larry Izzo", 1974, False, 0, "Seahawks special teams coordinator", (70, 64)),
        "GM": ("Adam Peters", 1979, False, 2, "49ers assistant GM", (78, 82, 76)),
    },
}

# Head coaches whose side of the ball is defense (the rest are offensive head coaches).
DEFENSIVE_HCS = {"BAL", "HOU", "MIA", "NYJ", "SEA", "TB", "TEN", "WAS", "NE"}

FIRST = ["Mark", "Kevin", "Brian", "Dave", "Chris", "Matt", "Tony", "Greg", "Rick", "Steve", "Jason", "Ryan",
         "Eric", "Scott", "Jeff", "Andre", "Marcus", "Darnell", "Luis", "Paul", "Sam", "Tyler", "Derek", "Omar",
         "Keith", "Jamal", "Nate", "Ben", "Carlos", "Travis", "Aaron", "Adam", "Dana", "Jordan", "Casey", "Morgan"]
LAST = ["Whitfield", "Okafor", "Brennan", "Castillo", "Hargrove", "Lindqvist", "Pruitt", "Delgado", "Ashby",
        "Mercer", "Vaughn", "Kowalski", "Tran", "Sutton", "Oduya", "Fairchild", "Holloway", "Ruiz", "Strickland",
        "Becker", "Navarro", "Pennington", "Gallagher", "Ibarra", "Thornton", "Kessler", "Moody", "Abernathy",
        "Quintero", "Haskins", "Raines", "Calloway", "Lockhart", "Sorensen", "Yates", "Whitaker", "Dunleavy"]


def _rng(key: str) -> random.Random:
    return random.Random(int(hashlib.sha256(f"staff:{key}".encode()).hexdigest()[:12], 16))


def _slug(name: str) -> str:
    return "".join(c for c in name.lower().replace(" ", "-") if c.isalnum() or c == "-")


ATTRS = {
    "HC": ("playCalling", "development", "gameManagement", "leadership", "evaluation"),
    "OC": ("playCalling", "development", "evaluation"),
    "DC": ("playCalling", "development", "evaluation"),
    "STC": ("specialTeams", "development"),
    "GM": ("negotiation", "evaluation", "capManagement"),
}


def build_staff(season: int) -> tuple[list, dict]:
    """Returns (public staff list, hidden attributes by staff id)."""
    people, hidden = [], {}
    used_names = set()
    for team, s in STAFF.items():
        for role in ("HC", "OC", "DC", "STC", "GM"):
            entry = s.get(role)
            if entry is None:
                continue
            name, born, estimated, tenure, background, attrs = entry
            sid = f"{_slug(name)}-{born}"
            used_names.add(name)
            side = None
            if role == "HC":
                side = "defense" if team in DEFENSIVE_HCS else "offense"
            elif role == "OC":
                side = "offense"
            elif role == "DC":
                side = "defense"
            calls = []
            if s["offCaller"] == role:
                calls.append("offense")
            if s["defCaller"] == role:
                calls.append("defense")
            people.append({
                "id": sid, "name": name, "team": team, "role": role, "birthYear": born,
                "birthYearEstimated": estimated, "hiredYear": season - tenure, "background": background,
                "side": side, "callsPlays": calls,
                "scheme": s["offense"] if side == "offense" else s["defense"] if side == "defense" else None,
            })
            hidden[sid] = dict(zip(ATTRS[role], attrs))
        # Generated staff: head athletic trainer and the two scouting directors.
        for role, attrs in (("TRN", ("prevention", "recovery")), ("PRO", ("evaluation",)), ("COL", ("evaluation",))):
            rng = _rng(f"{team}:{role}")
            while True:
                name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                if name not in used_names:
                    break
            used_names.add(name)
            born = rng.randint(1962, 1990)
            sid = f"{_slug(name)}-{born}"
            people.append({
                "id": sid, "name": name, "team": team, "role": role, "birthYear": born,
                "birthYearEstimated": False, "hiredYear": season - rng.randint(0, 9), "background": None,
                "side": None, "callsPlays": [], "scheme": None, "generated": True,
            })
            hidden[sid] = {a: int(min(92, max(40, rng.gauss(66, 9)))) for a in attrs}
    return people, hidden


TEAM_SCHEMES = {team: {"offense": s["offense"], "defense": s["defense"]} for team, s in STAFF.items()}

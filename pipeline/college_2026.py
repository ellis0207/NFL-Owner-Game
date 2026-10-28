"""The 2026 college football universe: every FBS team, its real head coach,
and a generated 2026 schedule.

    python pipeline/college_2026.py

Writes data/college-2026/teams.json and schedule.json.

Conferences are the 2026 alignments (Pac-12 rebuilt with eight teams, North
Dakota State and Sacramento State moving up). Head coaches are the people in
the job for 2026 (Wikipedia's list of current FBS coaches, checked Oct 2026).
Locations are campus coordinates, close enough for travel costs. Strength is
our reading of each program going into 2026; it is hidden from the owner and
each save shuffles it a little. College schemes are a light hand-entered
label (most Group of Five teams are generated).

The schedule is generated, not the real 2026 one: conference games by each
league's 2026 count (nine in the SEC, Big Ten and Big 12), real rivalry games
on rivalry weekend, the Red River Rivalry and Florida-Georgia at their
neutral sites, Army-Navy on its own Saturday, and the rest of the
non-conference slate drawn at random. Bowl and playoff games are made by the
engine once the regular season is done; their dates and sites are real.
"""

import datetime as dt
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "college-2026"

# id, school, nickname, conference, head coach, first season, city, state, lat, lon, strength, offense, defense
# offense: airRaid, spreadRpo, proStyle, spreadOption, flexbone. defense: 43, 34, 425, 335, multiple.
TEAMS = [
    # SEC
    ("ALA", "Alabama", "Crimson Tide", "SEC", "Kalen DeBoer", 2024, "Tuscaloosa", "AL", 33.21, -87.55, 87, "proStyle", "34"),
    ("ARK", "Arkansas", "Razorbacks", "SEC", "Ryan Silverfield", 2026, "Fayetteville", "AR", 36.07, -94.18, 66, "spreadRpo", "43"),
    ("AUB", "Auburn", "Tigers", "SEC", "Alex Golesh", 2026, "Auburn", "AL", 32.60, -85.49, 76, "spreadRpo", "43"),
    ("FLA", "Florida", "Gators", "SEC", "Jon Sumrall", 2026, "Gainesville", "FL", 29.65, -82.35, 77, "proStyle", "43"),
    ("UGA", "Georgia", "Bulldogs", "SEC", "Kirby Smart", 2016, "Athens", "GA", 33.95, -83.37, 90, "proStyle", "34"),
    ("UK", "Kentucky", "Wildcats", "SEC", "Will Stein", 2026, "Lexington", "KY", 38.02, -84.50, 64, "spreadRpo", "34"),
    ("LSU", "LSU", "Tigers", "SEC", "Lane Kiffin", 2026, "Baton Rouge", "LA", 30.41, -91.18, 85, "spreadRpo", "43"),
    ("MSST", "Mississippi State", "Bulldogs", "SEC", "Jeff Lebby", 2024, "Starkville", "MS", 33.46, -88.79, 67, "airRaid", "34"),
    ("MIZ", "Missouri", "Tigers", "SEC", "Eli Drinkwitz", 2020, "Columbia", "MO", 38.94, -92.33, 77, "proStyle", "43"),
    ("OU", "Oklahoma", "Sooners", "SEC", "Brent Venables", 2022, "Norman", "OK", 35.21, -97.44, 84, "airRaid", "425"),
    ("MISS", "Ole Miss", "Rebels", "SEC", "Pete Golding", 2025, "Oxford", "MS", 34.36, -89.53, 84, "spreadRpo", "43"),
    ("SC", "South Carolina", "Gamecocks", "SEC", "Shane Beamer", 2021, "Columbia", "SC", 33.99, -81.03, 72, "spreadRpo", "425"),
    ("TENN", "Tennessee", "Volunteers", "SEC", "Josh Heupel", 2021, "Knoxville", "TN", 35.95, -83.93, 82, "spreadRpo", "43"),
    ("TEX", "Texas", "Longhorns", "SEC", "Steve Sarkisian", 2021, "Austin", "TX", 30.28, -97.73, 88, "proStyle", "34"),
    ("TAMU", "Texas A&M", "Aggies", "SEC", "Mike Elko", 2024, "College Station", "TX", 30.61, -96.34, 86, "proStyle", "43"),
    ("VAN", "Vanderbilt", "Commodores", "SEC", "Clark Lea", 2021, "Nashville", "TN", 36.14, -86.80, 78, "spreadOption", "34"),
    # Big Ten
    ("ILL", "Illinois", "Fighting Illini", "B1G", "Bret Bielema", 2021, "Champaign", "IL", 40.10, -88.23, 75, "proStyle", "34"),
    ("IND", "Indiana", "Hoosiers", "B1G", "Curt Cignetti", 2024, "Bloomington", "IN", 39.17, -86.52, 89, "spreadRpo", "425"),
    ("IOWA", "Iowa", "Hawkeyes", "B1G", "Kirk Ferentz", 1999, "Iowa City", "IA", 41.66, -91.55, 77, "proStyle", "43"),
    ("MD", "Maryland", "Terrapins", "B1G", "Mike Locksley", 2019, "College Park", "MD", 38.99, -76.94, 63, "spreadRpo", "34"),
    ("MICH", "Michigan", "Wolverines", "B1G", "Kyle Whittingham", 2026, "Ann Arbor", "MI", 42.28, -83.74, 83, "proStyle", "34"),
    ("MSU", "Michigan State", "Spartans", "B1G", "Pat Fitzgerald", 2026, "East Lansing", "MI", 42.73, -84.48, 61, "proStyle", "43"),
    ("MINN", "Minnesota", "Golden Gophers", "B1G", "P. J. Fleck", 2017, "Minneapolis", "MN", 44.97, -93.23, 69, "proStyle", "43"),
    ("NEB", "Nebraska", "Cornhuskers", "B1G", "Matt Rhule", 2023, "Lincoln", "NE", 40.82, -96.70, 73, "proStyle", "34"),
    ("NU", "Northwestern", "Wildcats", "B1G", "David Braun", 2023, "Evanston", "IL", 42.06, -87.68, 63, "proStyle", "43"),
    ("OSU", "Ohio State", "Buckeyes", "B1G", "Ryan Day", 2019, "Columbus", "OH", 40.00, -83.02, 92, "spreadRpo", "43"),
    ("ORE", "Oregon", "Ducks", "B1G", "Dan Lanning", 2022, "Eugene", "OR", 44.06, -123.07, 89, "spreadRpo", "34"),
    ("PSU", "Penn State", "Nittany Lions", "B1G", "Matt Campbell", 2026, "University Park", "PA", 40.80, -77.86, 81, "proStyle", "43"),
    ("PUR", "Purdue", "Boilermakers", "B1G", "Barry Odom", 2025, "West Lafayette", "IN", 40.42, -86.92, 57, "spreadRpo", "34"),
    ("RUTG", "Rutgers", "Scarlet Knights", "B1G", "Greg Schiano", 2020, "Piscataway", "NJ", 40.51, -74.46, 63, "proStyle", "43"),
    ("UCLA", "UCLA", "Bruins", "B1G", "Bob Chesney", 2026, "Los Angeles", "CA", 34.07, -118.44, 60, "spreadRpo", "34"),
    ("USC", "USC", "Trojans", "B1G", "Lincoln Riley", 2022, "Los Angeles", "CA", 34.02, -118.29, 82, "airRaid", "425"),
    ("WASH", "Washington", "Huskies", "B1G", "Jedd Fisch", 2024, "Seattle", "WA", 47.65, -122.30, 78, "proStyle", "425"),
    ("WIS", "Wisconsin", "Badgers", "B1G", "Luke Fickell", 2023, "Madison", "WI", 43.07, -89.41, 64, "proStyle", "34"),
    # Big 12
    ("ARIZ", "Arizona", "Wildcats", "B12", "Brent Brennan", 2024, "Tucson", "AZ", 32.23, -110.95, 71, "proStyle", "425"),
    ("ASU", "Arizona State", "Sun Devils", "B12", "Kenny Dillingham", 2023, "Tempe", "AZ", 33.42, -111.93, 75, "spreadRpo", "34"),
    ("BAY", "Baylor", "Bears", "B12", "Dave Aranda", 2020, "Waco", "TX", 31.55, -97.12, 70, "airRaid", "34"),
    ("BYU", "BYU", "Cougars", "B12", "Kalani Sitake", 2016, "Provo", "UT", 40.25, -111.65, 80, "proStyle", "43"),
    ("CIN", "Cincinnati", "Bearcats", "B12", "Scott Satterfield", 2023, "Cincinnati", "OH", 39.13, -84.52, 70, "spreadRpo", "34"),
    ("COLO", "Colorado", "Buffaloes", "B12", "Deion Sanders", 2023, "Boulder", "CO", 40.01, -105.27, 64, "airRaid", "34"),
    ("HOU", "Houston", "Cougars", "B12", "Willie Fritz", 2024, "Houston", "TX", 29.72, -95.34, 73, "spreadOption", "34"),
    ("ISU", "Iowa State", "Cyclones", "B12", "Jimmy Rogers", 2026, "Ames", "IA", 42.03, -93.65, 71, "proStyle", "335"),
    ("KU", "Kansas", "Jayhawks", "B12", "Lance Leipold", 2021, "Lawrence", "KS", 38.96, -95.25, 68, "spreadOption", "43"),
    ("KSU", "Kansas State", "Wildcats", "B12", "Collin Klein", 2026, "Manhattan", "KS", 39.20, -96.59, 71, "spreadOption", "425"),
    ("OKST", "Oklahoma State", "Cowboys", "B12", "Eric Morris", 2026, "Stillwater", "OK", 36.13, -97.07, 57, "airRaid", "43"),
    ("TCU", "TCU", "Horned Frogs", "B12", "Sonny Dykes", 2022, "Fort Worth", "TX", 32.71, -97.36, 74, "airRaid", "335"),
    ("TTU", "Texas Tech", "Red Raiders", "B12", "Joey McGuire", 2022, "Lubbock", "TX", 33.58, -101.87, 85, "airRaid", "43"),
    ("UCF", "UCF", "Knights", "B12", "Scott Frost", 2025, "Orlando", "FL", 28.60, -81.20, 65, "spreadOption", "34"),
    ("UTAH", "Utah", "Utes", "B12", "Morgan Scalley", 2026, "Salt Lake City", "UT", 40.76, -111.85, 79, "spreadOption", "425"),
    ("WVU", "West Virginia", "Mountaineers", "B12", "Rich Rodriguez", 2025, "Morgantown", "WV", 39.65, -79.95, 62, "spreadOption", "335"),
    # ACC
    ("BC", "Boston College", "Eagles", "ACC", "Bill O'Brien", 2024, "Chestnut Hill", "MA", 42.34, -71.17, 57, "proStyle", "43"),
    ("CAL", "California", "Golden Bears", "ACC", "Tosh Lupoi", 2026, "Berkeley", "CA", 37.87, -122.25, 64, "proStyle", "34"),
    ("CLEM", "Clemson", "Tigers", "ACC", "Dabo Swinney", 2009, "Clemson", "SC", 34.68, -82.84, 79, "spreadRpo", "43"),
    ("DUKE", "Duke", "Blue Devils", "ACC", "Manny Diaz", 2024, "Durham", "NC", 36.00, -78.94, 72, "spreadRpo", "425"),
    ("FSU", "Florida State", "Seminoles", "ACC", "Mike Norvell", 2020, "Tallahassee", "FL", 30.44, -84.30, 73, "spreadRpo", "43"),
    ("GT", "Georgia Tech", "Yellow Jackets", "ACC", "Brent Key", 2022, "Atlanta", "GA", 33.77, -84.39, 76, "spreadOption", "43"),
    ("LOU", "Louisville", "Cardinals", "ACC", "Jeff Brohm", 2023, "Louisville", "KY", 38.21, -85.76, 74, "spreadRpo", "34"),
    ("MIA", "Miami", "Hurricanes", "ACC", "Mario Cristobal", 2022, "Coral Gables", "FL", 25.72, -80.28, 86, "proStyle", "43"),
    ("UNC", "North Carolina", "Tar Heels", "ACC", "Bill Belichick", 2025, "Chapel Hill", "NC", 35.91, -79.05, 63, "proStyle", "multiple"),
    ("NCST", "NC State", "Wolfpack", "ACC", "Dave Doeren", 2013, "Raleigh", "NC", 35.78, -78.68, 69, "spreadRpo", "335"),
    ("PITT", "Pittsburgh", "Panthers", "ACC", "Pat Narduzzi", 2015, "Pittsburgh", "PA", 40.44, -79.96, 71, "spreadRpo", "43"),
    ("SMU", "SMU", "Mustangs", "ACC", "Rhett Lashlee", 2022, "Dallas", "TX", 32.84, -96.78, 75, "airRaid", "34"),
    ("STAN", "Stanford", "Cardinal", "ACC", "Tavita Pritchard", 2026, "Stanford", "CA", 37.43, -122.17, 57, "proStyle", "34"),
    ("SYR", "Syracuse", "Orange", "ACC", "Fran Brown", 2024, "Syracuse", "NY", 43.04, -76.14, 61, "spreadRpo", "425"),
    ("UVA", "Virginia", "Cavaliers", "ACC", "Tony Elliott", 2022, "Charlottesville", "VA", 38.03, -78.51, 74, "spreadRpo", "34"),
    ("VT", "Virginia Tech", "Hokies", "ACC", "James Franklin", 2026, "Blacksburg", "VA", 37.22, -80.42, 66, "proStyle", "43"),
    ("WAKE", "Wake Forest", "Demon Deacons", "ACC", "Jake Dickert", 2025, "Winston-Salem", "NC", 36.13, -80.28, 63, "spreadRpo", "34"),
    # Pac-12
    ("BOIS", "Boise State", "Broncos", "P12", "Spencer Danielson", 2023, "Boise", "ID", 43.60, -116.20, 70, "proStyle", "43"),
    ("CSU", "Colorado State", "Rams", "P12", "Jim Mora", 2026, "Fort Collins", "CO", 40.57, -105.09, 52, "proStyle", "34"),
    ("FRES", "Fresno State", "Bulldogs", "P12", "Matt Entz", 2025, "Fresno", "CA", 36.81, -119.75, 62, "spreadRpo", "43"),
    ("ORST", "Oregon State", "Beavers", "P12", "JaMarcus Shephard", 2026, "Corvallis", "OR", 44.56, -123.28, 56, "spreadRpo", "34"),
    ("SDSU", "San Diego State", "Aztecs", "P12", "Sean Lewis", 2024, "San Diego", "CA", 32.78, -117.07, 64, "airRaid", "335"),
    ("TXST", "Texas State", "Bobcats", "P12", "G. J. Kinne", 2023, "San Marcos", "TX", 29.89, -97.94, 62, "spreadRpo", "43"),
    ("USU", "Utah State", "Aggies", "P12", "Bronco Mendenhall", 2025, "Logan", "UT", 41.75, -111.81, 57, "spreadRpo", "34"),
    ("WSU", "Washington State", "Cougars", "P12", "Kirby Moore", 2026, "Pullman", "WA", 46.73, -117.16, 58, "airRaid", "425"),
    # Mountain West
    ("AF", "Air Force", "Falcons", "MW", "Troy Calhoun", 2007, "Colorado Springs", "CO", 38.99, -104.84, 53, "flexbone", "34"),
    ("HAW", "Hawaii", "Rainbow Warriors", "MW", "Timmy Chang", 2022, "Honolulu", "HI", 21.30, -157.82, 58, "airRaid", "43"),
    ("NEV", "Nevada", "Wolf Pack", "MW", "Jeff Choate", 2024, "Reno", "NV", 39.54, -119.82, 47, "spreadRpo", "34"),
    ("UNM", "New Mexico", "Lobos", "MW", "Jason Eck", 2025, "Albuquerque", "NM", 35.08, -106.62, 56, "spreadRpo", "43"),
    ("NDSU", "North Dakota State", "Bison", "MW", "Tim Polasek", 2024, "Fargo", "ND", 46.90, -96.80, 62, "proStyle", "43"),
    ("NIU", "Northern Illinois", "Huskies", "MW", "Rob Harley (interim)", 2026, "DeKalb", "IL", 41.93, -88.77, 52, "proStyle", "34"),
    ("SJSU", "San Jose State", "Spartans", "MW", "Ken Niumatalolo", 2024, "San Jose", "CA", 37.34, -121.88, 52, "spreadRpo", "425"),
    ("UNLV", "UNLV", "Rebels", "MW", "Dan Mullen", 2025, "Las Vegas", "NV", 36.11, -115.14, 66, "spreadRpo", "34"),
    ("UTEP", "UTEP", "Miners", "MW", "Scotty Walden", 2024, "El Paso", "TX", 31.77, -106.51, 45, "spreadRpo", "43"),
    ("WYO", "Wyoming", "Cowboys", "MW", "Jay Sawvel", 2024, "Laramie", "WY", 41.31, -105.57, 50, "proStyle", "43"),
    # American
    ("ARMY", "Army", "Black Knights", "AAC", "Jeff Monken", 2014, "West Point", "NY", 41.39, -73.96, 59, "flexbone", "34"),
    ("CLT", "Charlotte", "49ers", "AAC", "Tim Albin", 2025, "Charlotte", "NC", 35.31, -80.74, 44, "spreadOption", "43"),
    ("ECU", "East Carolina", "Pirates", "AAC", "Blake Harrell", 2024, "Greenville", "NC", 35.61, -77.37, 60, "spreadRpo", "34"),
    ("FAU", "Florida Atlantic", "Owls", "AAC", "Zach Kittley", 2025, "Boca Raton", "FL", 26.37, -80.10, 54, "airRaid", "425"),
    ("MEM", "Memphis", "Tigers", "AAC", "Charles Huff", 2026, "Memphis", "TN", 35.12, -89.94, 65, "spreadRpo", "43"),
    ("NAVY", "Navy", "Midshipmen", "AAC", "Brian Newberry", 2023, "Annapolis", "MD", 38.98, -76.49, 66, "flexbone", "335"),
    ("UNT", "North Texas", "Mean Green", "AAC", "Neal Brown", 2026, "Denton", "TX", 33.21, -97.15, 66, "airRaid", "425"),
    ("RICE", "Rice", "Owls", "AAC", "Scott Abell", 2025, "Houston", "TX", 29.72, -95.40, 49, "flexbone", "43"),
    ("USF", "South Florida", "Bulls", "AAC", "Brian Hartline", 2026, "Tampa", "FL", 28.06, -82.41, 67, "spreadRpo", "43"),
    ("TEM", "Temple", "Owls", "AAC", "K. C. Keeler", 2025, "Philadelphia", "PA", 39.98, -75.16, 52, "spreadRpo", "43"),
    ("TULN", "Tulane", "Green Wave", "AAC", "Will Hall", 2026, "New Orleans", "LA", 29.94, -90.12, 68, "spreadRpo", "34"),
    ("TLSA", "Tulsa", "Golden Hurricane", "AAC", "Tre Lamb", 2025, "Tulsa", "OK", 36.15, -95.95, 51, "spreadRpo", "335"),
    ("UAB", "UAB", "Blazers", "AAC", "Alex Mortensen", 2025, "Birmingham", "AL", 33.50, -86.80, 50, "spreadRpo", "43"),
    ("UTSA", "UTSA", "Roadrunners", "AAC", "Jeff Traylor", 2020, "San Antonio", "TX", 29.58, -98.62, 61, "spreadRpo", "43"),
    # Sun Belt
    ("APP", "App State", "Mountaineers", "SBC", "Dowell Loggains", 2025, "Boone", "NC", 36.21, -81.68, 57, "spreadRpo", "34"),
    ("ARST", "Arkansas State", "Red Wolves", "SBC", "Butch Jones", 2021, "Jonesboro", "AR", 35.84, -90.67, 54, "spreadRpo", "43"),
    ("CCU", "Coastal Carolina", "Chanticleers", "SBC", "Ryan Beard", 2026, "Conway", "SC", 33.79, -79.01, 51, "spreadOption", "34"),
    ("GASO", "Georgia Southern", "Eagles", "SBC", "Clay Helton", 2022, "Statesboro", "GA", 32.42, -81.78, 56, "proStyle", "43"),
    ("GAST", "Georgia State", "Panthers", "SBC", "Dell McGee", 2024, "Atlanta", "GA", 33.75, -84.39, 46, "spreadRpo", "43"),
    ("JMU", "James Madison", "Dukes", "SBC", "Billy Napier", 2026, "Harrisonburg", "VA", 38.44, -78.87, 70, "proStyle", "43"),
    ("ULL", "Louisiana", "Ragin' Cajuns", "SBC", "Michael Desormeaux", 2022, "Lafayette", "LA", 30.21, -92.02, 53, "spreadRpo", "34"),
    ("ULM", "UL Monroe", "Warhawks", "SBC", "Bryant Vincent", 2024, "Monroe", "LA", 32.53, -92.07, 47, "spreadRpo", "43"),
    ("LT", "Louisiana Tech", "Bulldogs", "SBC", "Sonny Cumbie", 2022, "Ruston", "LA", 32.53, -92.65, 55, "airRaid", "34"),
    ("MRSH", "Marshall", "Thundering Herd", "SBC", "Tony Gibson", 2025, "Huntington", "WV", 38.42, -82.42, 55, "spreadRpo", "335"),
    ("ODU", "Old Dominion", "Monarchs", "SBC", "Ricky Rahne", 2020, "Norfolk", "VA", 36.89, -76.31, 60, "spreadOption", "43"),
    ("USA", "South Alabama", "Jaguars", "SBC", "Major Applewhite", 2024, "Mobile", "AL", 30.70, -88.18, 53, "spreadRpo", "43"),
    ("USM", "Southern Miss", "Golden Eagles", "SBC", "Blake Anderson", 2025, "Hattiesburg", "MS", 31.33, -89.33, 57, "spreadRpo", "34"),
    ("TROY", "Troy", "Trojans", "SBC", "Gerad Parker", 2024, "Troy", "AL", 31.80, -85.96, 56, "proStyle", "43"),
    # Conference USA
    ("DEL", "Delaware", "Fightin' Blue Hens", "CUSA", "Ryan Carty", 2022, "Newark", "DE", 39.68, -75.75, 51, "airRaid", "43"),
    ("FIU", "FIU", "Panthers", "CUSA", "Willie Simmons", 2025, "Miami", "FL", 25.76, -80.37, 54, "spreadRpo", "425"),
    ("JVST", "Jacksonville State", "Gamecocks", "CUSA", "Charles Kelly", 2025, "Jacksonville", "AL", 33.82, -85.77, 57, "spreadOption", "43"),
    ("KENN", "Kennesaw State", "Owls", "CUSA", "Jerry Mack", 2025, "Kennesaw", "GA", 34.03, -84.58, 55, "spreadRpo", "34"),
    ("LIB", "Liberty", "Flames", "CUSA", "Jamey Chadwell", 2023, "Lynchburg", "VA", 37.35, -79.18, 58, "spreadOption", "43"),
    ("MTSU", "Middle Tennessee", "Blue Raiders", "CUSA", "Derek Mason", 2024, "Murfreesboro", "TN", 35.85, -86.37, 46, "proStyle", "34"),
    ("MOST", "Missouri State", "Bears", "CUSA", "Casey Woods", 2026, "Springfield", "MO", 37.20, -93.28, 51, "airRaid", "43"),
    ("NMSU", "New Mexico State", "Aggies", "CUSA", "Tony Sanchez", 2024, "Las Cruces", "NM", 32.28, -106.75, 45, "spreadRpo", "43"),
    ("SHSU", "Sam Houston", "Bearkats", "CUSA", "Phil Longo", 2025, "Huntsville", "TX", 30.71, -95.55, 46, "airRaid", "34"),
    ("WKU", "Western Kentucky", "Hilltoppers", "CUSA", "Tyson Helton", 2019, "Bowling Green", "KY", 36.99, -86.45, 60, "airRaid", "34"),
    # MAC
    ("AKR", "Akron", "Zips", "MAC", "Joe Moorhead", 2022, "Akron", "OH", 41.08, -81.51, 43, "spreadRpo", "43"),
    ("BALL", "Ball State", "Cardinals", "MAC", "Mike Uremovich", 2025, "Muncie", "IN", 40.20, -85.41, 45, "proStyle", "34"),
    ("BGSU", "Bowling Green", "Falcons", "MAC", "Eddie George", 2025, "Bowling Green", "OH", 41.38, -83.64, 49, "proStyle", "43"),
    ("BUFF", "Buffalo", "Bulls", "MAC", "Pete Lembo", 2024, "Buffalo", "NY", 43.00, -78.79, 54, "proStyle", "43"),
    ("CMU", "Central Michigan", "Chippewas", "MAC", "Matt Drinkall", 2025, "Mount Pleasant", "MI", 43.59, -84.77, 53, "proStyle", "34"),
    ("EMU", "Eastern Michigan", "Eagles", "MAC", "Chris Creighton", 2014, "Ypsilanti", "MI", 42.25, -83.62, 47, "spreadRpo", "43"),
    ("KENT", "Kent State", "Golden Flashes", "MAC", "Mark Carney", 2025, "Kent", "OH", 41.15, -81.34, 44, "spreadRpo", "425"),
    ("M-OH", "Miami (OH)", "RedHawks", "MAC", "Chuck Martin", 2014, "Oxford", "OH", 39.51, -84.73, 57, "proStyle", "43"),
    ("OHIO", "Ohio", "Bobcats", "MAC", "John Hauser", 2025, "Athens", "OH", 39.32, -82.10, 58, "spreadOption", "43"),
    ("SAC", "Sacramento State", "Hornets", "MAC", "Alonzo Carter", 2026, "Sacramento", "CA", 38.56, -121.42, 50, "spreadRpo", "43"),
    ("TOL", "Toledo", "Rockets", "MAC", "Mike Jacobs", 2026, "Toledo", "OH", 41.66, -83.61, 60, "spreadRpo", "425"),
    ("UMAS", "UMass", "Minutemen", "MAC", "Joe Harasymiak", 2025, "Amherst", "MA", 42.39, -72.53, 40, "proStyle", "34"),
    ("WMU", "Western Michigan", "Broncos", "MAC", "Lance Taylor", 2023, "Kalamazoo", "MI", 42.28, -85.61, 57, "proStyle", "43"),
    # Independents
    ("ND", "Notre Dame", "Fighting Irish", "IND", "Marcus Freeman", 2022, "Notre Dame", "IN", 41.70, -86.24, 88, "proStyle", "43"),
    ("UCONN", "UConn", "Huskies", "IND", "Jason Candle", 2026, "Storrs", "CT", 41.81, -72.25, 58, "spreadRpo", "43"),
]

CONFERENCES = {
    "SEC": {"name": "SEC", "full": "Southeastern Conference", "games": 9, "power": True},
    "B1G": {"name": "Big Ten", "full": "Big Ten Conference", "games": 9, "power": True},
    "B12": {"name": "Big 12", "full": "Big 12 Conference", "games": 9, "power": True},
    "ACC": {"name": "ACC", "full": "Atlantic Coast Conference", "games": 8, "power": True},
    "P12": {"name": "Pac-12", "full": "Pac-12 Conference", "games": 7, "power": False},
    "AAC": {"name": "American", "full": "American Conference", "games": 8, "power": False},
    "MW": {"name": "Mountain West", "full": "Mountain West Conference", "games": 8, "power": False},
    "SBC": {"name": "Sun Belt", "full": "Sun Belt Conference", "games": 8, "power": False},
    "CUSA": {"name": "Conference USA", "full": "Conference USA", "games": 8, "power": False},
    "MAC": {"name": "MAC", "full": "Mid-American Conference", "games": 8, "power": False},
    "IND": {"name": "Independent", "full": "FBS Independents", "games": 0, "power": False},
}

# Rivalry weekend (Week 13, Nov 28): conference and non-conference.
RIVALRIES = [
    ("MICH", "OSU", "The Game"), ("AUB", "ALA", "Iron Bowl"), ("MSST", "MISS", "Egg Bowl"),
    ("TAMU", "TEX", "Lone Star Showdown"), ("VAN", "TENN", None), ("ARK", "MIZ", "Battle Line Rivalry"),
    ("NEB", "IOWA", "Heroes Game"), ("WIS", "MINN", "Paul Bunyan's Axe"), ("PUR", "IND", "Old Oaken Bucket"),
    ("NU", "ILL", None), ("MSU", "PSU", None), ("MD", "RUTG", None), ("USC", "UCLA", "Victory Bell"),
    ("ORE", "WASH", None), ("ASU", "ARIZ", "Territorial Cup"), ("KSU", "KU", "Sunflower Showdown"),
    ("BYU", "UTAH", "Holy War"), ("TCU", "BAY", "Revivalry"), ("WVU", "TTU", None), ("OKST", "COLO", None),
    ("HOU", "UCF", None), ("ISU", "CIN", None),
    ("UNC", "NCST", None), ("VT", "UVA", "Commonwealth Cup"), ("WAKE", "DUKE", None), ("PITT", "MIA", None),
    ("SYR", "BC", None),
    ("GT", "UGA", "Clean, Old-Fashioned Hate"), ("FSU", "FLA", "Sunshine Showdown"),
    ("SC", "CLEM", "Palmetto Bowl"), ("LOU", "UK", "Governor's Cup"), ("ND", "STAN", "Legends Trophy"),
    ("BOIS", "FRES", None), ("ORST", "WSU", None), ("SDSU", "USU", None), ("CSU", "TXST", None),
    ("NEV", "UNLV", "Fremont Cannon"), ("UNM", "NMSU", "Rio Grande Rivalry"), ("WYO", "NDSU", None),
    ("HAW", "SJSU", None), ("UTEP", "NIU", None),
    ("TULN", "MEM", None), ("USF", "FAU", None), ("UTSA", "UNT", None), ("ECU", "CLT", None), ("TEM", "UAB", None),
    ("RICE", "TLSA", None),
    ("APP", "GASO", None), ("ODU", "JMU", "Royal Rivalry"), ("CCU", "MRSH", None), ("GAST", "TROY", None),
    ("USA", "USM", "Battle for the Bell"), ("ULL", "ULM", None), ("LT", "ARST", None),
    ("WKU", "MTSU", "100 Miles of Hate"), ("LIB", "DEL", None), ("FIU", "KENN", None), ("JVST", "SHSU", None),
    ("MOST", "UCONN", None),
    ("TOL", "BGSU", "Battle of I-75"), ("M-OH", "OHIO", "Battle of the Bricks"), ("KENT", "AKR", "Wagon Wheel"),
    ("CMU", "WMU", "Michigan MAC Trophy"), ("EMU", "BALL", None), ("BUFF", "UMAS", None),
]
# Big games pinned to their real weekend and site.
FIXED = [
    # (away, home, week, neutral site, name)
    ("TEX", "OU", 6, ("Cotton Bowl", "Dallas, TX"), "Red River Rivalry"),
    ("FLA", "UGA", 9, ("EverBank Stadium", "Jacksonville, FL"), "Florida-Georgia"),
    ("IOWA", "ISU", 2, None, "Cy-Hawk Trophy"),
    ("ORST", "ORE", 3, None, None),
    ("WSU", "WASH", 2, None, "Apple Cup"),
    ("CSU", "COLO", 1, None, "Rocky Mountain Showdown"),
    ("ALA", "TENN", 7, None, "Third Saturday in October"),
    ("USC", "ND", 7, None, "Jeweled Shillelagh"),
    ("NAVY", "AF", 5, None, "Commander-in-Chief's Trophy"),
    ("AF", "ARMY", 9, None, "Commander-in-Chief's Trophy"),
    ("CAL", "STAN", 11, None, "The Big Game"),
]
ARMY_NAVY = ("NAVY", "ARMY", "2026-12-12", ("MetLife Stadium", "East Rutherford, NJ"))

WEEK0 = dt.date(2026, 8, 29)
SEASON_WEEKS = 14  # Weeks 0-13; conference championships are Week 14.

# NFL team headquarters, for scouting travel costs.
NFL_HQ = {
    "ARI": (33.53, -112.26), "ATL": (34.05, -84.29), "BAL": (39.37, -76.70), "BUF": (42.77, -78.79),
    "CAR": (35.23, -80.85), "CHI": (42.25, -87.88), "CIN": (39.10, -84.52), "CLE": (41.46, -81.72),
    "DAL": (33.11, -96.83), "DEN": (39.64, -104.86), "DET": (42.31, -83.24), "GB": (44.50, -88.06),
    "HOU": (29.68, -95.41), "IND": (39.80, -86.25), "JAX": (30.32, -81.64), "KC": (39.05, -94.48),
    "LAC": (33.66, -117.79), "LA": (34.19, -118.85), "LV": (36.01, -115.15), "MIA": (25.96, -80.24),
    "MIN": (44.84, -93.15), "NE": (42.09, -71.26), "NO": (29.99, -90.20), "NYG": (40.81, -74.07),
    "NYJ": (40.73, -74.33), "PHI": (39.90, -75.17), "PIT": (40.45, -80.01), "SEA": (47.53, -122.17),
    "SF": (37.40, -121.97), "TB": (27.98, -82.50), "TEN": (36.12, -86.71), "WAS": (38.88, -77.40),
}

REGIONS = {
    "West": {"WA", "OR", "CA", "NV", "ID", "UT", "AZ", "HI", "CO", "WY", "NM", "MT"},
    "Southwest": {"TX", "OK", "AR", "LA"},
    "Midwest": {"ND", "SD", "NE", "KS", "MN", "IA", "MO", "WI", "IL", "IN", "MI", "OH"},
    "Southeast": {"AL", "MS", "GA", "FL", "SC", "NC", "TN", "KY"},
    "Northeast": {"VA", "WV", "MD", "DE", "PA", "NJ", "NY", "CT", "MA", "RI", "VT", "NH", "ME", "DC"},
}

# Bowl games outside the playoff, with real 2026-27 dates where announced (others are close to last year's).
BOWLS = [
    ("Cure Bowl", "2026-12-19", "Orlando, FL"), ("Bahamas Bowl", "2026-12-19", "Nassau, Bahamas"),
    ("Myrtle Beach Bowl", "2026-12-19", "Conway, SC"), ("Salute to Veterans Bowl", "2026-12-19", "Montgomery, AL"),
    ("New Mexico Bowl", "2026-12-19", "Albuquerque, NM"), ("LA Bowl", "2026-12-19", "Inglewood, CA"),
    ("Frisco Bowl", "2026-12-22", "Frisco, TX"), ("Boca Raton Bowl", "2026-12-22", "Boca Raton, FL"),
    ("Famous Idaho Potato Bowl", "2026-12-23", "Boise, ID"), ("Hawai'i Bowl", "2026-12-24", "Honolulu, HI"),
    ("GameAbove Sports Bowl", "2026-12-26", "Detroit, MI"), ("Rate Bowl", "2026-12-26", "Phoenix, AZ"),
    ("68 Ventures Bowl", "2026-12-26", "Mobile, AL"), ("Armed Forces Bowl", "2026-12-26", "Fort Worth, TX"),
    ("Independence Bowl", "2026-12-26", "Shreveport, LA"), ("Fenway Bowl", "2026-12-27", "Boston, MA"),
    ("Pinstripe Bowl", "2026-12-27", "Bronx, NY"), ("First Responder Bowl", "2026-12-28", "Dallas, TX"),
    ("Military Bowl", "2026-12-28", "Annapolis, MD"), ("Duke's Mayo Bowl", "2026-12-28", "Charlotte, NC"),
    ("Holiday Bowl", "2026-12-29", "San Diego, CA"), ("Las Vegas Bowl", "2026-12-29", "Las Vegas, NV"),
    ("Birmingham Bowl", "2026-12-29", "Birmingham, AL"), ("Arizona Bowl", "2026-12-29", "Tucson, AZ"),
    ("Pop-Tarts Bowl", "2026-12-30", "Orlando, FL"), ("Texas Bowl", "2026-12-30", "Houston, TX"),
    ("Music City Bowl", "2026-12-30", "Nashville, TN"), ("Alamo Bowl", "2026-12-31", "San Antonio, TX"),
    ("Liberty Bowl", "2026-12-31", "Memphis, TN"), ("Sun Bowl", "2026-12-31", "El Paso, TX"),
    ("Gator Bowl", "2026-12-31", "Jacksonville, FL"), ("Citrus Bowl", "2027-01-01", "Orlando, FL"),
    ("ReliaQuest Bowl", "2027-01-01", "Tampa, FL"), ("Camellia Bowl", "2026-12-20", "Montgomery, AL"),
    ("Gasparilla Bowl", "2026-12-23", "Tampa, FL"), ("Xbox Bowl", "2026-12-18", "Frisco, TX"),
    ("Mayo Clinic Bowl", "2027-01-02", "Phoenix, AZ"), ("Coastal Classic", "2026-12-21", "Mobile, AL"),
]

# The 2026-27 College Football Playoff (12 teams): real dates and sites.
CFP = {
    "selection": "2026-12-06",
    "firstRound": ["2026-12-18", "2026-12-19", "2026-12-19", "2026-12-19"],
    "quarterfinals": [
        ("Fiesta Bowl", "2026-12-30", "Glendale, AZ"), ("Peach Bowl", "2027-01-01", "Atlanta, GA"),
        ("Rose Bowl", "2027-01-01", "Pasadena, CA"), ("Cotton Bowl", "2027-01-01", "Arlington, TX"),
    ],
    "semifinals": [("Orange Bowl", "2027-01-14", "Miami Gardens, FL"), ("Sugar Bowl", "2027-01-15", "New Orleans, LA")],
    "final": ("CFP National Championship", "2027-01-25", "Las Vegas, NV"),
}

KEY_DATES = {
    "watchlists": "2026-07-15",
    "week0": WEEK0.isoformat(),
    "firstCfpRanking": "2026-11-03",
    "semifinalists": "2026-11-17",
    "finalists": "2026-11-24",
    "championships": "2026-12-05",
    "armyNavy": ARMY_NAVY[2],
    "awards": "2026-12-10",
    "heisman": "2026-12-12",
    "bowlsStart": "2026-12-18",
    "seniorBowl": "2027-01-30",
}


def region_of(state: str) -> str:
    return next(r for r, states in REGIONS.items() if state in states)


def week_date(week: int) -> str:
    return (WEEK0 + dt.timedelta(days=7 * week)).isoformat()


def conference_graph(rng, teams, k, required):
    """A random k-regular set of pairings among teams that contains the required ones."""
    for _ in range(5000):
        need = {t: k for t in teams}
        edges = set()
        for a, b in required:
            edges.add(frozenset((a, b)))
            need[a] -= 1
            need[b] -= 1
        stubs = [t for t in teams for _ in range(need[t])]
        rng.shuffle(stubs)
        ok = True
        pending = []
        while stubs:
            a = stubs.pop()
            choices = [i for i, b in enumerate(stubs) if b != a and frozenset((a, b)) not in edges]
            if not choices:
                ok = False
                break
            i = rng.choice(choices)
            b = stubs.pop(i)
            edges.add(frozenset((a, b)))
            pending.append((a, b))
        if ok:
            return sorted(tuple(sorted(e)) for e in edges)
    raise RuntimeError(f"no {k}-regular schedule for {teams}")


def color_weeks(rng, edges, weeks, busy):
    """Assigns each pairing a week so no team plays twice in a week (backtracking)."""
    order = sorted(edges, key=lambda e: rng.random())
    assign = {}
    used = {t: set(busy.get(t, ())) for e in edges for t in e}

    def options(e):
        a, b = e
        return [w for w in weeks if w not in used[a] and w not in used[b]]

    nodes = [0]

    def solve(left, depth=0):
        nodes[0] += 1
        if nodes[0] > 20000:
            return False
        if not left:
            return True
        # Most constrained pairing first.
        left.sort(key=lambda e: len(options(e)))
        e = left[0]
        opts = options(e)
        rng.shuffle(opts)
        for w in opts:
            a, b = e
            used[a].add(w)
            used[b].add(w)
            assign[e] = w
            if solve(left[1:], depth + 1):
                return True
            used[a].discard(w)
            used[b].discard(w)
            del assign[e]
        return False

    if not solve(list(order)):
        return None
    return assign


def build_schedule(seed=2026):
    rng = random.Random(seed)
    team_by_id = {t[0]: t for t in TEAMS}
    conf_of = {t[0]: t[3] for t in TEAMS}
    games = []  # (away, home, week, conf game, neutral, name)
    busy = {t: {} for t in team_by_id}  # team -> week -> opponent

    def add(away, home, week, conf, neutral=None, name=None):
        assert week not in busy[away] and week not in busy[home], (away, home, week)
        busy[away][week] = home
        busy[home][week] = away
        games.append({"away": away, "home": home, "week": week, "conference": conf, "neutral": neutral, "name": name})

    fixed_conf = {}
    for away, home, week, site, name in FIXED:
        conf = conf_of[away] == conf_of[home] and conf_of[away] != "IND"
        add(away, home, week, conf, site, name)
        if conf:
            fixed_conf.setdefault(conf_of[away], []).append((away, home))
    rivalry_conf = {}
    for a, b, name in RIVALRIES:
        conf = conf_of[a] == conf_of[b] and conf_of[a] != "IND"
        if conf:
            rivalry_conf.setdefault(conf_of[a], []).append((a, b, name))
        else:
            add(a, b, 13, False, None, name)

    for conf, info in CONFERENCES.items():
        if conf == "IND":
            continue
        members = [t[0] for t in TEAMS if t[3] == conf]
        rivals = rivalry_conf.get(conf, [])
        required = [(a, b) for a, b, _ in rivals] + fixed_conf.get(conf, [])
        k = info["games"]
        for attempt in range(200):
            edges = conference_graph(rng, members, k, required)
            fixed = {frozenset(r) for r in required}
            free = [e for e in edges if frozenset(e) not in fixed]
            blocked = {t: set(busy[t]) for t in members}
            for a, b, _ in rivals:
                blocked[a].add(13)
                blocked[b].add(13)
            weeks = list(range(3, 14)) if k >= 8 else list(range(4, 14))
            assign = color_weeks(rng, free, weeks, blocked)
            if assign is not None:
                break
        else:
            raise RuntimeError(conf)
        for a, b, name in rivals:
            home = a if rng.random() < 0.5 else b
            add(b if home == a else a, home, 13, True, None, name)
        homes = {t: 0 for t in members}
        for t in members:
            homes[t] = sum(1 for g in games if g["home"] == t and g["conference"])
        for e, w in sorted(assign.items(), key=lambda x: x[1]):
            a, b = e
            home = a if (homes[a] < homes[b] or (homes[a] == homes[b] and rng.random() < 0.5)) else b
            away = b if home == a else a
            homes[home] += 1
            add(away, home, w, True)

    # Army-Navy is its own Saturday after the conference title games.
    games.append({"away": ARMY_NAVY[0], "home": ARMY_NAVY[1], "week": 15, "conference": False,
                  "neutral": ARMY_NAVY[3], "name": "Army-Navy Game"})

    # Non-conference games: fill each team to 12 (11 before Army-Navy for the academies).
    target = {t: (11 if t in ("ARMY", "NAVY") else 12) for t in team_by_id}
    strength = {t: team_by_id[t][10] for t in team_by_id}
    played = {t: set(busy[t].values()) for t in team_by_id}

    def count(t):
        return len(busy[t])

    week_order = [1, 2, 3, 0, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    for w in week_order:
        free = [t for t in team_by_id if w not in busy[t] and count(t) < target[t]]
        rng.shuffle(free)
        if w == 0:
            free = free[:16]
        free.sort(key=lambda t: count(t))
        taken = set()
        for t in free:
            if t in taken:
                continue
            left_weeks = sum(1 for x in range(w, 13) if x not in busy[t])
            need = target[t] - count(t)
            # Take a bye this week if there is room for it later.
            if w >= 4 and need < left_weeks - 1 and rng.random() < 0.55:
                continue
            cands = [o for o in free if o != t and o not in taken and o not in played[t]
                     and (conf_of[o] != conf_of[t] or conf_of[t] == "IND")]
            if not cands:
                continue
            # Mostly similar programs; power teams buy home games from Group of Five teams.
            weights = []
            for o in cands:
                gap = abs(strength[o] - strength[t])
                weights.append(1.0 / (1 + gap / 12) + (0.5 if CONFERENCES[conf_of[t]]["power"] != CONFERENCES[conf_of[o]]["power"] else 0))
            o = rng.choices(cands, weights)[0]
            taken.add(t)
            taken.add(o)
            if strength[t] > strength[o] + 8:
                home, away = t, o
            elif strength[o] > strength[t] + 8:
                home, away = o, t
            else:
                home, away = (t, o) if rng.random() < 0.5 else (o, t)
            add(away, home, w, False)
            played[t].add(o)
            played[o].add(t)

    games.sort(key=lambda g: (g["week"], g["home"]))
    out = []
    for i, g in enumerate(games):
        date = ARMY_NAVY[2] if g["week"] == 15 else week_date(g["week"])
        row = {"id": f"c{g['week']}-{i}", "week": g["week"], "date": date, "away": g["away"], "home": g["home"],
               "conference": g["conference"]}
        if g["neutral"]:
            row["site"] = g["neutral"][0]
            row["city"] = g["neutral"][1]
        if g["name"]:
            row["name"] = g["name"]
        out.append(row)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ids = [t[0] for t in TEAMS]
    assert len(ids) == len(set(ids)) == 138, len(ids)
    for a, b, _ in RIVALRIES:
        assert a in ids and b in ids, (a, b)
    teams = [{
        "id": t[0], "school": t[1], "nickname": t[2], "conference": t[3],
        "coach": t[4], "coachSince": t[5], "city": t[6], "state": t[7],
        "lat": t[8], "lon": t[9], "region": region_of(t[7]),
        "strength": t[10], "offense": t[11], "defense": t[12],
    } for t in TEAMS]
    # Draw schedules until every team has a full slate.
    for seed in range(2026, 2200):
        schedule = build_schedule(seed)
        games_per_team = {t: 0 for t in ids}
        for g in schedule:
            games_per_team[g["away"]] += 1
            games_per_team[g["home"]] += 1
        if min(games_per_team.values()) >= 12:
            break
    short = {t: n for t, n in games_per_team.items() if n < 12}
    payload = {
        "conferences": CONFERENCES, "teams": teams, "nflHQ": NFL_HQ, "bowls": BOWLS, "cfp": CFP,
        "keyDates": KEY_DATES, "regions": sorted(REGIONS),
    }
    (OUT / "teams.json").write_text(json.dumps(payload, indent=1))
    (OUT / "schedule.json").write_text(json.dumps(schedule, separators=(",", ":")))
    print(f"{len(teams)} teams, {len(schedule)} games; teams under 12 games: {short}")


if __name__ == "__main__":
    main()

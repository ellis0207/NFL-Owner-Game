"""What the nflverse draft table leaves out for the modern greats: titles and
the big awards (compiled by hand from the public record), the undrafted and
older stars still waiting on the Hall, the coaches and builders on the
ballot, and the reservations voters have voiced about a few real candidates.
"""

# Titles and awards for players the draft table covers. Keys as in legends.py.
HONORS = {
    "Anthony Munoz": "", "Art Monk": "rings=3", "Dwight Stephenson": "", "Steve McMichael": "rings=1",
    "Lawrence Taylor": "rings=2 mvp=1 dpoy=3 roy=1", "Kenny Easley": "dpoy=1", "Ronnie Lott": "rings=4",
    "Mike Singletary": "rings=1 dpoy=2", "Howie Long": "rings=1", "Rickey Jackson": "rings=1", "Russ Grimm": "rings=3",
    "Mike Munchak": "", "Marcus Allen": "rings=1 mvp=1 opoy=1 roy=1 sbmvp=1", "Andre Tippett": "", "Morten Andersen": "",
    "John Elway": "rings=2 mvp=1 sbmvp=1", "Eric Dickerson": "opoy=1 roy=1", "Jimbo Covert": "rings=1",
    "Bruce Matthews": "", "Jim Kelly": "", "Dan Marino": "mvp=1 opoy=1", "Darrell Green": "rings=2",
    "Roger Craig": "rings=3 opoy=1", "Richard Dent": "rings=1 sbmvp=1", "Bruce Smith": "dpoy=2", "Chris Doleman": "",
    "Jerry Rice": "rings=3 opoy=2 sbmvp=1", "Andre Reed": "", "Kevin Greene": "", "Charles Haley": "rings=5",
    "Rod Woodson": "rings=1 dpoy=1", "Tim Brown": "", "Sterling Sharpe": "", "Michael Irvin": "rings=3",
    "Randall McDaniel": "", "Eric Allen": "", "Thurman Thomas": "mvp=1 opoy=1", "Dermontti Dawson": "",
    "Troy Aikman": "rings=3 sbmvp=1", "Barry Sanders": "mvp=1 opoy=2 roy=1", "Derrick Thomas": "",
    "Deion Sanders": "rings=2 dpoy=1", "Steve Atwater": "rings=2", "Cortez Kennedy": "dpoy=1", "Junior Seau": "",
    "Emmitt Smith": "rings=3 mvp=1 sbmvp=1 roy=1", "LeRoy Butler": "rings=1", "Shannon Sharpe": "rings=3",
    "Brett Favre": "rings=1 mvp=3", "Aeneas Williams": "", "Willie Roaf": "", "Jerome Bettis": "rings=1 roy=1",
    "Michael Strahan": "rings=1 dpoy=1", "Will Shields": "", "John Lynch": "rings=1", "Marshall Faulk": "rings=1 mvp=1 opoy=3 roy=1",
    "Bryant Young": "rings=1", "Isaac Bruce": "rings=1", "Kevin Mawae": "", "Larry Allen": "rings=1", "Tony Boselli": "",
    "Warren Sapp": "rings=1 dpoy=1", "Ty Law": "rings=3", "Derrick Brooks": "rings=1 dpoy=1", "Curtis Martin": "roy=1",
    "Terrell Davis": "rings=2 mvp=1 opoy=2 sbmvp=1", "Jonathan Ogden": "rings=1", "Marvin Harrison": "rings=1",
    "Ray Lewis": "rings=2 dpoy=2 sbmvp=1", "Brian Dawkins": "", "Terrell Owens": "", "Zach Thomas": "", "Orlando Pace": "rings=1",
    "Walter Jones": "", "Tony Gonzalez": "", "Ronde Barber": "rings=1", "Jason Taylor": "dpoy=1", "Peyton Manning": "rings=2 mvp=5 opoy=2 sbmvp=1",
    "Charles Woodson": "rings=1 dpoy=1 roy=1", "Randy Moss": "opoy=0 roy=1", "Alan Faneca": "rings=1", "Edgerrin James": "roy=1",
    "Champ Bailey": "", "Brian Urlacher": "dpoy=1 roy=1", "LaDainian Tomlinson": "mvp=1 opoy=1", "Richard Seymour": "rings=3",
    "Steve Hutchinson": "", "Drew Brees": "rings=1 opoy=2 sbmvp=1", "Julius Peppers": "roy=1", "Dwight Freeney": "rings=1",
    "Ed Reed": "rings=1 dpoy=1", "Andre Johnson": "", "Troy Polamalu": "rings=2 dpoy=1", "Larry Fitzgerald": "",
    "Jared Allen": "", "DeMarcus Ware": "rings=1", "Devin Hester": "", "Calvin Johnson": "", "Joe Thomas": "",
    "Patrick Willis": "roy=1", "Darrelle Revis": "rings=1", "Luke Kuechly": "dpoy=1 roy=1",
    # Candidates
    "Tom Brady": "rings=7 mvp=3 opoy=1 sbmvp=5", "Philip Rivers": "roy=0", "Matt Ryan": "mvp=1 opoy=1 roy=1",
    "Ben Roethlisberger": "rings=2 roy=1", "Eli Manning": "rings=2 sbmvp=2", "Reggie Wayne": "rings=1",
    "J.J. Watt": "dpoy=3", "Terrell Suggs": "rings=1 dpoy=1 roy=1", "Adrian Peterson": "mvp=1 opoy=1 roy=1",
    "Aaron Donald": "rings=1 dpoy=3", "Jason Kelce": "rings=1", "Julio Jones": "", "Rob Gronkowski": "rings=4",
    "Frank Gore": "", "Jason Witten": "", "Marshawn Lynch": "rings=1", "Richard Sherman": "rings=1",
    "Earl Thomas": "rings=1", "Kam Chancellor": "rings=1", "Steve Smith Sr.": "opoy=1", "Torry Holt": "rings=1",
    "Hines Ward": "rings=2 sbmvp=1", "Vince Wilfork": "rings=1", "Antonio Brown": "rings=1", "Michael Vick": "",
    "Patrick Peterson": "", "Ndamukong Suh": "rings=1 dpoy=0 roy=1", "Fletcher Cox": "rings=1", "Darren Woodson": "rings=3",
    "Willie Anderson": "", "Kevin Williams": "", "Jahri Evans": "rings=1", "Marshal Yanda": "rings=1",
    "Steve Wisniewski": "", "Logan Mankins": "rings=1", "Calais Campbell": "", "Shaun Alexander": "mvp=1 opoy=1",
    "Tiki Barber": "", "Steve McNair": "mvp=1", "Rich Gannon": "mvp=1", 
    "Andrew Luck": "", "Von Miller": "rings=2 sbmvp=1", "Zack Martin": "", "Tyron Smith": "", "Joe Staley": "",
    "Brian Westbrook": "", "Lance Briggs": "", "Ricky Watters": "rings=1",
    "Boomer Esiason": "mvp=1", "Randall Cunningham": "", "Donovan McNabb": "", "Chad Johnson": "", "LeSean McCoy": "rings=2",
    "Jimmy Smith": "", "Clay Matthews": "rings=1", "Charles Tillman": "", "Bobby Wagner": "rings=1",
}

# Undrafted modern players worth a vote: name, position, Pro Bowls, first-team All-Pros, honors.
UNDRAFTED = [
    ("James Harrison", "LB", 5, 2, "rings=2 dpoy=1"), ("Wes Welker", "WR", 5, 2, ""), ("Priest Holmes", "RB", 3, 3, "opoy=1"),
    ("Rod Smith", "WR", 3, 1, "rings=2"), ("London Fletcher", "LB", 4, 0, "rings=1"), ("Jeff Saturday", "C", 6, 2, "rings=1"),
    ("Brian Waters", "OG", 6, 2, ""), ("Tony Romo", "QB", 4, 0, ""), ("Arian Foster", "RB", 4, 1, ""),
    ("Kurt Warner", "QB", 0, 0, ""), ("Antonio Gates", "TE", 0, 0, ""), ("John Randle", "IDL", 0, 0, ""),
    ("Adam Vinatieri", "K", 0, 0, ""), ("Jason Peters", "OT", 9, 2, "rings=1"), ("Cameron Wake", "EDGE", 5, 1, ""),
    ("Justin Tucker", "K", 5, 6, "rings=1"), ("Dave Duerson", "S", 4, 0, ""),
]

# Older stars the Hall still hasn't taken; their cases go to the seniors committee.
# name, position, first, last, clubs, Pro Bowls, first-team All-Pros, titles, stats, honors
SENIORS = [
    ("Ken Anderson", "QB", 1971, 1986, "CIN", 4, 1, 0, "py=32838 ptd=197 pint=160", "mvp=1 opoy=1"),
    ("L.C. Greenwood", "EDGE", 1969, 1981, "PIT", 6, 2, 4, "", ""),
    ("Jim Marshall", "EDGE", 1960, 1979, "CLE/MIN", 2, 0, 1, "", ""),
    ("Lester Hayes", "CB", 1977, 1986, "OAK/LA", 5, 1, 2, "di=39", "dpoy=1"),
    ("Chuck Foreman", "RB", 1973, 1980, "MIN/NE", 5, 1, 0, "ry=5950 rtd=53 rec=350 recy=3156 rectd=23", "roy=1"),
    ("Maxie Baughan", "LB", 1960, 1974, "PHI/LA/WAS", 9, 1, 1, "di=18", ""),
    ("Jerry Smith", "TE", 1965, 1977, "WAS", 2, 0, 0, "rec=421 recy=5496 rectd=60", ""),
    ("Bob Kuechenberg", "OG", 1970, 1983, "MIA", 6, 0, 2, "", ""),
    ("Riley Odoms", "TE", 1972, 1983, "DEN", 4, 2, 0, "rec=396 recy=5755 rectd=41", ""),
    ("Lavvie Dilweg", "WR", 1926, 1934, "MIL/GB", 0, 5, 3, "", ""),
    ("Al Wistert", "OT", 1943, 1951, "PHI", 1, 4, 2, "", ""),
]

# Coaches and builders on the ballot: name, kind, first, last, clubs or office, record, titles, what he did, eligible from.
BUILDERS = [
    ("Bill Belichick", "coach", 1991, 2023, "CLE/NE", "302-165", 6, "Won six Super Bowls as head coach and two more as a coordinator.", 2027),
    ("Robert Kraft", "contributor", 1994, 2026, "NE owner", "", 6, "Patriots owner through six Super Bowl titles and a stadium built with private money.", 2025),
    ("Mike Holmgren", "coach", 1992, 2008, "GB/SEA", "161-111", 1, "Won Super Bowl XXXI and took two clubs to the Super Bowl.", 2020),
    ("Mike Shanahan", "coach", 1988, 2013, "LA/DEN/WAS", "170-138", 2, "Won back-to-back Super Bowls with the Broncos.", 2020),
    ("Tom Coughlin", "coach", 1995, 2015, "JAX/NYG", "170-150", 2, "Built the Jaguars and beat the unbeaten Patriots in Super Bowl XLII.", 2020),
    ("Marty Schottenheimer", "coach", 1984, 2006, "CLE/KC/WAS/SD", "200-126-1", 0, "Two hundred wins without a Super Bowl appearance.", 2020),
    ("Dan Reeves (coach)", "coach", 1981, 2003, "DEN/NYG/ATL", "190-165-2", 0, "Took two clubs to four Super Bowls.", 2020),
    ("Art Modell", "contributor", 1961, 2003, "CLE/BAL owner", "", 1, "Built the league's TV money, then moved the Browns to Baltimore.", 2020),
    ("Buddy Parker", "coach", 1949, 1964, "CHC/DET/PIT", "104-75-9", 2, "Won back-to-back titles with the Lions.", 2020),
]

# Reservations voters and the papers have aired about real candidates: how much
# the off-field record weighs (character) and how much the coverage weighs
# (media), as a few voters count them. Facts on the public record only.
RESERVATIONS = {
    "Antonio Brown": (3.0, 2.0, "left the game in mid-season amid suspensions"),
    "Michael Vick": (2.5, 1.0, "served a federal prison sentence in mid-career"),
    "Adrian Peterson": (1.0, 0.5, "missed most of 2014 on the commissioner's exempt list"),
    "Ben Roethlisberger": (0.6, 0.3, "was suspended at the start of 2010"),
    "Bill Belichick": (0.8, 0.6, "voters still argue about Spygate and Deflategate"),
    "Robert Kraft": (0.6, 0.4, "the league disciplined the club over Spygate and Deflategate"),
    "Art Modell": (1.5, 1.0, "moved the Browns out of Cleveland"),
    "Darren Sharper": (8.0, 4.0, "is serving a prison sentence"),
    "Chad Johnson": (0.6, 0.8, "drew as many headlines for the act as for the catches"),
    "Josh Gordon": (2.0, 0.5, "missed seasons to league suspensions"),
}

# Hall of Fame players from the 1970s on who have died: they can't sit on the
# selection panel (the panel is drawn from living Hall of Fame players).
DECEASED = {
    "Walter Payton", "Reggie White", "Junior Seau", "Derrick Thomas", "Sam Mills", "Dick Butkus", "Johnny Unitas",
    "Deacon Jones", "Merlin Olsen", "Gale Sayers", "Bob Hayes", "Mike Webster", "Gene Upshaw", "John Mackey",
    "Ray Nitschke", "Herb Adderley", "Willie Wood", "Chris Doleman", "Don Maynard", "Len Dawson", "Franco Harris",
    "Charley Taylor", "Floyd Little", "Forrest Gregg", "Bart Starr", "Nick Buoniconti", "Willie Davis", "Jim Otto",
    "Larry Wilson", "Kevin Greene", "Ken Stabler", "Winston Hill", "Alex Karras", "Cliff Branch", "Ken Riley",
    "Steve McMichael", "Buck Buchanan", "Lee Roy Selmon", "George Blanda", "Dave Wilcox", "Rayfield Wright",
    "Gene Hickerson", "Charlie Sanders", "Fred Dean", "Bob Brown", "Jim Langer", "Mick Tingelhoff", "Willie Brown",
    "Tommy McDonald", "Jimmy Johnson (CB)", "Roosevelt Brown", "Jim Ringo", "Doug Atkins", "Sam Huff",
    "Jack Butler", "Les Richter", "Ollie Matson",
}

"""Schools outside the game's FBS list that sent players to the NFL from 2011 on: the
name the game shows and the state (or province) it is in. Spelling variants from the
source files point at the same school."""

_RAW = """
South Dakota State|SD
South Carolina State|SC
Northern Iowa|IA
Illinois State|IL
Idaho|ID
Montana|MT
Harvard|MA
Richmond|VA
Montana State|MT
Youngstown State|OH
William & Mary|VA
Tennessee State|TN
Portland State|OR
Southern Illinois|IL
Princeton|NJ
Ferris State|MI
Yale|CT
Florida A&M|FL
Villanova|PA
Central Arkansas|AR
California (PA)|PA
Valdosta State|GA
Samford|AL
South Dakota|SD
Holy Cross|MA
Chattanooga|TN=Tennessee-Chattanooga,Tenn-Chattanooga
Stony Brook|NY
West Georgia|GA
Eastern Kentucky|KY=East. Kentucky
Eastern Washington|WA=East. Washington
Shepherd|WV
Missouri Western|MO=Missouri Western State
Weber State|UT
Southern Utah|UT=Southern Utah State
Maine|ME
Southeastern Louisiana|LA=SE Louisiana
North Carolina A&T|NC
Fordham|NY
Monmouth|NJ
Elon|NC
Grambling State|LA
Wagner|NY
Stephen F. Austin|TX=Stephen F. Austin State,S.F. Austin
Alabama State|AL
Alabama A&M|AL
Southern|LA
Northwestern State|LA=Northwestern State (LA)
Tarleton State|TX
New Hampshire|NH
Saginaw Valley State|MI
West Alabama|AL
UC Davis|CA
Southeast Missouri State|MO=SE Missouri State
San Diego|CA
Abilene Christian|TX
West Texas A&M|TX=West Texas State
Newberry|SC
Washburn|KS
Regina|SK
Furman|SC
Texas Southern|TX
Penn|PA=Pennsylvania
Wofford|SC
Minnesota State|MN
Towson|MD=Towson State
Lindenwood|MO
Morgan State|MD
UT Martin|TN=Tennessee-Martin
Norfolk State|VA
Cal Poly|CA=Cal Poly (San Luis Obispo),Cal Poly-San Luis Obispo
Albany|NY
Bucknell|PA
Northern Arizona|AZ
Western Illinois|IL
Northern Colorado|CO
Western Carolina|NC
Rhode Island|RI
Brown|RI
Hampton|VA
The Citadel|SC
Southern Arkansas|AR
Grand Valley State|MI=Grand Valley
North Alabama|AL
Ashland|OH
McNeese|LA=McNeese State
Fort Valley State|GA=Fort Valley State College
Wayne State|MI=Wayne State (MI)
Azusa Pacific|CA
Howard|DC
Idaho State|ID
Jackson State|MS=Jackson State University
Eastern Illinois|IL
Murray State|KY
Northwest Missouri State|MO=NW Missouri State University,NW Missouri State
CSU Pueblo|CO=Colorado State (Pueblo),Colorado State-Pueblo
Assumption|MA
Pittsburg State|KS=Pittsburg State (KS)
Findlay|OH
North Carolina Central|NC
Incarnate Word|TX
Dartmouth|NH
Indiana State|IN
Alcorn State|MS
IUP|PA=Indiana PA,  University of,Indiana (PA)
Culver-Stockton|MO=Culver-Stockton College
West Florida|FL=University of West Florida
Lehigh|PA
Fort Hays State|KS
Cal Poly Humboldt|CA=Humboldt State
Heidelberg|OH=Heidelberg College
Midwestern State|TX
Western Oregon|OR
Tennessee Tech|TN
Columbia|NY
Nebraska-Kearney|NE=Kearney State
Cornell|NY
East Central|OK=East Central (OK)
Harding|AR
Bemidji State|MN=Bemidji State University
Catawba|NC=Catawba College
Bloomsburg|PA
Concordia-St. Paul|MN=Concordia-St.Paul (MN)
Marist|NY
Mars Hill|NC
Gardner-Webb|NC
Tusculum|TN=Tusculum College
East Texas A&M|TX=Texas A&M-Commerce
Northwestern (IA)|IA=Northwestern College (Ia)
Wesley|DE
SUNY Cortland|NY=Cortland State Of New York
Robert Morris|PA
Marian|IN
Stetson|FL
Virginia State|VA
Dubuque|IA
Sioux Falls|SD
Prairie View A&M|TX=Prairie View
Charleston (WV)|WV
Arkansas-Pine Bluff|AR=University of Arkansas at Pine Bluff,Ark-Pine Bluff
Colgate|NY
Kutztown|PA=Kutztown (PA)
Lenoir-Rhyne|NC
British Columbia|BC=University of British Columbia
Central Missouri|MO=Central Missouri State
Houston Christian|TX=Houston Christian University
North Dakota|ND
Minnesota Duluth|MN=Duluth/University of Minnesota
Campbell|NC=Campbell University
Mount Union|OH=Mount Union College
Central Connecticut|CT=Central Connecticut State,CCSU
Slippery Rock|PA
Long Beach CC|CA
Bethel (TN)|TN
Hillsdale|MI
Nebraska-Omaha|NE
Carson-Newman|TN=Carson Newman
Walsh|OH
Union (KY)|KY=Union College (KY)
Albion|MI
Presbyterian|SC
Merrimack|MA
Morehouse|GA=Morehouse College
Beloit|WI=Beloit College
Bethune-Cookman|FL=Bethune-Cookman College
Mary Hardin-Baylor|TX
Palomar|CA=Palomar College
William Penn|IA
Henderson State|AR=Henderson State University
Western Washington|WA=Western Washington University
Ouachita Baptist|AR=Ouachita Baptist University
Monmouth (IL)|IL=Monmouth College
Missouri Southern|MO
Chadron State|NE
Northeastern State|OK=NE State (OK)
Glenville State|WV
Wisconsin-Milwaukee|WI
Charleston Southern|SC=Charleston Southern University
McGill|QC
Utah Tech|UT=Dixie State
Southern Connecticut|CT=Southern Connecticut State
UC Irvine|CA
Winston-Salem State|NC=Winston Salem State University
Montreal|QC
Centre|KY=Centre College
North Greenville|SC=North Greenville College
St. Francis Xavier|NS=St. Francis Xavier University
Northwood|MI
Hobart|NY
Delaware State|DE
Lafayette|PA=Lafayette College
Delaware Valley|PA=Delaware Valley College
RPI|NY=Rensselear Polytechnic Institute
Clarion|PA=University of Clarion
Wisconsin-Whitewater|WI=Wisconsin–Whitewater
Bowie State|MD
Canisius|NY=Canisius College
Fort Scott CC|KS
Manitoba|MB
Eastern Oregon|OR=Eastern Oregon State Univ.
Calgary|AB=Calgary, Canada
Augustana (SD)|SD
Southwestern Oklahoma State|OK=Southwestern Oklahoma State University
Jacksonville|FL
Northern Michigan|MI=Northern Michigan University
Lamar|TX
Albany State|GA=Albany State (GA)
Drake|IA
VCU|VA=Virginia Commonwealth Univ.
Wisconsin-Platteville|WI
Laval|QC
Kentucky Wesleyan|KY
Western Colorado|CO=Western State
Greenville|IL
Emporia State|KS=Emporia State University
Barry|FL=Barry University
Southern Oregon|OR
Booneville JC|MS=Booneville JC (MS)
Franklin (IN)|IN=Franklin College of Indiana
Portland|OR=University of Portland
Duquesne|PA
Southeastern (FL)|FL=Southeastern University
Frostburg State|MD
Limestone|SC
LSU Shreveport|LA=LSU (Shreveport)
Concordia (MN)|MN=Concordia College
Malone|OH=Malone University (Ohio)
LIU Post|NY=C.W. Post Center
Florida Tech|FL
Bryant|RI
Austin Peay|TN
Dayton|OH
Saint John's (MN)|MN
McKendree|IL
Western Ontario|ON
Simon Fraser|BC
Berry|GA=Berry College
Alberta|AB=Alberta (Canada)
Missouri S&T|MO=Missouri-Rolla
St. Thomas (MN)|MN=University of St. Thomas
Loyola|IL=Loyola University
Fayetteville State|NC=Fayetteville State University
Nicholls|LA=Nicholls State
Sacred Heart|CT=Sacred Heart University
UNC Pembroke|NC
Minot State|ND=Minot State University
Peru State|NE=Peru State College (Ne)
York (Canada)|ON
Charleston|SC
Framingham State|MA=Framingham State College
Friends|KS=Friends U.
Mercer|GA=Mercer University, Atlanta
Wingate|NC
Lane|TN=Lane College
South Florida State|FL=South Florida Community College
Baldwin Wallace|OH=Baldwin Wallace College
East Tennessee State|TN
Lock Haven|PA=University of Lock Haven
Barton|NC=Barton College
Dickinson|PA=Dickinson College
Iowa Western CC|IA
Queen's (Canada)|ON=Queens University (Canada)
Delta State|MS=Delta State University
John Carroll|OH=John Carroll University
"""

SMALL: dict = {}
for line in _RAW.strip().splitlines():
    name, rest = line.split("|")
    state, _, alts = rest.partition("=")
    SMALL[name] = (state, name)
    for a in filter(None, alts.split(",")):
        SMALL[a.strip()] = (state, name)
# "Indiana PA,  University of" splits on its comma above; put it back.
SMALL["Indiana PA,  University of"] = ("PA", "IUP")
SMALL["Calgary, Canada"] = ("AB", "Calgary")
SMALL["Mercer University, Atlanta"] = ("GA", "Mercer")
SMALL["Unknown"] = ("??", "Unlisted school")

# Rough center of each state or province (lat, lon): small schools are placed there for travel.
CENTER = {
    "AL": (32.8, -86.8), "AR": (34.9, -92.4), "AZ": (34.3, -111.7), "CA": (37.2, -119.5), "CO": (39.0, -105.5), "CT": (41.6, -72.7),
    "DC": (38.9, -77.0), "DE": (39.0, -75.5), "FL": (28.6, -82.4), "GA": (32.7, -83.4), "IA": (42.0, -93.5), "ID": (44.4, -114.6),
    "IL": (40.0, -89.2), "IN": (39.9, -86.3), "KS": (38.5, -98.4), "KY": (37.5, -85.3), "LA": (31.1, -92.0), "MA": (42.3, -71.8),
    "MD": (39.0, -76.8), "ME": (45.4, -69.2), "MI": (43.3, -84.5), "MN": (46.3, -94.3), "MO": (38.4, -92.5), "MS": (32.7, -89.7),
    "MT": (47.0, -109.6), "NC": (35.6, -79.4), "ND": (47.5, -100.5), "NE": (41.5, -99.8), "NH": (43.7, -71.6), "NJ": (40.2, -74.7),
    "NM": (34.4, -106.1), "NV": (39.3, -116.6), "NY": (42.9, -75.5), "OH": (40.3, -82.8), "OK": (35.6, -97.5), "OR": (43.9, -120.6),
    "PA": (40.9, -77.8), "RI": (41.7, -71.5), "SC": (33.9, -80.9), "SD": (44.4, -100.2), "TN": (35.9, -86.4), "TX": (31.5, -99.3),
    "UT": (39.3, -111.7), "VA": (37.5, -78.9), "VT": (44.1, -72.7), "WA": (47.4, -120.5), "WI": (44.6, -89.9), "WV": (38.6, -80.6),
    "WY": (43.0, -107.6), "AB": (53.9, -116.6), "BC": (49.3, -123.1), "MB": (49.9, -97.1), "NS": (45.6, -61.9), "ON": (43.7, -79.4),
    "QC": (45.5, -73.6), "SK": (50.4, -104.6), "??": (39.8, -98.6),
}

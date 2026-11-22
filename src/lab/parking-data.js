// Reviewed 2026-11-10. Named facilities are sourced; individual capacities usually
// remain estimates. Direction and field heading are schematic approximations.
// "managed" means venue/event-campus supply, NOT franchise ownership or a legal
// right to rebuild. "shared" supply requires agreements and must not automatically
// generate franchise revenue. Additional acreage, rebuild acres and average prices
// are conservative GAME SCENARIOS, not cadastral surveys, zoning or verified bids.
// Source descriptions and notes distinguish known totals from estimated allocations.
export const parkingProfiles = {
  "DAL": {
    "context": "Large suburban entertainment district",
    "source": "https://attstadium.com/stadium-info/parking/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 60,
    "rebuildAcres": 24,
    "price": 65,
    "heading": 70,
    "facilities": [
      {
        "id": "dal-1",
        "name": "AT&T Lot 1",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 900,
        "quality": "estimated"
      },
      {
        "id": "dal-2",
        "name": "AT&T Lot 2",
        "control": "managed",
        "type": "surface",
        "dir": "NW",
        "spaces": 900,
        "quality": "estimated"
      },
      {
        "id": "dal-3",
        "name": "AT&T Lot 3",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 900,
        "quality": "estimated"
      },
      {
        "id": "dal-4",
        "name": "AT&T Lot 4",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 500,
        "quality": "estimated"
      },
      {
        "id": "dal-5",
        "name": "AT&T Lot 5",
        "control": "managed",
        "type": "surface",
        "dir": "SE",
        "spaces": 600,
        "quality": "estimated"
      },
      {
        "id": "dal-6",
        "name": "AT&T Lot 6",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 1200,
        "quality": "estimated"
      },
      {
        "id": "dal-7",
        "name": "AT&T Lot 7",
        "control": "managed",
        "type": "surface",
        "dir": "NW",
        "spaces": 600,
        "quality": "estimated"
      },
      {
        "id": "dal-8",
        "name": "AT&T Lot 8",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 200,
        "quality": "estimated"
      },
      {
        "id": "dal-9",
        "name": "AT&T Lot 9",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 200,
        "quality": "estimated"
      },
      {
        "id": "dal-10",
        "name": "AT&T Lot 10",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 1500,
        "quality": "estimated"
      },
      {
        "id": "dal-11",
        "name": "AT&T Lot 11",
        "control": "managed",
        "type": "surface",
        "dir": "NW",
        "spaces": 1000,
        "quality": "estimated"
      },
      {
        "id": "dal-12",
        "name": "AT&T Lot 12",
        "control": "managed",
        "type": "surface",
        "dir": "SE",
        "spaces": 800,
        "quality": "estimated"
      },
      {
        "id": "dal-13",
        "name": "AT&T Lot 13",
        "control": "managed",
        "type": "surface",
        "dir": "SE",
        "spaces": 800,
        "quality": "estimated"
      },
      {
        "id": "dal-14",
        "name": "AT&T Lot 14",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 1000,
        "quality": "estimated"
      },
      {
        "id": "dal-15",
        "name": "AT&T Lot 15",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 900,
        "quality": "estimated"
      },
      {
        "id": "dal-16",
        "name": "Rangers lettered lots (shared pool)",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 12000,
        "quality": "reported"
      }
    ],
    "notes": "Official total is approximately 12,000 spaces across 15 AT&T lots, plus nearly 12,000 Rangers spaces. Individual lot counts are allocated estimates; special-use areas are included. Rangers availability depends on other events. The 60-acre acquisition envelope is a game scenario, not identified vacant parcels.",
    "constraints": [
      "Randol Mill Road and Collins Street must remain open",
      "Rangers facilities and Texas Live are occupied land",
      "Expansion requires acquisition, traffic review and drainage works"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "reportedTotal": {
      "managed": 12000,
      "shared": 12000,
      "label": "Approximate published totals"
    }
  },
  "MIN": {
    "context": "Dense downtown blocks and light rail",
    "source": "https://www.usbankstadium.com/guest-experience/transportation/directions",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 0,
    "rebuildAcres": 0,
    "price": 40,
    "heading": 65,
    "facilities": [
      {
        "id": "min-1",
        "name": "Factory Motor Parts Parking Garage",
        "control": "shared",
        "type": "garage",
        "dir": "NW",
        "spaces": 1600,
        "quality": "estimated"
      },
      {
        "id": "min-2",
        "name": "Other downtown ramps / lots toward Hennepin (shared pool)",
        "control": "shared",
        "type": "garage",
        "dir": "W",
        "spaces": 18400,
        "quality": "estimated"
      }
    ],
    "notes": "The stadium explicitly states it does not directly manage public parking. More than 20,000 nearby spaces are advertised within a 20-minute walk; 20,000 is the conservative shared pool, split here by estimate. No stadium-controlled surface expansion is assumed.",
    "constraints": [
      "Existing urban buildings and street grid",
      "Light-rail corridor and pedestrian plazas",
      "Third-party ramps require commercial agreements; no automatic stadium revenue"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "reportedTotal": {
      "shared": 20000,
      "label": "Conservative floor; official guide says over 20,000"
    }
  },
  "GB": {
    "context": "Neighborhood stadium and Titletown district",
    "source": "https://www.packers.com/lambeau-field/parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 12,
    "rebuildAcres": 16,
    "price": 45,
    "heading": 0,
    "facilities": [
      {
        "id": "gb-1",
        "name": "Lambeau north lots",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 1200,
        "quality": "estimated"
      },
      {
        "id": "gb-2",
        "name": "Lambeau Lot 4 / east lots",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "gb-3",
        "name": "Lambeau south lots",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 1500,
        "quality": "estimated"
      },
      {
        "id": "gb-4",
        "name": "Lambeau west lots",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 1000,
        "quality": "estimated"
      },
      {
        "id": "gb-5",
        "name": "Neighborhood private lots / lawns",
        "control": "shared",
        "type": "surface",
        "dir": "NE",
        "spaces": 4500,
        "quality": "estimated"
      }
    ],
    "notes": "Packers-operated lots and private neighborhood parking are distinct. Capacities and cardinal group boundaries are estimates; the official map controls individual lot access. Titletown park and occupied homes are excluded from expansion.",
    "constraints": [
      "Residential streets and occupied homes",
      "Titletown recreation and development",
      "Lombardi Avenue and Ridge Road access"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "CHI": {
    "context": "Museum Campus between downtown and Lake Michigan",
    "source": "https://www.soldierfield.com/plan-your-visit/directions",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 0,
    "rebuildAcres": 0,
    "price": 55,
    "heading": 0,
    "facilities": [
      {
        "id": "chi-1",
        "name": "North Garage",
        "control": "managed",
        "type": "garage",
        "dir": "N",
        "spaces": 2500,
        "quality": "reported"
      },
      {
        "id": "chi-2",
        "name": "Waldron Deck",
        "control": "managed",
        "type": "garage",
        "dir": "S",
        "spaces": 1500,
        "quality": "reported"
      },
      {
        "id": "chi-3",
        "name": "South Parking Lot",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 1500,
        "quality": "estimated"
      },
      {
        "id": "chi-4",
        "name": "Adler Planetarium / Museum Campus lots",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 700,
        "quality": "estimated"
      }
    ],
    "notes": "North Garage and Waldron capacities are reported by the official parking operator; South Lot and shared supply are estimates. Managed means event-campus operation (SP+), not Bears ownership. Protected public parkland receives no modeled expansion or conversion entitlement.",
    "constraints": [
      "Lake Michigan and Burnham Harbor",
      "Museum Campus parkland",
      "DuSable Lake Shore Drive and pedestrian access"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "extraSource": "https://www.soldierfieldparking.com/field-museum"
  },
  "DET": {
    "context": "Dense downtown entertainment district",
    "source": "https://www.fordfield.com/plan-your-visit/parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 1,
    "rebuildAcres": 0.5,
    "price": 45,
    "heading": 80,
    "facilities": [
      {
        "id": "det-1",
        "name": "Ford Field Parking Deck",
        "control": "managed",
        "type": "garage",
        "dir": "E",
        "spaces": 1200,
        "quality": "estimated"
      },
      {
        "id": "det-2",
        "name": "Lot 4",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 200,
        "quality": "estimated"
      },
      {
        "id": "det-3",
        "name": "Lot 5 / Lot 6",
        "control": "managed",
        "type": "surface",
        "dir": "NE",
        "spaces": 500,
        "quality": "estimated"
      },
      {
        "id": "det-4",
        "name": "Comerica / Fox / downtown shared garages",
        "control": "shared",
        "type": "garage",
        "dir": "W",
        "spaces": 5000,
        "quality": "estimated"
      }
    ],
    "notes": "Named facilities follow the venue parking guide and map. All capacity allocations are estimates. Nearby Detroit garages serve many businesses and events; they are not included as stadium-controlled land.",
    "constraints": [
      "I-375 corridor and downtown street grid",
      "Comerica Park and occupied blocks",
      "Very limited acquisition envelope"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "IND": {
    "context": "Convention center and downtown edge",
    "source": "https://www.colts.com/game-day/parking-transportation",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 3,
    "rebuildAcres": 0,
    "price": 35,
    "heading": 0,
    "facilities": [
      {
        "id": "ind-1",
        "name": "Lucas Oil Stadium South Lot",
        "control": "shared",
        "type": "surface",
        "dir": "S",
        "spaces": 1500,
        "quality": "estimated"
      },
      {
        "id": "ind-2",
        "name": "Denison surrounding lots (excluding South Lot)",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "ind-3",
        "name": "Downtown convention-area garages",
        "control": "shared",
        "type": "garage",
        "dir": "N",
        "spaces": 5000,
        "quality": "estimated"
      }
    ],
    "notes": "The Colts state they do not operate surrounding lots. Inventory is therefore third-party/venue-authority supply, without automatic team control. South Lot and district totals are estimates. New construction assumes a separate acquisition.",
    "constraints": [
      "Rail tracks and South Street",
      "Convention Center and downtown buildings",
      "Existing parking contracts do not convey redevelopment rights"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "CLE": {
    "context": "Lakefront with civic buildings and rail",
    "source": "https://huntingtonbankfield.com/wp-content/uploads/2025/07/25_STADIUM_AREA-PARKING-MAP.pdf",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 2,
    "rebuildAcres": 1.5,
    "price": 45,
    "heading": 90,
    "facilities": [
      {
        "id": "cle-1",
        "name": "West 3rd Orange Lot",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 700,
        "quality": "estimated"
      },
      {
        "id": "cle-2",
        "name": "Purple / Tan passholder lots",
        "control": "managed",
        "type": "surface",
        "dir": "NE",
        "spaces": 400,
        "quality": "estimated"
      },
      {
        "id": "cle-3",
        "name": "Great Lakes Science Center Red Garage",
        "control": "shared",
        "type": "garage",
        "dir": "E",
        "spaces": 500,
        "quality": "estimated"
      },
      {
        "id": "cle-4",
        "name": "Municipal Lot and downtown shared supply",
        "control": "shared",
        "type": "surface",
        "dir": "SE",
        "spaces": 4500,
        "quality": "estimated"
      }
    ],
    "notes": "Passholder and shared facilities follow the stadium map. All counts are estimates. Lakefront projects and public ownership complicate redevelopment; this model gives only a small acquisition envelope.",
    "constraints": [
      "Lake Erie blocks northern expansion",
      "Rail and freeway corridors to the south",
      "Science Center, Rock Hall and civic land"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "PIT": {
    "context": "North Shore riverfront sports district",
    "source": "https://acrisurestadium.com/stadium/parking-directions/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 3,
    "rebuildAcres": 0,
    "price": 45,
    "heading": 0,
    "facilities": [
      {
        "id": "pit-1",
        "name": "Gold 1A / 1B lots",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 700,
        "quality": "estimated"
      },
      {
        "id": "pit-2",
        "name": "Gold 2 / 4 and Red 5 surface lots",
        "control": "shared",
        "type": "surface",
        "dir": "NE",
        "spaces": 1000,
        "quality": "estimated"
      },
      {
        "id": "pit-3",
        "name": "Champions / North Shore garages",
        "control": "shared",
        "type": "garage",
        "dir": "NE",
        "spaces": 1500,
        "quality": "estimated"
      },
      {
        "id": "pit-4",
        "name": "Other North Shore / downtown supply",
        "control": "shared",
        "type": "garage",
        "dir": "E",
        "spaces": 4000,
        "quality": "estimated"
      }
    ],
    "notes": "The Stadium Authority owns key surface lots and Alco operates event parking. These are treated conservatively as shared, not Steelers-owned. All space counts are estimates and groups exclude each other.",
    "constraints": [
      "Ohio River to the south",
      "PNC Park and developed North Shore blocks",
      "Highway and rail rights of way"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "extraSource": "https://www.pgh-sea.com/index.php?path=fac-north-shore-lots"
  },
  "CIN": {
    "context": "Compact Ohio River waterfront",
    "source": "https://www.bengals.com/stadium/parking-and-directions",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 2,
    "rebuildAcres": 2,
    "price": 40,
    "heading": 0,
    "facilities": [
      {
        "id": "cin-1",
        "name": "Lot A",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 500,
        "quality": "estimated"
      },
      {
        "id": "cin-2",
        "name": "Lots B / D / E / 1U",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "cin-3",
        "name": "Central Riverfront Garage",
        "control": "shared",
        "type": "garage",
        "dir": "E",
        "spaces": 3500,
        "quality": "estimated"
      },
      {
        "id": "cin-4",
        "name": "Longworth Hall / Hilltop private lots",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 1400,
        "quality": "estimated"
      }
    ],
    "notes": "Surface lot group capacities and riverfront garage allocation are estimates. Central Riverfront serves the wider Banks district. No building over the river, interstate or public riverfront park is permitted by this simulation.",
    "constraints": [
      "Ohio River and floodplain",
      "I-71 / I-75 approaches",
      "The Banks and riverfront parks"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "BAL": {
    "context": "Camden Yards district near downtown",
    "source": "https://www.baltimoreravens.com/stadium/directions-parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 6,
    "rebuildAcres": 8,
    "price": 45,
    "heading": 0,
    "facilities": [
      {
        "id": "bal-1",
        "name": "Camden Yards Lots A / B / C",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "bal-2",
        "name": "Stadium Lots D / H / J",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 1000,
        "quality": "estimated"
      },
      {
        "id": "bal-3",
        "name": "Stadium Lots N / O / R",
        "control": "managed",
        "type": "surface",
        "dir": "SW",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "bal-4",
        "name": "Horseshoe Casino / downtown garages",
        "control": "shared",
        "type": "garage",
        "dir": "S",
        "spaces": 4000,
        "quality": "estimated"
      }
    ],
    "notes": "Stadium lots are operated through the Maryland Stadium Authority / SP+ ecosystem. Managed describes event inventory, not franchise fee-simple ownership. Counts are estimates and all redevelopment remains a scenario.",
    "constraints": [
      "Camden Yards baseball operations",
      "Rail / light rail and I-395",
      "Developed Pigtown and Federal Hill blocks"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "ARI": {
    "context": "Suburban Sportsman’s Park / Westgate campus",
    "source": "https://www.statefarmstadium.com/directions-parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 40,
    "rebuildAcres": 25,
    "price": 40,
    "heading": 0,
    "facilities": [
      {
        "id": "ari-1",
        "name": "West / West Preferred lots",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "ari-2",
        "name": "North Preferred lot",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "ari-3",
        "name": "East / East Preferred / Lot F",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "ari-4",
        "name": "Black Lot",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "ari-5",
        "name": "Yellow / Blue district lots",
        "control": "shared",
        "type": "surface",
        "dir": "NE",
        "spaces": 6185,
        "quality": "estimated"
      }
    ],
    "notes": "The stadium publishes 20,685 parking spaces across its wider parking context. This model allocates that total into named groups by estimate; it is not a measured lot inventory. Westgate and adjacent development are excluded from free land.",
    "constraints": [
      "Loop 101 blocks western connections",
      "Westgate and resort development",
      "Field tray / Great Lawn must remain clear"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "extraSource": "https://www.statefarmstadium.com/about"
  },
  "ATL": {
    "context": "Dense downtown convention district",
    "source": "https://parking.mercedesbenzstadium.com/lot-info/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 1,
    "rebuildAcres": 0,
    "price": 45,
    "heading": 90,
    "facilities": [
      {
        "id": "atl-1",
        "name": "Home Depot Backyard",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 600,
        "quality": "estimated"
      },
      {
        "id": "atl-2",
        "name": "Silver Deck",
        "control": "shared",
        "type": "garage",
        "dir": "NE",
        "spaces": 1700,
        "quality": "estimated"
      },
      {
        "id": "atl-3",
        "name": "Red Deck",
        "control": "shared",
        "type": "garage",
        "dir": "N",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "atl-4",
        "name": "Orange Deck",
        "control": "shared",
        "type": "garage",
        "dir": "W",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "atl-5",
        "name": "Blue / Yellow / South shared lots",
        "control": "shared",
        "type": "surface",
        "dir": "NW",
        "spaces": 3000,
        "quality": "estimated"
      }
    ],
    "notes": "Official parking partners are not necessarily stadium-owned. The guide specifically disclaims stadium ownership/operation of Silver Deck. Counts are estimates. The Backyard is programmed public space and receives no modeled garage conversion allowance.",
    "constraints": [
      "GWCC and arena campus",
      "Rail and downtown street grid",
      "Home Depot Backyard public programming"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "CAR": {
    "context": "Uptown Charlotte edge",
    "source": "https://www.panthers.com/schedule/traffic-parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 2,
    "rebuildAcres": 1,
    "price": 40,
    "heading": 0,
    "facilities": [
      {
        "id": "car-1",
        "name": "Stadium Lots 1 / 2",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 750,
        "quality": "estimated"
      },
      {
        "id": "car-2",
        "name": "Uptown parking garages (shared pool)",
        "control": "shared",
        "type": "garage",
        "dir": "NE",
        "spaces": 24250,
        "quality": "estimated"
      },
      {
        "id": "car-3",
        "name": "Other Uptown surface lots (shared pool)",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 5000,
        "quality": "estimated"
      }
    ],
    "notes": "The team reports more than 30,000 spaces within 10–15 minutes. This model uses 30,000 total, with estimated allocations among assigned stadium lots and third-party supply. Renovation staging may temporarily remove spaces.",
    "constraints": [
      "I-277 and rail edges",
      "Uptown office / residential blocks",
      "Renovation staging and pedestrian plazas"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "JAX": {
    "context": "Sports complex under 2026 construction",
    "source": "https://www.jaguars.com/stadium/parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 10,
    "rebuildAcres": 6,
    "price": 40,
    "heading": 0,
    "facilities": [
      {
        "id": "jax-1",
        "name": "Lots A / D / E / J",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 1700,
        "quality": "estimated"
      },
      {
        "id": "jax-2",
        "name": "Lots M / N / P / V",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "jax-3",
        "name": "Lots S / X / Z",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 1700,
        "quality": "estimated"
      },
      {
        "id": "jax-4",
        "name": "Old Cypress Lot",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 600,
        "quality": "estimated"
      },
      {
        "id": "jax-5",
        "name": "Met Park",
        "control": "shared",
        "type": "surface",
        "dir": "S",
        "spaces": 1000,
        "quality": "estimated"
      },
      {
        "id": "jax-6",
        "name": "Tailgaters / private district lots",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 1500,
        "quality": "estimated"
      }
    ],
    "notes": "Uses the 2026 Jaguars lot list. Counts are estimated reduced operating inventory during construction, not pre-renovation capacity. Old Cypress and Met Park are modeled as shared. New lot capacity is hypothetical and cannot occupy active work zones.",
    "constraints": [
      "Active stadium construction compound",
      "St. Johns River and Met Park",
      "Baseball / arena events and neighborhood roads"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "TB": {
    "context": "Broad sports campus west of city center",
    "source": "https://raymondjamesstadium.com/az-guide",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 25,
    "rebuildAcres": 20,
    "price": 40,
    "heading": 0,
    "facilities": [
      {
        "id": "tb-1",
        "name": "Stadium Lots 1 / 2 / 3 / 4",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 4000,
        "quality": "estimated"
      },
      {
        "id": "tb-2",
        "name": "Stadium Lots 5 / 6 / 7",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "tb-3",
        "name": "Stadium Lot 8 / south lots",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 3500,
        "quality": "estimated"
      },
      {
        "id": "tb-4",
        "name": "HCC / Steinbrenner / other off-site supply",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 15000,
        "quality": "reported"
      }
    ],
    "notes": "Official guide reports approximately 10,000 on-site and 15,000 off-site spots. On-site named-group splits are estimates. Shared land is not an automatically developable asset.",
    "constraints": [
      "Dale Mabry Highway and Himes Avenue",
      "HCC and Steinbrenner Field uses",
      "Al Lopez Park protected from modeled paving"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "reportedTotal": {
      "managed": 10000,
      "shared": 15000,
      "label": "Approximate published totals"
    }
  },
  "MIA": {
    "context": "Multisport suburban campus",
    "source": "https://www.hardrockstadium.com/parking/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 20,
    "rebuildAcres": 20,
    "price": 55,
    "heading": 0,
    "facilities": [
      {
        "id": "mia-1",
        "name": "Orange inner lots",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "mia-2",
        "name": "Black / Blue / Maroon inner lots",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 3500,
        "quality": "estimated"
      },
      {
        "id": "mia-3",
        "name": "Yellow outer lots 14 / 15 / 16 / 18 / 40",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 6500,
        "quality": "estimated"
      },
      {
        "id": "mia-4",
        "name": "Remote shuttle / private supply",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 3000,
        "quality": "estimated"
      }
    ],
    "notes": "Named color groups follow the venue guide; all counts and group positioning are estimates. F1 and tennis infrastructure reduce usable open land. Remote parking is represented as shared supply, not adjacent paving.",
    "constraints": [
      "Florida Turnpike corridor",
      "Tennis facilities and F1 infrastructure",
      "Residential neighborhoods and canal drainage"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "TEN": {
    "context": "Riverfront campus constrained by replacement construction",
    "source": "https://nissanstadium.com/transportation/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 0,
    "rebuildAcres": 0,
    "price": 45,
    "heading": 0,
    "facilities": [
      {
        "id": "ten-1",
        "name": "Lot T and remaining river-side permits",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 1200,
        "quality": "estimated"
      },
      {
        "id": "ten-2",
        "name": "Lot M and remaining south permits",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 1000,
        "quality": "estimated"
      },
      {
        "id": "ten-3",
        "name": "Downtown / East Bank shared supply",
        "control": "shared",
        "type": "garage",
        "dir": "SW",
        "spaces": 7000,
        "quality": "estimated"
      }
    ],
    "notes": "Current 2026 Nissan configuration: construction has consumed former campus parking. All counts are provisional estimates; the future 2027 stadium is not included. Expansion and conversion are locked while the replacement project occupies the site.",
    "constraints": [
      "New stadium construction east of current bowl",
      "Cumberland River to the west",
      "Bridge approaches and East Bank redevelopment"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "NO": {
    "context": "Downtown dome and arena complex",
    "source": "https://www.caesarssuperdome.com/plan-your-visit/a-to-z-guide",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 0.5,
    "rebuildAcres": 0,
    "price": 40,
    "heading": 0,
    "facilities": [
      {
        "id": "no-1",
        "name": "Superdome Garages 1 / 1A / 2 / 2A",
        "control": "managed",
        "type": "garage",
        "dir": "N",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "no-2",
        "name": "Superdome Garages 5 / 6",
        "control": "managed",
        "type": "garage",
        "dir": "S",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "no-3",
        "name": "Champions Garage",
        "control": "managed",
        "type": "garage",
        "dir": "E",
        "spaces": 2900,
        "quality": "estimated"
      },
      {
        "id": "no-4",
        "name": "Surface Lots 3 / 4 and ADA areas",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 500,
        "quality": "estimated"
      },
      {
        "id": "no-5",
        "name": "Downtown private garages",
        "control": "shared",
        "type": "garage",
        "dir": "NE",
        "spaces": 5000,
        "quality": "estimated"
      }
    ],
    "notes": "The official guide reports approximately 7,000 spaces in seven garages and two surface lots across the shared complex. Named group allocations here are estimates. Managed means complex operations, not Saints ownership. Surface areas maintain access and are not available for modeled conversion.",
    "constraints": [
      "I-10 and elevated ramps",
      "Smoothie King Center / Champions Square",
      "Dense downtown buildings"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "extraSource": "https://www.neworleanssaints.com/stadium/parking"
  },
  "HOU": {
    "context": "Large shared Reliant Park event campus",
    "source": "https://www.houstontexans.com/stadium/parking-tailgating/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 30,
    "rebuildAcres": 35,
    "price": 45,
    "heading": 0,
    "facilities": [
      {
        "id": "hou-1",
        "name": "Blue Lot",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 5500,
        "quality": "estimated"
      },
      {
        "id": "hou-2",
        "name": "Red Lot",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 4000,
        "quality": "estimated"
      },
      {
        "id": "hou-3",
        "name": "Yellow Lot",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 4500,
        "quality": "estimated"
      },
      {
        "id": "hou-4",
        "name": "Orange / Maroon / Purple lots",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "hou-5",
        "name": "Green / Platinum / other campus lots",
        "control": "managed",
        "type": "surface",
        "dir": "NW",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "hou-6",
        "name": "Nearby private supply",
        "control": "shared",
        "type": "surface",
        "dir": "NE",
        "spaces": 2000,
        "quality": "estimated"
      }
    ],
    "notes": "Color-coded park lots serve the stadium, convention center, arena and rodeo. Counts are estimated allocations, not exclusive Texans inventory. Expansion cannot occupy the Astrodome or other park buildings.",
    "constraints": [
      "Astrodome / Center / Arena footprints",
      "Loop 610, Kirby and Fannin boundaries",
      "Shared event schedule and drainage requirements"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "KC": {
    "context": "Extensive Truman Sports Complex",
    "source": "https://www.arrowheadstadiumkc.com/plan-your-visit/parking-tailgating/maps-directions",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 50,
    "rebuildAcres": 35,
    "price": 55,
    "heading": 90,
    "facilities": [
      {
        "id": "kc-1",
        "name": "Lots A / B / C",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 4500,
        "quality": "estimated"
      },
      {
        "id": "kc-2",
        "name": "Lots D / F / G",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 5500,
        "quality": "estimated"
      },
      {
        "id": "kc-3",
        "name": "Lots H / J",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 4000,
        "quality": "estimated"
      },
      {
        "id": "kc-4",
        "name": "Kauffman-side shared complex lots",
        "control": "shared",
        "type": "surface",
        "dir": "N",
        "spaces": 5000,
        "quality": "estimated"
      }
    ],
    "notes": "Approximate 19,000-space sports-complex scenario with estimated allocations. Complex land and parking serve both Chiefs and Royals. No Kauffman footprint is assumed available for redevelopment.",
    "constraints": [
      "Kauffman Stadium and baseball schedule",
      "I-70 / I-435 interchange",
      "Terrain and drainage at campus perimeter"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "NE": {
    "context": "Large suburban campus divided by Route 1",
    "source": "https://www.gillettestadium.com/transportation/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 35,
    "rebuildAcres": 24,
    "price": 25,
    "heading": 0,
    "facilities": [
      {
        "id": "ne-1",
        "name": "Stadium-side north lots",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "ne-2",
        "name": "Stadium-side south lots",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 4500,
        "quality": "estimated"
      },
      {
        "id": "ne-3",
        "name": "General lots across Route 1",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 6000,
        "quality": "estimated"
      },
      {
        "id": "ne-4",
        "name": "Delayed-exit Lots 45 / 55B",
        "control": "managed",
        "type": "surface",
        "dir": "NW",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "ne-5",
        "name": "Foxboro Terminals / private supply",
        "control": "shared",
        "type": "surface",
        "dir": "N",
        "spaces": 1500,
        "quality": "estimated"
      }
    ],
    "notes": "All capacity allocations are estimates. General parking across Route 1 is free; delayed-exit lots can pay drivers. The model’s price is only an editable blended scenario, not the published general-parking tariff. Patriot Place retail capacity is excluded.",
    "constraints": [
      "Route 1 crossing and egress bottlenecks",
      "Patriot Place businesses",
      "Wetlands / wooded land require site review"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "BUF": {
    "context": "New 2026 Orchard Park campus",
    "source": "https://www.buffalobills.com/stadium/parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 20,
    "rebuildAcres": 15,
    "price": 70,
    "heading": 45,
    "facilities": [
      {
        "id": "buf-1",
        "name": "Bronze / Platinum lots",
        "control": "managed",
        "type": "surface",
        "dir": "NW",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "buf-2",
        "name": "Gold / Gray lots",
        "control": "managed",
        "type": "surface",
        "dir": "SW",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "buf-3",
        "name": "Orange / White lots including White ADA",
        "control": "managed",
        "type": "surface",
        "dir": "NE",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "buf-4",
        "name": "Blue / Green lots including Blue ADA",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "buf-5",
        "name": "Former ECC South Campus",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "buf-6",
        "name": "Neighborhood private lots",
        "control": "shared",
        "type": "surface",
        "dir": "S",
        "spaces": 3500,
        "quality": "estimated"
      }
    ],
    "notes": "Uses new 2026 color names instead of obsolete numbered lots. Counts are estimates. Former stadium redevelopment and demolition land are not treated as instantly available spaces; the separate expansion envelope is hypothetical.",
    "constraints": [
      "Former stadium demolition / redevelopment",
      "Abbott Road and Southwestern Boulevard",
      "Residential parcels and traffic bottlenecks"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "NYG": {
    "context": "Meadowlands sports and retail campus",
    "source": "https://www.metlifestadium.com/plan-your-visit/parking-tailgating/nfl-parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 15,
    "rebuildAcres": 35,
    "price": 50,
    "heading": 0,
    "facilities": [
      {
        "id": "nyg-1",
        "name": "Lots A / B / C / D / E",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 5500,
        "quality": "estimated"
      },
      {
        "id": "nyg-2",
        "name": "Lots F / G",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 3500,
        "quality": "estimated"
      },
      {
        "id": "nyg-3",
        "name": "Lots J / K / L",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 8000,
        "quality": "estimated"
      },
      {
        "id": "nyg-4",
        "name": "Other lettered complex lots",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 6000,
        "quality": "estimated"
      },
      {
        "id": "nyg-5",
        "name": "American Dream / other partner supply",
        "control": "shared",
        "type": "garage",
        "dir": "E",
        "spaces": 4000,
        "quality": "estimated"
      }
    ],
    "notes": "Capacity allocations are estimates. Giants and Jets use one physical inventory. Wetlands and the developed retail / racing campus constrain acquisition despite the large parking footprint.",
    "constraints": [
      "Meadowlands wetlands",
      "NJ Turnpike and Route 3",
      "American Dream / racetrack / rail station"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "WAS": {
    "context": "Suburban Landover stadium ring",
    "source": "https://www.commanders.com/stadium/stadium-guide",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 25,
    "rebuildAcres": 30,
    "price": 55,
    "heading": 0,
    "facilities": [
      {
        "id": "was-1",
        "name": "A / B lettered parking sectors",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "was-2",
        "name": "D / E lettered parking sectors",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "was-3",
        "name": "F / G lettered parking sectors",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 5000,
        "quality": "estimated"
      },
      {
        "id": "was-4",
        "name": "RedZone and western lots",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 4000,
        "quality": "estimated"
      },
      {
        "id": "was-5",
        "name": "Gray / private nearby supply",
        "control": "shared",
        "type": "surface",
        "dir": "NW",
        "spaces": 3000,
        "quality": "estimated"
      }
    ],
    "notes": "All counts are estimates for the current Landover venue. Future RFK plans do not change this baseline. Color and letter permit subdivisions are grouped; event maps determine access.",
    "constraints": [
      "Occupied residential neighborhoods",
      "Sports & Learning Complex",
      "Ring Road and steep / wooded edges"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "PHI": {
    "context": "Shared South Philadelphia sports complex",
    "source": "https://www.lincolnfinancialfield.com/parking/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 12,
    "rebuildAcres": 14,
    "price": 50,
    "heading": 0,
    "facilities": [
      {
        "id": "phi-1",
        "name": "Lincoln Financial Field south / east lots",
        "control": "managed",
        "type": "surface",
        "dir": "SE",
        "spaces": 4500,
        "quality": "estimated"
      },
      {
        "id": "phi-2",
        "name": "K / J stadium-side lots",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "phi-3",
        "name": "Arena / ballpark shared lettered lots",
        "control": "shared",
        "type": "surface",
        "dir": "NW",
        "spaces": 11000,
        "quality": "estimated"
      },
      {
        "id": "phi-4",
        "name": "Jetro / other private lots",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 2000,
        "quality": "estimated"
      }
    ],
    "notes": "All capacities are estimated allocations across a shared sports district. The wider lot system is not exclusive Eagles property. Concurrent events can remove substantial shared supply.",
    "constraints": [
      "I-95 and Broad Street",
      "Arena and Citizens Bank Park",
      "FDR Park and Navy Yard uses"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "DEN": {
    "context": "Urban stadium campus near river and highways",
    "source": "https://www.empowerfieldatmilehigh.com/plan-your-visit/fan-guide-a-z",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 6,
    "rebuildAcres": 8,
    "price": 50,
    "heading": 0,
    "facilities": [
      {
        "id": "den-1",
        "name": "Lots A / B / C",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "den-2",
        "name": "Lots D / E / F / G",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "den-3",
        "name": "Lots H / J / L / other campus lots",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "den-4",
        "name": "Independent nearby parking pool",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 15000,
        "quality": "reported"
      }
    ],
    "notes": "The 6,500 on-site scenario is allocated by estimate among named groups. Official guide describes close to 15,000 off-site spaces. Nearby independent supply is not stadium-controlled redevelopment land.",
    "constraints": [
      "I-25 and South Platte River",
      "Federal Boulevard and residential blocks",
      "Light rail / Colfax approaches"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "LV": {
    "context": "Constrained industrial district west of the Strip",
    "source": "https://www.allegiantstadium.com/directions-parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 5,
    "rebuildAcres": 4,
    "price": 75,
    "heading": 0,
    "facilities": [
      {
        "id": "lv-1",
        "name": "On-site Lots A / B / C / D",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 1300,
        "quality": "estimated"
      },
      {
        "id": "lv-2",
        "name": "On-site Lots E / F / G / H / J",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 1400,
        "quality": "estimated"
      },
      {
        "id": "lv-3",
        "name": "Off-site Lots S / V / W / X / Dewey",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 3300,
        "quality": "estimated"
      },
      {
        "id": "lv-4",
        "name": "Strip hotel / partner garages",
        "control": "shared",
        "type": "garage",
        "dir": "E",
        "spaces": 7000,
        "quality": "estimated"
      }
    ],
    "notes": "Named on-site and off-site groups follow the official parking guidance. Counts are estimates, with approximately 6,000 total spaces in the modeled tailgating-related groups. Treat off-site rights conservatively as shared until leases are modeled.",
    "constraints": [
      "I-15 barrier to the east",
      "Industrial businesses on adjoining parcels",
      "Pedestrian Hacienda Bridge approach"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "LAR": {
    "context": "Hollywood Park mixed-use campus",
    "source": "https://www.sofistadium.com/parking-and-transportation",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 15,
    "rebuildAcres": 20,
    "price": 65,
    "heading": 0,
    "facilities": [
      {
        "id": "lar-1",
        "name": "Green Zone — Lots A / B",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "lar-2",
        "name": "Brown Zone — Lots C / D",
        "control": "managed",
        "type": "surface",
        "dir": "NE",
        "spaces": 1500,
        "quality": "estimated"
      },
      {
        "id": "lar-3",
        "name": "Orange Zone — Lots E / F / G",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "lar-4",
        "name": "Pink Zone — Lots H / I / P / Q",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 3500,
        "quality": "estimated"
      },
      {
        "id": "lar-5",
        "name": "Blue / Purple / other campus zones",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "lar-6",
        "name": "Off-site Inglewood partner supply",
        "control": "shared",
        "type": "garage",
        "dir": "NW",
        "spaces": 5000,
        "quality": "estimated"
      }
    ],
    "notes": "All space allocations are estimates. Lot H can appear in more than one zone listing; it is counted only once here. Hollywood Park development, lake and public plazas are excluded from free expansion. Rams and Chargers share this inventory.",
    "constraints": [
      "Hollywood Park residential / retail development",
      "Lake and pedestrian parks",
      "Prairie Avenue and Century Boulevard"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "SF": {
    "context": "Mixed stadium, theme park and office district",
    "source": "https://levisstadium.com/getting-here/parking-faqs/",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 5,
    "rebuildAcres": 5,
    "price": 60,
    "heading": 0,
    "facilities": [
      {
        "id": "sf-1",
        "name": "Red Lot 1 / Red VIP",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 1800,
        "quality": "estimated"
      },
      {
        "id": "sf-2",
        "name": "Green Lot 1",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 4500,
        "quality": "estimated"
      },
      {
        "id": "sf-3",
        "name": "Blue Lot 1 and other Blue lots",
        "control": "shared",
        "type": "surface",
        "dir": "NE",
        "spaces": 4500,
        "quality": "estimated"
      },
      {
        "id": "sf-4",
        "name": "Yellow and remaining partner lots",
        "control": "shared",
        "type": "surface",
        "dir": "E",
        "spaces": 4000,
        "quality": "estimated"
      }
    ],
    "notes": "The 49ers operate parking at selected facilities, but underlying land includes shared office / theme-park uses. Treat most inventory conservatively as contracted/shared; counts are estimates. No automatic development on Great America or creek corridors.",
    "constraints": [
      "Great America theme park",
      "San Tomas Aquino Creek",
      "Office campuses, rail and convention uses"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "SEA": {
    "context": "Dense rail and stadium district",
    "source": "https://www.lumenfield.com/plan-your-visit/parking-transportation",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 0.5,
    "rebuildAcres": 1,
    "price": 55,
    "heading": 0,
    "facilities": [
      {
        "id": "sea-1",
        "name": "Lumen Field North Lot",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 600,
        "quality": "estimated"
      },
      {
        "id": "sea-2",
        "name": "Lumen Field Parking Garage",
        "control": "managed",
        "type": "garage",
        "dir": "S",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "sea-3",
        "name": "Union Station / nearby shared garages",
        "control": "shared",
        "type": "garage",
        "dir": "NE",
        "spaces": 3000,
        "quality": "estimated"
      },
      {
        "id": "sea-4",
        "name": "Other SoDo private lots",
        "control": "shared",
        "type": "surface",
        "dir": "W",
        "spaces": 2000,
        "quality": "estimated"
      }
    ],
    "notes": "The venue confirms two on-site parking facilities. Counts are estimates. Nearby garages and SoDo surface lots are separate supply; rail corridors and the event center are excluded from buildable land.",
    "constraints": [
      "King Street / Union Station rail corridors",
      "Event Center and T-Mobile Park",
      "Pioneer Square and occupied SoDo blocks"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption"
  },
  "NYJ": {
    "context": "Meadowlands sports and retail campus",
    "source": "https://www.metlifestadium.com/plan-your-visit/parking-tailgating/nfl-parking",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 15,
    "rebuildAcres": 35,
    "price": 50,
    "heading": 0,
    "facilities": [
      {
        "id": "nyg-1",
        "name": "Lots A / B / C / D / E",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 5500,
        "quality": "estimated"
      },
      {
        "id": "nyg-2",
        "name": "Lots F / G",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 3500,
        "quality": "estimated"
      },
      {
        "id": "nyg-3",
        "name": "Lots J / K / L",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 8000,
        "quality": "estimated"
      },
      {
        "id": "nyg-4",
        "name": "Other lettered complex lots",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 6000,
        "quality": "estimated"
      },
      {
        "id": "nyg-5",
        "name": "American Dream / other partner supply",
        "control": "shared",
        "type": "garage",
        "dir": "E",
        "spaces": 4000,
        "quality": "estimated"
      }
    ],
    "notes": "Capacity allocations are estimates. Giants and Jets use one physical inventory. Wetlands and the developed retail / racing campus constrain acquisition despite the large parking footprint.",
    "constraints": [
      "Meadowlands wetlands",
      "NJ Turnpike and Route 3",
      "American Dream / racetrack / rail station"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "sharedVenueWith": "NYG"
  },
  "LAC": {
    "context": "Hollywood Park mixed-use campus",
    "source": "https://www.sofistadium.com/parking-and-transportation",
    "sourceLabel": "Official venue / team parking guide",
    "acreage": 15,
    "rebuildAcres": 20,
    "price": 65,
    "heading": 0,
    "facilities": [
      {
        "id": "lar-1",
        "name": "Green Zone — Lots A / B",
        "control": "managed",
        "type": "surface",
        "dir": "N",
        "spaces": 2000,
        "quality": "estimated"
      },
      {
        "id": "lar-2",
        "name": "Brown Zone — Lots C / D",
        "control": "managed",
        "type": "surface",
        "dir": "NE",
        "spaces": 1500,
        "quality": "estimated"
      },
      {
        "id": "lar-3",
        "name": "Orange Zone — Lots E / F / G",
        "control": "managed",
        "type": "surface",
        "dir": "E",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "lar-4",
        "name": "Pink Zone — Lots H / I / P / Q",
        "control": "managed",
        "type": "surface",
        "dir": "S",
        "spaces": 3500,
        "quality": "estimated"
      },
      {
        "id": "lar-5",
        "name": "Blue / Purple / other campus zones",
        "control": "managed",
        "type": "surface",
        "dir": "W",
        "spaces": 2500,
        "quality": "estimated"
      },
      {
        "id": "lar-6",
        "name": "Off-site Inglewood partner supply",
        "control": "shared",
        "type": "garage",
        "dir": "NW",
        "spaces": 5000,
        "quality": "estimated"
      }
    ],
    "notes": "All space allocations are estimates. Lot H can appear in more than one zone listing; it is counted only once here. Hollywood Park development, lake and public plazas are excluded from free expansion. Rams and Chargers share this inventory.",
    "constraints": [
      "Hollywood Park residential / retail development",
      "Lake and pedestrian parks",
      "Prairie Avenue and Century Boulevard"
    ],
    "asOf": "2026-11-10",
    "geometryQuality": "directional estimate",
    "landQuality": "simulation assumption",
    "priceQuality": "simulation assumption",
    "sharedVenueWith": "LAR"
  }
};

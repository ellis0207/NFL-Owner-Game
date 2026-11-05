"""Every team's 2026 position coaches, from pipeline/raw/position-coaches-2026.txt.

The raw file was gathered from the team websites' coaching staff pages and the
teams' staff announcements (November 2026). The first name in each room is the
lead coach and the rest are assistants in that room. A room with no name is
left empty here; the game fills it with a generated coach.

PLAYED_FOR lists the NFL teams a coach played for, for the ones who had a
playing career we could confirm. Later steps use it to give retiring players a
small chance of joining their old team's staff.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline" / "raw" / "position-coaches-2026.txt"
OUT = ROOT / "data" / "league-2026" / "position-coaches.json"
ROOMS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "STA"]

# Franchises by today's team id (the Oilers count as Tennessee, the Raiders, Chargers and Rams by their current homes).
PLAYED_FOR = {
    "Mark Brunell": ["GB", "JAX", "WAS", "NYJ", "NO"], "Tashard Choice": ["DAL", "BUF"], "Hank Fraley": ["PHI", "CLE"],
    "Shaun Dion Hamilton": ["WAS", "DET"], "Deshea Townsend": ["PIT", "IND"], "Antwaan Randle El": ["PIT", "WAS"],
    "Jim Dray": ["ARI", "CLE", "SF"], "Kyle DeVan": ["IND"], "Al Harris": ["PHI", "GB", "MIA", "LA"],
    "Matt Giordano": ["IND", "GB", "LV", "LA"], "Matt Schaub": ["ATL", "HOU", "LV", "BAL"], "Keary Colbert": ["CAR"],
    "Bernie Parmalee": ["MIA", "NYJ"], "Rob Moore": ["NYJ", "ARI"], "Renaldo Hill": ["ARI", "MIA", "DEN"],
    "DeAngelo Hall": ["ATL", "LV", "WAS"], "Daren Bates": ["LA", "TEN", "LV"], "Duce Staley": ["PHI", "PIT"],
    "Jacques Cesaire": ["LAC"], "Keith Tandy": ["TB"], "Cory Harkey": ["LA"], "Daniel Bullocks": ["DET"],
    "Chad Morton": ["NO", "NYJ", "WAS", "NYG"], "Edgar Bennett": ["GB", "CHI"], "Nick Hardwick": ["LAC"],
    "Sean Spence": ["PIT", "TEN"], "Josh McCown": ["ARI", "DET", "LV", "CAR", "CHI", "TB", "CLE", "NYJ", "PHI", "HOU"],
    "Keenan McCardell": ["CLE", "JAX", "TB", "LAC", "WAS"], "Gerald Alexander": ["DET", "JAX", "CAR", "MIA"],
    "Scott Tolzien": ["SF", "GB", "IND"], "Josh Hill": ["NO"], "Kyle Wilber": ["DAL", "LV"], "Chad Hall": ["PHI"],
    "Shawn Jefferson": ["LAC", "NE", "ATL", "DET"], "Alfredo Roberts": ["KC", "DAL"], "Steve Heiden": ["LAC", "CLE"],
    "Karl Dunbar": ["NO", "ARI"], "Aaron Moorehead": ["IND"], "Chris Kuper": ["DEN"], "Domata Peko": ["CIN", "DEN", "BAL", "ARI"],
    "Jahri Evans": ["NO", "GB"], "Jason Simmons": ["PIT", "HOU"], "Darian Thompson": ["NYG", "DAL"],
    "Josh Bynes": ["BAL", "DET", "ARI", "CIN"], "Zach Orr": ["BAL"], "Anthony Lynn": ["DEN", "SF"],
    "Bobby Engram": ["CHI", "SEA", "KC"], "Darnell Stapleton": ["PIT"], "Darryl Tapp": ["SEA", "PHI", "WAS", "DET"],
    "Ken Norton Jr.": ["DAL", "SF"], "William Gay": ["PIT", "ARI", "NYG"], "Tiquan Underwood": ["JAX", "NE", "TB", "CAR"],
    "Frank Okam": ["HOU"], "James Ferentz": ["DEN", "NE"], "Ronald Curry": ["LV"], "Troy Walters": ["MIN", "IND", "ARI"],
    "James Casey": ["HOU", "PHI", "DEN"], "Alex Van Pelt": ["BUF", "PIT"], "Barrett Ruud": ["TB", "TEN", "SEA", "NO"],
    "John Timu": ["CHI"], "Ricky Manning": ["CAR", "CHI"], "Chase Blackburn": ["NYG", "CAR"], "Reggie Wayne": ["IND"],
    "Cato June": ["IND", "TB"], "Chris Watt": ["LAC"], "Brian Allen": ["LA"], "Robert Woods": ["BUF", "LA", "TEN", "HOU"],
    "Ryan Wendell": ["NE"], "DeMarco Murray": ["DAL", "PHI", "TEN"], "Ladell Betts": ["WAS", "NO"],
    "DeShawn Shead": ["SEA", "DET"], "K.J. Wright": ["SEA", "LV"], "Jerry Gray": ["LA", "HOU", "TB"],
    "Larry Foote": ["PIT", "DET", "ARI"], "Rashad Johnson": ["ARI", "TEN"], "Justin Peelle": ["NO", "LAC", "MIA", "ATL", "SF"],
    "Mike Caldwell": ["CLE", "ARI", "PHI", "CHI"], "Luke Stocker": ["TB", "TEN", "ATL"], "Greg Lewis": ["PHI", "MIN"],
    "Marquand Manuel": ["SEA", "CIN", "GB", "CAR", "DEN"], "Tanzel Smart": ["LA"], "Randy Jordan": ["LV", "JAX"],
    "Rick Dennison": ["DEN"], "Andy Heck": ["SEA", "CHI", "WAS"],
}


def main() -> None:
    teams: dict[str, dict[str, list[str]]] = {}
    for line in RAW.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        team, rest = line.split(" ", 1)
        rooms: dict[str, list[str]] = {}
        for part in rest.split(";"):
            key, _, names = part.strip().partition("=")
            rooms[key] = [n.strip() for n in names.split(",") if n.strip() and n.strip() != "-"]
        assert set(rooms) == set(ROOMS), team
        teams[team] = rooms
    assert len(teams) == 32
    OUT.write_text(json.dumps({"teams": teams, "playedFor": PLAYED_FOR}, indent=1) + "\n")
    print(f"{sum(len(v) for r in teams.values() for v in r.values())} coaches -> {OUT}")


if __name__ == "__main__":
    main()

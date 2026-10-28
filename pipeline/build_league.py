"""Builds the 2026 starting league from open nflverse data.

    python pipeline/build_league.py            # uses cached downloads
    python pipeline/build_league.py --refresh  # re-downloads everything

Writes JSON to data/league-2026/ and a validation report next to it.
"""

import argparse
import collections
import json
from pathlib import Path

from constants import RULES_2026, SEASON, TEAMS
from ratings import rate_players
from rosters import build_camp_rosters, build_players
from free_agents import build_free_agents, waiver_order
from schedule import build_schedule, home_stadiums
from team_cap_2026 import team_cap
from sources import HISTORY_SEASONS, load_all
from stats import pass_rush_rates, season_snaps, season_stats
from traits import build_traits
from staff_2026 import DEFENSE_SCHEMES, OFFENSE_SCHEMES, TEAM_SCHEMES, build_staff

OUT = Path(__file__).resolve().parent.parent / "data" / f"league-{SEASON}"


def _no_nan(value):
    if isinstance(value, float) and value != value:
        return None
    if isinstance(value, dict):
        return {k: _no_nan(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_no_nan(v) for v in value]
    return value


def write(name: str, payload) -> None:
    path = OUT / name
    # allow_nan=False makes any NaN that slips past _no_nan fail loudly: it is not valid JSON.
    path.write_text(json.dumps(_no_nan(payload), separators=(",", ":"), ensure_ascii=False, allow_nan=False))
    print(f"  wrote {path.relative_to(OUT.parent.parent)} ({path.stat().st_size / 1024:.0f} KB)")


def top51_cap(players: list) -> int:
    """Offseason cap accounting: only a team's 51 largest cap hits count."""
    hits = sorted((p["contract"]["seasons"][0]["capHit"] for p in players), reverse=True)
    return sum(hits[:51])


def main(refresh: bool) -> None:
    print("Loading sources")
    data = load_all(refresh)

    print("Building league")
    stats = season_stats(data["stats"])
    snaps = season_snaps(data["snaps"])
    camp = build_camp_rosters(data["weekly_rosters"])
    players, coverage = build_players(camp, data["contracts"], data["players"], pass_rush_rates(data["stats"]))
    for p in players:
        p["stats"] = stats.get(p["id"], [])
        p["snaps"] = (snaps.get(p["ids"]["pfr"]) or {}) if p["ids"]["pfr"] else {}
    ratings = rate_players(players, stats, snaps)
    traits = build_traits(players, ratings, data["stats"], data["combine"])

    # The free agent pool. Its players are rated alongside the camp rosters so
    # the scales match, without moving any rostered player's numbers. Nobody
    # signed them: that is a market verdict, so their contract standing is low.
    free_agents = build_free_agents(data["weekly_rosters"], camp, data["players"], stats, snaps,
                                    pass_rush_rates(data["stats"]))
    for p in free_agents:
        p["stats"] = stats.get(p["id"], [])
        p["snaps"] = (snaps.get(p["ids"]["pfr"]) or {}) if p["ids"]["pfr"] else {}
    combined = rate_players(players + free_agents, stats, snaps, unsigned={p["id"] for p in free_agents})
    fa_ratings = {p["id"]: combined[p["id"]] for p in free_agents}
    combined_traits = build_traits(players + free_agents, {**ratings, **fa_ratings}, data["stats"], data["combine"])
    for p in free_agents:
        ratings[p["id"]] = fa_ratings[p["id"]]
        traits[p["id"]] = combined_traits[p["id"]]
    stadiums = home_stadiums(data["games"])
    schedule = build_schedule(data["games"], stadiums)

    teams = [
        {"id": abbr, "city": city, "name": name, "conference": conf, "division": div, **stadiums[abbr],
         "cap2026": {k: v for k, v in team_cap(abbr).items() if k != "realActiveSpending"}}
        for abbr, city, name, conf, div in TEAMS
    ]

    OUT.mkdir(parents=True, exist_ok=True)
    write("teams.json", teams)
    write("players.json", players + free_agents)
    # Kept in its own file so UI code never reads true ratings by accident.
    write("hidden-ratings.json", {
        pid: {**{k: v for k, v in r.items() if k != "signals"}, "traits": traits[pid]} for pid, r in ratings.items()
    })
    write("schedule.json", schedule)
    staff, staff_hidden = build_staff(SEASON)
    write("staff.json", {"people": staff, "teamSchemes": TEAM_SCHEMES,
                         "schemeNames": {"offense": OFFENSE_SCHEMES, "defense": DEFENSE_SCHEMES}})
    write("hidden-staff.json", staff_hidden)
    write("rules.json", {**RULES_2026, "waiverOrder": waiver_order(data["games"])})
    write("meta.json", {
        "season": SEASON, "startPhase": "preseason",
        "sources": {
            "rosters": "nflverse weekly_rosters 2026, Regular Season Week 1 snapshot (includes final-cutdown releases)",
            "contracts": "nflverse contracts (OverTheCap)",
            "stats": f"nflverse player stats, regular season {HISTORY_SEASONS[0]}-{HISTORY_SEASONS[-1]}",
            "snaps": f"nflverse snap counts {HISTORY_SEASONS[0]}-{HISTORY_SEASONS[-1]}",
            "schedule": "nflverse schedules 2026 (regular season); preseason and playoff dates from the league's published schedule",
        },
    })

    report = validate(camp, players, ratings, schedule, coverage) + free_agent_report(free_agents, ratings)
    (OUT / "VALIDATION.md").write_text(report)
    print(f"  wrote data/league-{SEASON}/VALIDATION.md")


def validate(camp, players, ratings, schedule, coverage) -> str:
    lines = [f"# {SEASON} league build: validation report", ""]
    problems = []

    # Rosters vs the real Week 1 outcome. The real cutdown result is used here
    # only, never written into the game data.
    real = camp.groupby(["team", "status"]).size().unstack(fill_value=0)
    by_team = collections.defaultdict(list)
    for p in players:
        by_team[p["team"]].append(p)
    lines += [
        "## Camp rosters", "",
        f"{len(players)} players on 32 camp rosters. Real Week 1 outcome shown for comparison "
        "(53 = active + inactive; PS = practice squad; RES = reserve lists; CUT = released at cutdown).", "",
        "Cap columns: our top-51 total from player contracts, OverTheCap's real active spending "
        "(Oct 2026, after cuts), dead money, and the resulting preseason cap room against each "
        "team's adjusted cap.", "",
        "| Team | Camp | Real 53 | PS | RES | CUT | Top-51 cap | OTC active | Dead | Cap room |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for abbr, *_ in TEAMS:
        r = real.loc[abbr]
        roster = by_team[abbr]
        committed = top51_cap(roster)
        tc = team_cap(abbr)
        room = tc["adjustedCap"] - tc["deadMoney"] - committed
        fifty_three = int(r.get("ACT", 0) + r.get("INA", 0))
        lines.append(
            f"| {abbr} | {len(roster)} | {fifty_three} | {int(r.get('DEV', 0))} | {int(r.get('RES', 0))} | "
            f"{int(r.get('CUT', 0))} | ${committed / 1e6:.1f}M | ${tc['realActiveSpending'] / 1e6:.1f}M | "
            f"${tc['deadMoney'] / 1e6:.1f}M | ${room / 1e6:.1f}M |"
        )
        if room < -15_000_000:
            problems.append(f"{abbr} starts ${-room / 1e6:.1f}M over the cap")
        if not 85 <= len(roster) <= 100:
            problems.append(f"{abbr} camp roster has {len(roster)} players")
    sizes = [len(v) for v in by_team.values()]
    over = sum(1 for s in sizes if s > 91)
    lines += ["", f"Camp sizes range {min(sizes)}-{max(sizes)}; {over} teams are above 91 "
              "(90 plus one International Pathway exemption). Players signed after cutdown "
              "appear on their new team's camp roster, which explains most of the excess.", ""]

    lines += ["## Contracts", "",
              f"- Matched to OverTheCap by player id: {coverage['id-match']}",
              f"- Matched by name: {coverage['name-match']}",
              f"- No 2026 deal found, given an estimated league-minimum deal: {coverage['estimated-minimum']}",
              f"- Cap hits estimated from APY (deal runs through 2026 but OverTheCap kept no 2026 line): "
              f"{sum(1 for p in players if p['contract']['source'] == 'estimated-from-apy')}",
              "- Team dead money and adjusted caps come from an OverTheCap snapshot (pipeline/team_cap_2026.py).", ""]

    # Schedule checks.
    reg = [g for g in schedule if g["type"] == "REG"]
    pre = [g for g in schedule if g["type"] == "PRE"]
    lines += ["## Schedule", "", f"- Preseason games: {len(pre)} (including the Hall of Fame Game)",
              f"- Regular-season games: {len(reg)}",
              f"- Postseason slots: {sum(1 for g in schedule if g['type'] == 'POST')}",
              f"- Neutral-site regular-season games: {sum(1 for g in reg if g['neutral'])}", ""]
    if len(reg) != 272:
        problems.append(f"expected 272 regular-season games, found {len(reg)}")
    for abbr, *_ in TEAMS:
        n_reg = sum(1 for g in reg if abbr in (g["away"], g["home"]))
        home = sum(1 for g in reg if g["home"] == abbr)  # includes "home" games abroad
        n_pre = sum(1 for g in pre if abbr in (g["away"], g["home"]))
        expected_pre = 4 if abbr in ("CAR", "ARI") else 3
        if n_reg != 17:
            problems.append(f"{abbr} has {n_reg} regular-season games")
        if home not in (8, 9):
            problems.append(f"{abbr} is the home team {home} times")
        if n_pre != expected_pre:
            problems.append(f"{abbr} has {n_pre} preseason games, expected {expected_pre}")
    days = collections.Counter((g["date"], t) for g in pre + reg for t in (g["away"], g["home"]))
    problems += [f"{t} plays twice on {d}" for (d, t), n in days.items() if n > 1]
    weekdays = collections.Counter(g["weekday"] for g in reg)
    lines += ["Regular-season games by day: " + ", ".join(f"{d} {n}" for d, n in weekdays.most_common()), ""]

    # Rating sanity: the best rated players at a few positions.
    lines += ["## Hidden ratings (first pass)", "",
              "Highest rated at each position, for a gut check. Owners never see these numbers.", ""]
    for pos in ("QB", "RB", "WR", "TE", "OT", "EDGE", "IDL", "LB", "CB", "S", "K"):
        group = sorted((p for p in players if p["position"] == pos), key=lambda p: -ratings[p["id"]]["overall"])
        top = ", ".join(f"{p['name']} ({p['team']}) {ratings[p['id']]['overall']}" for p in group[:6])
        lines.append(f"- **{pos}** ({len(group)}): {top}")
    lines.append("")

    lines += ["## Problems", ""] + ([f"- {p}" for p in problems] or ["None found."])
    return "\n".join(lines) + "\n"


def free_agent_report(free_agents, ratings) -> str:
    lines = ["", "## Free agent pool", "",
             f"{len(free_agents)} unsigned players when camps open: players who signed after Week 1 without being "
             "in a camp at cutdown, plus 2025 players on no 2026 roster who haven't announced their retirement "
             "(pipeline/free_agents.py).", ""]
    by_pos = collections.Counter(p["position"] for p in free_agents)
    lines.append("By position: " + ", ".join(f"{k} {v}" for k, v in sorted(by_pos.items())))
    best = sorted(free_agents, key=lambda p: -ratings[p["id"]]["overall"])[:15]
    lines += ["", "Highest rated: " + ", ".join(f"{p['name']} ({p['position']}, {p['lastTeam']}) {ratings[p['id']]['overall']}" for p in best), ""]
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    main(parser.parse_args().refresh)

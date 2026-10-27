"""Rebuilds the 2026 preseason camp rosters and attaches contracts."""

import math
import re

import pandas as pd

from constants import DEPTH_TO_GAME_POSITION, FALLBACK_POSITION, NICKNAME_TO_ABBR, RULES_2026, SEASON

# Statuses on the Week 1 snapshot. CUT = released at final cutdown, so they
# were in camp. RET = retired before the season; they never reached camp.
# Draft clubs use a few legacy codes; map them to current team ids.
DRAFT_CLUB_FIX = {"AZ": "ARI", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU", "SD": "LAC",
                  "OAK": "LV", "STL": "LA", "LAR": "LA", "JAC": "JAX", "WSH": "WAS"}

CAMP_STATUSES = {"ACT", "RES", "INA", "DEV", "CUT", "EXE"}


def _clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def _int(value):
    value = _clean(value)
    return None if value is None else int(value)


def build_camp_rosters(weekly: pd.DataFrame) -> pd.DataFrame:
    """The Week 1 snapshot lists every player a team had at final cutdown,
    including the ones it released. That is our 90-man camp roster."""
    week1 = weekly[(weekly.season == SEASON) & (weekly.week == 1) & (weekly.game_type == "REG")]
    camp = week1[week1.status.isin(CAMP_STATUSES)].copy()
    # A handful of new signings have no gsis id yet; fall back to the ESB id.
    missing = camp.gsis_id.isna()
    camp.loc[missing, "gsis_id"] = "esb-" + camp.loc[missing, "esb_id"].astype(str)
    return camp.drop_duplicates("gsis_id")


def _norm_name(name: str) -> str:
    name = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", str(name).lower())
    return re.sub(r"[^a-z]", "", name)


def _contract_for_2026(contracts: pd.DataFrame) -> dict:
    """One contract per player: the most recently signed deal, with the 2026+
    seasons from the player's OverTheCap cap history. When OverTheCap kept no
    2026 season but the latest deal runs through 2026, cap hits are estimated
    from its APY. Returns lookups by gsis id and by normalized name."""
    by_id, by_name, dup_names, seen = {}, {}, set(), set()
    ordered = contracts.sort_values("year_signed", ascending=False)
    for row in ordered.itertuples(index=False):
        key_id = _clean(row.gsis_id)
        key_name = _norm_name(row.player)
        seen_key = key_id or ("name", key_name, _int(row.draft_overall))
        if seen_key in seen:
            continue  # only the player's most recent contract counts
        seen.add(seen_key)
        history = row.season_history if row.season_history is not None else []
        years = [y for y in history if str(y.get("year") or "").isdigit() and int(y["year"]) >= SEASON]
        seasons = [_season(y) for y in sorted(years, key=lambda y: int(y["year"]))]
        source = "overthecap"
        if not any(s["year"] == SEASON for s in seasons):
            last_year = (_int(row.year_signed) or 0) + (_int(row.years) or 1) - 1
            apy = _money(row.apy)
            if last_year < SEASON or not apy:
                continue
            source = "estimated-from-apy"
            seasons = [_flat_season(year, apy) for year in range(SEASON, last_year + 1)]
        contract_type = None
        if row.contract_history is not None and len(row.contract_history):
            latest = max(row.contract_history, key=lambda c: c.get("year_signed") or 0)
            contract_type = latest.get("contract_type")
        contract = {
            "source": source,
            "signedYear": _int(row.year_signed),
            "years": _int(row.years),
            "totalValue": _money(row.value),
            "apy": _money(row.apy),
            "guaranteed": _money(row.guaranteed),
            "apyCapPct": _clean(row.apy_cap_pct),
            "type": contract_type,
            "otcTeam": NICKNAME_TO_ABBR.get(str(row.team).split("/")[-1]),
            "seasons": seasons,
        }
        if key_id:
            by_id[key_id] = contract
        if key_name in by_name:
            dup_names.add(key_name)
        by_name.setdefault(key_name, contract)
    for name in dup_names:  # two players share the name: too risky to match
        del by_name[name]
    return {"by_id": by_id, "by_name": by_name}


def _flat_season(year: int, salary: int) -> dict:
    return {
        "year": year, "team": None, "baseSalary": salary, "proratedBonus": 0, "rosterBonus": 0,
        "optionBonus": 0, "workoutBonus": 0, "otherBonus": 0, "guaranteedSalary": 0, "capHit": salary,
    }


def _money(millions):
    millions = _clean(millions)
    return None if millions is None else int(round(float(millions) * 1_000_000))


def _season(y: dict) -> dict:
    return {
        "year": int(y["year"]),
        "team": NICKNAME_TO_ABBR.get(y.get("team")),
        "baseSalary": _money(y.get("base_salary")) or 0,
        "proratedBonus": _money(y.get("prorated_bonus")) or 0,
        "rosterBonus": (_money(y.get("roster_bonus")) or 0) + (_money(y.get("per_game_roster_bonus")) or 0),
        "optionBonus": _money(y.get("option_bonus")) or 0,
        "workoutBonus": _money(y.get("workout_bonus")) or 0,
        "otherBonus": _money(y.get("other_bonus")) or 0,
        "guaranteedSalary": _money(y.get("guaranteed_salary")) or 0,
        "capHit": _money(y.get("cap_number")) or 0,
    }


def minimum_salary(years_exp: int, table=RULES_2026["minimumSalary"]) -> int:
    for floor in ("7", "4", "3", "2", "1", "0"):
        if years_exp >= int(floor):
            return table[floor]
    return table["0"]


def _estimated_minimum_contract(years_exp: int, rookie: bool) -> dict:
    """Players OverTheCap has no 2026 deal for (mostly undrafted rookies and
    camp bodies) get a league-minimum deal: three years for rookies, one for vets."""
    tables = [RULES_2026["minimumSalary"], RULES_2026["minimumSalaryNextYear"]]
    length = 3 if rookie else 1
    seasons = []
    for i in range(length):
        table = tables[min(i, 1)]
        salary = minimum_salary(years_exp + i, table)
        if i >= 2:  # beyond the published table, grow by the CBA's yearly step
            salary += 45_000 * (i - 1)
        seasons.append(_flat_season(SEASON + i, salary))
    return {
        "source": "estimated-minimum", "signedYear": SEASON, "years": length,
        "totalValue": sum(s["baseSalary"] for s in seasons), "apy": seasons[0]["baseSalary"],
        "guaranteed": 0, "apyCapPct": None, "type": "Minimum (estimated)", "otcTeam": None,
        "seasons": seasons,
    }


def game_position(row, pass_rush_rate: float | None) -> str:
    pos = DEPTH_TO_GAME_POSITION.get(_clean(row.depth_chart_position)) or FALLBACK_POSITION.get(row.position, row.position)
    if pos == "OLB":
        if pass_rush_rate is not None:
            return "EDGE" if pass_rush_rate >= 0.45 else "LB"
        weight = _clean(row.weight) or 240
        return "EDGE" if weight >= 245 else "LB"
    return pos


def build_players(camp: pd.DataFrame, contracts: pd.DataFrame, master: pd.DataFrame, pass_rush: dict) -> tuple[list, dict]:
    lookup = _contract_for_2026(contracts)
    master = master.drop_duplicates("gsis_id").set_index("gsis_id")
    players, coverage = [], {"id-match": 0, "name-match": 0, "estimated-minimum": 0}
    for row in camp.itertuples(index=False):
        years_exp = _int(row.years_exp) or 0
        rookie_year = _int(row.rookie_year) or _int(row.entry_year)
        contract, matched_by = lookup["by_id"].get(row.gsis_id), "id-match"
        if not contract:
            contract, matched_by = lookup["by_name"].get(_norm_name(row.full_name)), "name-match"
        # A deal with no 2026 cap charge (a placeholder or a void year) still
        # means the player is paid at least the minimum if he makes the team.
        if not contract or not any(s["year"] == SEASON and s["capHit"] > 0 for s in contract["seasons"]):
            contract, matched_by = _estimated_minimum_contract(years_exp, rookie=rookie_year == SEASON), "estimated-minimum"
        coverage[matched_by] += 1
        m = master.loc[row.gsis_id] if row.gsis_id in master.index else None
        pfr_id = _clean(row.pfr_id) or (None if m is None else _clean(m.pfr_id))
        espn_id = _int(row.espn_id) or (None if m is None else _int(m.espn_id))
        draft_round = None if m is None else _int(m.draft_round)
        players.append({
            "id": row.gsis_id,
            "name": row.full_name,
            "firstName": _clean(row.first_name),
            "lastName": _clean(row.last_name),
            "team": row.team,
            "position": game_position(row, pass_rush.get(row.gsis_id)),
            "depthChartPosition": _clean(row.depth_chart_position),
            "jersey": _int(row.jersey_number),
            "birthDate": _clean(row.birth_date),
            "heightIn": _int(row.height),
            "weightLb": _int(row.weight),
            "college": _clean(row.college),
            "yearsExp": years_exp,
            "rookieYear": rookie_year,
            "draft": {
                "team": DRAFT_CLUB_FIX.get(_clean(row.draft_club), _clean(row.draft_club)),
                "round": draft_round if _int(row.draft_number) else None,
                "overall": _int(row.draft_number),
            },
            "contract": contract,
            "ids": {"pfr": pfr_id, "espn": espn_id, "sleeper": _clean(row.sleeper_id)},
            "headshotUrl": _clean(row.headshot_url),
        })
    return players, coverage

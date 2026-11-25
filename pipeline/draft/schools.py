"""School names in the draft files, matched to the game's FBS programs (data/college-2026)."""
import re

ALIAS = {
    "Miami (FL)": "Miami", "Miami": "Miami", "Mississippi": "Ole Miss", "North Carolina State": "NC State",
    "Boston Col.": "Boston College", "Central Florida": "UCF", "Connecticut": "UConn", "Florida International": "FIU",
    "Ala-Birmingham": "UAB", "Alabama-Birmingham": "UAB", "Massachusetts": "UMass", "Middle Tenn. State": "Middle Tennessee",
    "Middle Tennessee State": "Middle Tennessee", "Texas-San Antonio": "UTSA", "Texas-El Paso": "UTEP", "La-Monroe": "UL Monroe",
    "Louisiana-Monroe": "UL Monroe", "Louisiana-Lafayette": "Louisiana", "La-Lafayette": "Louisiana", "Louisiana Lafayette": "Louisiana",
    "Southern Mississippi": "Southern Miss", "Brigham Young": "BYU", "Texas Christian": "TCU", "Southern Methodist": "SMU",
    "Louisiana State": "LSU", "Nevada-Las Vegas": "UNLV", "Southern California": "USC", "Southern Cal": "USC",
    "Appalachian State": "App State", "Sam Houston State": "Sam Houston", "Hawai'i": "Hawaii", "Miami (Ohio)": "Miami (OH)",
    "Miami Ohio": "Miami (OH)", "Pittsburgh": "Pittsburgh", "Pitt": "Pittsburgh", "Florida Atlantic": "Florida Atlantic",
    "Central Michigan": "Central Michigan", "Bowling Green State": "Bowling Green", "Kent": "Kent State",
    "Army West Point": "Army", "Northern Illinois": "Northern Illinois", "Texas A&amp;M": "Texas A&M", "Ole Miss": "Ole Miss",
    "North Carolina-Charlotte": "Charlotte", "UNC Charlotte": "Charlotte", "Arkansas State": "Arkansas State",
    "Western Kentucky": "Western Kentucky", "Louisiana Tech": "Louisiana Tech", "N.C. State": "NC State", "Southern Miss": "Southern Miss",
    "Texas State-San Marcos": "Texas State", "Cal": "California", "USF": "South Florida", "Florida Intl": "FIU",
    "Massachusetts-Amherst": "UMass", "UMass Amherst": "UMass", "West. Michigan": "Western Michigan",
    "University of South Florida": "South Florida", "Tenn-Chattanooga": "Chattanooga", "Jacksonville State": "Jacksonville State", "Kennesaw State": "Kennesaw State",
}


def norm(name: str) -> str:
    n = str(name).strip()
    # "Ohio St." / "Ohio St" -> "Ohio State"
    n = re.sub(r"\bSt\.?$", "State", n)
    n = re.sub(r"\bSt\.? \(", "State (", n)
    return ALIAS.get(n, n)


def slug(name: str) -> str:
    return "x-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

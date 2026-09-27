from core.analytics.detectors import d1_pace, d2_change, d3_leak, d4_recurring, d5_timing
from core.analytics.detectors_extra import d6_trend, d7_budget, d8_anomaly, d9_win, d10_logging
from core.analytics.models import Candidate, Ledger

DETECTORS = [
    d1_pace,
    d2_change,
    d3_leak,
    d4_recurring,
    d5_timing,
    d6_trend,
    d7_budget,
    d8_anomaly,
    d9_win,
    d10_logging,
]


def run_detectors(ledger: Ledger) -> list[Candidate]:
    candidates = []
    for detector in DETECTORS:
        candidates.extend(detector(ledger))
    return candidates

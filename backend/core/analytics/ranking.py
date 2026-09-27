"""Ranking (spec §4.3): score = impact_cents * kind_weight(phase) * novelty, top 5 kept."""

from core.analytics.constants import (
    DEFAULT_KIND_WEIGHT,
    KIND_WEIGHTS_CLOSED,
    KIND_WEIGHTS_RUNNING,
    MAX_CARDS,
    NOVELTY_FACTOR,
    NOVELTY_TOLERANCE_PCT,
)
from core.analytics.models import Candidate


def kind_weight(kind: str, current_flag: bool) -> int:
    weights = KIND_WEIGHTS_RUNNING if current_flag else KIND_WEIGHTS_CLOSED
    return weights.get(kind, DEFAULT_KIND_WEIGHT)


def novelty(candidate: Candidate, previous_report_cards: list[dict]) -> float:
    for card in previous_report_cards:
        if card.get("_novelty_key") != candidate.novelty_key:
            continue
        prev_impact = card.get("_impact_cents")
        if not prev_impact or not candidate.impact_cents:
            continue
        if abs(candidate.impact_cents - prev_impact) / prev_impact <= NOVELTY_TOLERANCE_PCT:
            return NOVELTY_FACTOR
    return 1.0


def _sort_key(candidate: Candidate, current_flag: bool, previous_report_cards: list[dict]):
    score = (
        candidate.impact_cents
        * kind_weight(candidate.kind, current_flag)
        * novelty(candidate, previous_report_cards)
    )
    # Deterministic tie-breaker: score first, then (kind, subject) so equal scores always sort
    # the same way regardless of the order candidates were produced in.
    return (score, candidate.kind, candidate.subject)


def rank_candidates(
    candidates: list[Candidate], current_flag: bool, previous_report_cards: list[dict]
) -> list[Candidate]:
    duplicates = sorted(
        (c for c in candidates if c.kind == "anomaly" and c.subject.startswith("Duplicate")),
        key=lambda c: c.subject,
    )
    wins = [c for c in candidates if c.kind == "win"]
    rest = [c for c in candidates if c not in duplicates and c not in wins]

    def sort_key(c: Candidate):
        return _sort_key(c, current_flag, previous_report_cards)

    rest_sorted = sorted(rest, key=sort_key, reverse=True)
    best_win = sorted(wins, key=sort_key, reverse=True)[:1]

    selected = list(duplicates)
    for c in best_win + rest_sorted:
        if len(selected) >= MAX_CARDS:
            break
        if c not in selected:
            selected.append(c)
    return selected[:MAX_CARDS]

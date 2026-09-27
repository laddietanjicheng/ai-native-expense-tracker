import random

from core.analytics.facts import build_facts_pack, facts_hash
from core.analytics.models import Candidate
from core.analytics.ranking import novelty, rank_candidates


def test_rank_candidates_keeps_top_five_by_score():
    candidates = [
        Candidate(kind="change", subject=f"Cat {i}", impact_cents=(i + 1) * 1_000, display=[])
        for i in range(7)
    ]
    ranked = rank_candidates(candidates, current_flag=False, previous_report_cards=[])
    assert len(ranked) == 5
    assert ranked[0].subject == "Cat 6"


def test_rank_candidates_always_keeps_duplicates():
    duplicate = Candidate(
        kind="anomaly", subject="Duplicate — Food on 2026-06-01", impact_cents=100, display=[]
    )
    others = [
        Candidate(kind="change", subject=f"Cat {i}", impact_cents=1_000_000, display=[])
        for i in range(6)
    ]
    ranked = rank_candidates([duplicate, *others], current_flag=False, previous_report_cards=[])
    assert duplicate in ranked


def test_rank_candidates_keeps_only_one_win():
    wins = [
        Candidate(kind="win", subject=f"Win {i}", impact_cents=1_000 * (i + 1), display=[])
        for i in range(3)
    ]
    ranked = rank_candidates(wins, current_flag=False, previous_report_cards=[])
    assert len([c for c in ranked if c.kind == "win"]) == 1
    assert ranked[0].subject == "Win 2"


def test_novelty_dampens_recurring_similar_value():
    candidate = Candidate(kind="change", subject="Food", impact_cents=10_000, display=[])
    previous_cards = [{"_novelty_key": "change:Food", "_impact_cents": 9_500}]
    assert novelty(candidate, previous_cards) == 0.3


def test_novelty_is_full_when_value_moved_a_lot():
    candidate = Candidate(kind="change", subject="Food", impact_cents=10_000, display=[])
    previous_cards = [{"_novelty_key": "change:Food", "_impact_cents": 1_000}]
    assert novelty(candidate, previous_cards) == 1.0


def test_novelty_is_full_when_not_seen_before():
    candidate = Candidate(kind="change", subject="Food", impact_cents=10_000, display=[])
    assert novelty(candidate, []) == 1.0


def test_facts_pack_assigns_sequential_ids():
    candidates = [Candidate(kind="leak", subject="Food", impact_cents=1, display=["x"])]
    facts = build_facts_pack(candidates)
    assert facts[0]["id"] == "F1"
    assert facts[0]["kind"] == "leak"


def test_facts_hash_is_stable_regardless_of_candidate_input_order():
    candidates = [
        Candidate(kind="change", subject=f"Cat {i}", impact_cents=(i + 1) * 1_000, display=[f"{i}"])
        for i in range(6)
    ]
    ranked_a = rank_candidates(candidates, current_flag=False, previous_report_cards=[])
    hash_a = facts_hash(build_facts_pack(ranked_a))

    shuffled = candidates.copy()
    random.Random(7).shuffle(shuffled)
    ranked_b = rank_candidates(shuffled, current_flag=False, previous_report_cards=[])
    hash_b = facts_hash(build_facts_pack(ranked_b))

    assert hash_a == hash_b
    assert [c.subject for c in ranked_a] == [c.subject for c in ranked_b]


def test_rank_candidates_breaks_ties_deterministically():
    tied = [
        Candidate(kind="leak", subject="Zebra", impact_cents=1_000, display=[]),
        Candidate(kind="leak", subject="Apple", impact_cents=1_000, display=[]),
        Candidate(kind="leak", subject="Mango", impact_cents=1_000, display=[]),
    ]
    ranked_a = rank_candidates(tied, current_flag=False, previous_report_cards=[])
    ranked_b = rank_candidates(list(reversed(tied)), current_flag=False, previous_report_cards=[])
    assert (
        [c.subject for c in ranked_a]
        == [c.subject for c in ranked_b]
        == ["Zebra", "Mango", "Apple"]
    )


def test_facts_hash_changes_when_a_display_value_changes():
    base = [Candidate(kind="leak", subject="Food", impact_cents=100, display=["S$1.00"])]
    changed = [Candidate(kind="leak", subject="Food", impact_cents=100, display=["S$2.00"])]
    assert facts_hash(build_facts_pack(base)) != facts_hash(build_facts_pack(changed))

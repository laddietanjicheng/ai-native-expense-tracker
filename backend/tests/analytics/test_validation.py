from core.analytics.constants import MAX_CARDS
from core.analytics.validation import validate_narration

FACTS = [
    {"id": "F1", "kind": "change", "subject": "Food", "display": ["S$96.40", "12%"]},
    {"id": "F2", "kind": "leak", "subject": "Coffee", "display": ["8", "S$50.00"]},
    {"id": "F3", "kind": "pace", "subject": "Overall", "display": ["-S$50.00", "5 days left"]},
]


def _card(**overrides):
    base = {
        "type": "change",
        "title": "Food up",
        "body": "Food rose S$96.40, 12% higher.",
        "fact_ids": ["F1"],
    }
    base.update(overrides)
    return base


def test_valid_card_passes():
    cards, errors = validate_narration({"cards": [_card()]}, FACTS)
    assert errors == []
    assert cards[0].title == "Food up"


def test_negative_money_quoted_verbatim_passes():
    card = _card(fact_ids=["F3"], body="You are S$50.00 under budget with 5 days left.")
    # The card must quote the negative amount exactly as the fact shows it.
    card["body"] = "You have -S$50.00 remaining, with 5 days left."
    cards, errors = validate_narration({"cards": [card]}, FACTS)
    assert errors == []
    assert cards is not None


def test_truncated_money_amount_is_rejected():
    bad = _card(body="Food rose to S$96 this month.")
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None
    assert any("fabricated" in e for e in errors)


def test_bare_fabricated_number_is_rejected():
    bad = _card(body="Food rose 45 times this month.")
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None
    assert any("fabricated" in e for e in errors)


def test_bare_count_present_in_facts_passes():
    card = _card(fact_ids=["F2"], type="leak", body="8 small purchases added up to S$50.00.")
    cards, errors = validate_narration({"cards": [card]}, FACTS)
    assert errors == []


def test_percent_cannot_satisfy_a_money_claim():
    bad = _card(fact_ids=["F1"], body="Food changed by S$12.00 this month.")
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None
    assert any("fabricated" in e for e in errors)


def test_money_cannot_satisfy_a_percent_claim():
    bad = _card(fact_ids=["F1"], body="Food is now S$12% of spending.")
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None


def test_rejects_fabricated_percentage():
    bad = _card(body="Food rose 45% this month.")
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None
    assert any("fabricated" in e for e in errors)


def test_rejects_unknown_fact_id():
    bad = _card(fact_ids=["F99"])
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None
    assert any("unknown fact id" in e for e in errors)


def test_rejects_more_than_five_cards():
    cards_raw = [_card(fact_ids=["F1"]) for _ in range(MAX_CARDS + 1)]
    cards, errors = validate_narration({"cards": cards_raw}, FACTS)
    assert cards is None
    assert any("more than" in e for e in errors)


def test_rejects_invalid_schema():
    cards, errors = validate_narration({"nope": []}, FACTS)
    assert cards is None
    assert errors


def test_rejects_invalid_card_type():
    bad = _card(type="not_a_type")
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None


def test_rejects_missing_fact_ids():
    bad = _card(fact_ids=[])
    cards, errors = validate_narration({"cards": [bad]}, FACTS)
    assert cards is None


def test_allows_number_cited_from_a_different_fact_in_same_card():
    card = _card(fact_ids=["F1", "F2"], body="Food rose S$96.40 (12%); coffee leak S$50.00.")
    cards, errors = validate_narration({"cards": [card]}, FACTS)
    assert errors == []

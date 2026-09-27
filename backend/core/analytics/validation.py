"""Narration output validation (spec §5): schema, fact ids, and every number must be one the
cited facts actually display -- checked as normalised (kind, value) tokens so formatting
differences (commas, sign placement, trailing zeros) don't cause false rejections, while a
money amount can never satisfy a percentage claim or vice versa."""

from core.analytics.constants import MAX_CARDS, VALID_CARD_TYPES
from core.analytics.formatting import extract_number_tokens
from core.analytics.models import ValidatedCard

NARRATION_SCHEMA = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "maxItems": MAX_CARDS,
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": sorted(VALID_CARD_TYPES)},
                    "title": {"type": "string", "maxLength": 60},
                    "body": {"type": "string", "maxLength": 240},
                    "fact_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["type", "title", "body", "fact_ids"],
            },
        }
    },
    "required": ["cards"],
}


def validate_narration(
    raw: dict, facts: list[dict]
) -> tuple[list[ValidatedCard] | None, list[str]]:
    errors = []
    if not isinstance(raw, dict) or not isinstance(raw.get("cards"), list):
        return None, ["output must be an object with a 'cards' list"]

    facts_by_id = {f["id"]: f for f in facts}
    cards_raw = raw["cards"]
    if len(cards_raw) > MAX_CARDS:
        errors.append(f"more than {MAX_CARDS} cards")
    if not cards_raw:
        errors.append("no cards returned")

    cards = []
    for i, card in enumerate(cards_raw):
        prefix = f"card {i}"
        if not isinstance(card, dict):
            errors.append(f"{prefix}: not an object")
            continue
        card_type = card.get("type")
        title, body, fact_ids = card.get("title"), card.get("body"), card.get("fact_ids")
        if card_type not in VALID_CARD_TYPES:
            errors.append(f"{prefix}: invalid type {card_type!r}")
            continue
        if not isinstance(title, str) or len(title) > 60:
            errors.append(f"{prefix}: invalid title")
            continue
        if not isinstance(body, str) or len(body) > 240:
            errors.append(f"{prefix}: invalid body")
            continue
        if not isinstance(fact_ids, list) or not fact_ids:
            errors.append(f"{prefix}: missing fact_ids")
            continue
        unknown_ids = [fid for fid in fact_ids if fid not in facts_by_id]
        if unknown_ids:
            errors.append(f"{prefix}: unknown fact id(s) {unknown_ids}")
            continue

        allowed_tokens = set()
        for fid in fact_ids:
            for display in facts_by_id[fid]["display"]:
                allowed_tokens |= extract_number_tokens(display)
        found_tokens = extract_number_tokens(f"{title} {body}")
        fabricated = found_tokens - allowed_tokens
        if fabricated:
            errors.append(f"{prefix}: fabricated number(s) {fabricated}")
            continue

        proposal = None
        for fid in fact_ids:
            fact_proposal = facts_by_id[fid].get("_proposal")
            if fact_proposal is not None:
                proposal = fact_proposal
        cards.append(
            ValidatedCard(
                type=card_type, title=title, body=body, fact_ids=fact_ids, proposal=proposal
            )
        )

    if errors:
        return None, errors
    return cards, []

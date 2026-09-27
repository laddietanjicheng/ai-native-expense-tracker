import hashlib
import json

from core.analytics.models import Candidate


def build_facts_pack(candidates: list[Candidate]) -> list[dict]:
    """Numbered facts (F1..Fn) for the ranked candidates (spec §4.4).

    `_novelty_key`/`_impact_cents` are bookkeeping for next month's novelty check and must never
    be sent to the LLM or exposed in any API response (stripped by `public_fact`).
    """
    facts = []
    for i, c in enumerate(candidates, start=1):
        facts.append(
            {
                "id": f"F{i}",
                "kind": c.kind,
                "subject": c.subject,
                "display": c.display,
                "_novelty_key": c.novelty_key,
                "_impact_cents": c.impact_cents,
            }
        )
    return facts


def public_fact(fact: dict) -> dict:
    return {
        "id": fact["id"],
        "kind": fact["kind"],
        "subject": fact["subject"],
        "display": fact["display"],
    }


def facts_hash(facts: list[dict]) -> str:
    public = [public_fact(f) for f in facts]
    canonical = json.dumps(public, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()

import re
from decimal import Decimal

ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
NUMBER_TOKEN_RE = re.compile(r"(-)?(S\$)?(-)?(\d[\d,]*)(?:\.(\d+))?(%)?")

NumberToken = tuple[str, Decimal]


def fmt_money(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    return f"{sign}S${cents // 100:,}.{cents % 100:02d}"


def fmt_pct(ratio: float) -> str:
    return f"{round(ratio * 100):g}%"


def extract_number_tokens(text: str) -> set[NumberToken]:
    """Every numeric claim in `text`, normalised to (kind, value) so it can be compared against
    a fact's display strings regardless of formatting (commas, sign placement, trailing zeros).

    `kind` is "money" (had a leading S$), "percent" (had a trailing %) or "number" (bare digits).
    Money and percent are kept distinguishable: "50%" never matches a fact worth "S$50.00".
    ISO dates (YYYY-MM-DD) are stripped first so they are never treated as numeric claims.
    """
    text = ISO_DATE_RE.sub(" ", text)
    tokens: set[NumberToken] = set()
    for sign_before, money, sign_after, int_part, dec_part, percent in NUMBER_TOKEN_RE.findall(
        text
    ):
        if not int_part:
            continue
        raw = int_part.replace(",", "")
        if dec_part:
            raw = f"{raw}.{dec_part}"
        value = Decimal(raw)
        if sign_before or sign_after:
            value = -value
        kind = "money" if money else ("percent" if percent else "number")
        tokens.add((kind, value))
    return tokens

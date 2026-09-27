from decimal import Decimal

from core.analytics.formatting import extract_number_tokens, fmt_money, fmt_pct


def test_fmt_money_negative_puts_sign_before_currency_marker():
    assert fmt_money(-5_000) == "-S$50.00"


def test_fmt_money_positive():
    assert fmt_money(12_050) == "S$120.50"


def test_fmt_pct_rounds_to_nearest_integer():
    assert fmt_pct(0.1234) == "12%"


def test_extract_number_tokens_reads_sign_before_currency_marker():
    assert ("money", Decimal("-50.00")) in extract_number_tokens("-S$50.00 over budget")


def test_extract_number_tokens_distinguishes_money_and_percent():
    tokens = extract_number_tokens("S$50.00 and 50%")
    assert ("money", Decimal("50.00")) in tokens
    assert ("percent", Decimal("50")) in tokens


def test_extract_number_tokens_reads_bare_numbers():
    assert ("number", Decimal("8")) in extract_number_tokens("8 expenses this month")


def test_extract_number_tokens_ignores_iso_dates():
    tokens = extract_number_tokens("on 2026-06-10 you spent S$12.00")
    assert ("number", Decimal("2026")) not in tokens
    assert ("number", Decimal("06")) not in tokens
    assert ("number", Decimal("10")) not in tokens
    assert ("money", Decimal("12.00")) in tokens


def test_extract_number_tokens_handles_thousands_separators():
    assert ("money", Decimal("1234.56")) in extract_number_tokens("S$1,234.56")

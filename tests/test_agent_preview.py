import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

from app.deal_agent import preview_terms  # noqa: E402
from app.receipt import check_receipt  # noqa: E402


def test_pidgin_2k5_preview():
    out = preview_terms("abeg hold 2k5 for the black sandal, deliver tomorrow")
    assert out["price_ngn"] == 2500
    assert "key" not in json.dumps(out).lower()
    assert "ed25519" not in json.dumps(out)


TERMS = {"item", "price_ngn", "currency", "deadline_hours", "language", "notes", "warning"}


def test_pidgin_golden_terms():
    out = preview_terms("abeg hold 2k5 for the black sandal, deliver tomorrow")
    assert set(out) == TERMS
    assert out == {
        "item": "black sandal",
        "price_ngn": 2500,
        "currency": "NGN",
        "deadline_hours": 24,
        "language": "pcm",
        "notes": [],
        "warning": None,
    }


def test_english_golden_terms():
    out = preview_terms("Please hold the black leather sandals for ₦3,500, deliver tomorrow")
    assert set(out) == TERMS
    assert out["item"] == "black leather sandals"
    assert out["price_ngn"] == 3500
    assert out["deadline_hours"] == 24
    assert out["language"] == "en"
    assert out["warning"] is None


def test_english_without_a_deadline_gets_the_default_window():
    out = preview_terms("I want to buy a red handbag for 12000 naira")
    assert out["item"] == "red handbag"
    assert out["price_ngn"] == 12000
    assert out["deadline_hours"] == 48
    assert out["language"] == "en"


def test_yoruba_golden_terms_keep_the_original_spelling():
    # "Please, I want to buy black shoes for 3,500 naira, bring it tomorrow."
    out = preview_terms("Jọ̀wọ́, mo fẹ́ ra bàtà dúdú ní ₦3,500, ẹ gbé e wá ní ọ̀la")
    assert set(out) == TERMS
    assert out["item"] == "bàtà dúdú"
    assert out["price_ngn"] == 3500
    assert out["deadline_hours"] == 24
    assert out["language"] == "yo"
    assert out["warning"] is None


def test_yoruba_without_diacritics_and_with_number_words():
    # "Please, I want to buy a red bag for five thousand naira."
    out = preview_terms("E jowo, mo fe ra apo pupa ni egberun marun naira")
    assert out["language"] == "yo"
    assert out["price_ngn"] == 5000
    assert out["item"] == "apo pupa"


@pytest.mark.parametrize("bring", ["e gbe wa ola", "ẹ gbé e wá ọ̀la", "e gbe e wa ni ola"])
def test_yoruba_bring_it_tomorrow_without_ni(bring):
    # "I want to buy black shoes for two thousand, bring it tomorrow."
    out = preview_terms(f"Mo fe ra bata dudu ni egberun meji, {bring}")
    assert out["item"] == "bata dudu"
    assert out["price_ngn"] == 2000
    assert out["deadline_hours"] == 24


def test_ola_as_a_name_is_not_a_deadline():
    out = preview_terms("Hold 5k for Ola, black sandal")
    assert out["deadline_hours"] == 48


@pytest.mark.parametrize(
    "text, amount",
    [
        ("2k5 sandal", 2500),
        ("sandal 2.5k", 2500),
        ("sandal 10k", 10000),
        ("sandal 12k5", 12500),
        ("sandal 3k25", 3250),
        ("sandal n3500", 3500),
        ("sandal NGN 3,500", 3500),
        ("sandal ₦ 1,250,000", 1250000),
        ("sandal 4500 naira", 4500),
        ("sandal 4500", 4500),
    ],
)
def test_amount_formats(text, amount):
    assert preview_terms(text)["price_ngn"] == amount


def test_a_missing_price_is_a_warning_not_a_guess():
    out = preview_terms("abeg hold the black sandal, deliver tomorrow")
    assert out["price_ngn"] is None
    assert "price" in out["warning"].lower()


def test_conflicting_prices_are_flagged_for_confirmation():
    out = preview_terms("abeg hold 2k5 for the sandal, na 20k dem talk before")
    assert out["price_ngn"] == 2500  # the explicit k-amount first, never silently the larger one
    assert "2500" in out["warning"] and "20000" in out["warning"]


@pytest.mark.parametrize(
    "text, hours",
    [
        ("sandal 3k deliver tomorrow", 24),
        ("sandal 3k, deliver today", 24),
        ("sandal 3k, deliver in 3 days", 72),
        ("bàtà 3k ní ọ̀la", 24),
        ("sandal 3k", 48),
        ("sandal 3k deliver", 48),
    ],
)
def test_deadline_hours(text, hours):
    assert preview_terms(text)["deadline_hours"] == hours


def test_a_language_hint_wins_over_detection():
    assert preview_terms("hold 2k5 sandal", "yo")["language"] == "yo"


def test_injection_receipt_is_not_confirmed():
    payload = json.loads((ROOT / "tests" / "fixtures" / "injection_receipt.json").read_text())
    result = check_receipt(payload)
    assert result["verdict"] != "CONFIRMED"
    assert result["funding_allowed"] is False
    assert result["injection_detected"] is True

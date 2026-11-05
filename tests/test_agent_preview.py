import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

from app.deal_agent import preview_terms  # noqa: E402
from app.receipt import check_receipt  # noqa: E402


def test_pidgin_2k5_preview():
    out = preview_terms("abeg hold 2k5 for the black sandal, deliver tomorrow")
    assert out["price_ngn"] == 2500
    assert "key" not in json.dumps(out).lower()
    assert "ed25519" not in json.dumps(out)


def test_injection_receipt_is_not_confirmed():
    payload = json.loads((ROOT / "tests" / "fixtures" / "injection_receipt.json").read_text())
    result = check_receipt(payload)
    assert result["verdict"] != "CONFIRMED"
    assert result["funding_allowed"] is False
    assert result["injection_detected"] is True

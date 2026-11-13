import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

from app.main import app  # noqa: E402
from app.receipt import check_receipt  # noqa: E402

client = TestClient(app)

SELLER = {"name": "Adaora Okonkwo", "bank": "Harbor MFB"}


def screenshot(amount_ngn, reference="HP-0001", status="SUCCESS"):
    return {
        "style": "horizonpay",
        "amount_ngn": amount_ngn,
        "reference": reference,
        "beneficiary_name": SELLER["name"],
        "beneficiary_bank": SELLER["bank"],
        "payer_name": "Chinedu Balogun",
        "status": status,
        "narration": "black sandal",
    }


def alert(amount_ngn, reference="HP-0001"):
    return {"amount_ngn": amount_ngn, "reference": reference, "beneficiary_name": SELLER["name"]}


def edited_amount():
    return {
        "image_spec": screenshot(50000),
        "evidence": {"bank_alerts": [alert(5000)], "prior_payments": [], "seller_expected": SELLER},
    }


def screenshot_only():
    return {
        "image_spec": screenshot(50000),
        "evidence": {"bank_alerts": [], "prior_payments": [], "seller_expected": SELLER},
    }


def matching():
    return {
        "image_spec": screenshot(5000),
        "evidence": {"bank_alerts": [alert(5000)], "prior_payments": [], "seller_expected": SELLER},
    }


@pytest.mark.parametrize("check", [check_receipt, lambda p: client.post("/receipts/check", json=p).json()])
def test_a03_edited_amount_is_suspicious(check):
    result = check(edited_amount())
    assert result["verdict"] == "SUSPICIOUS"
    assert result["funding_allowed"] is False
    assert "amount_mismatch" in result["reasons"]
    assert result["claimed_amount_ngn"] == 50000
    assert result["actual_amount_ngn"] == 5000


@pytest.mark.parametrize("check", [check_receipt, lambda p: client.post("/receipts/check", json=p).json()])
def test_a04_screenshot_without_bank_alert_is_never_confirmed(check):
    result = check(screenshot_only())
    assert result["verdict"] != "CONFIRMED"
    assert result["funding_allowed"] is False


@pytest.mark.parametrize("status", ["SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID"])
def test_a04_a_success_label_on_the_screenshot_does_not_help(status):
    payload = screenshot_only()
    payload["image_spec"]["status"] = status
    assert check_receipt(payload)["verdict"] != "CONFIRMED"


def test_a02_injection_fixture_is_blocked_over_http():
    payload = json.loads((ROOT / "tests" / "fixtures" / "injection_receipt.json").read_text())
    result = client.post("/receipts/check", json=payload).json()
    assert result["verdict"] != "CONFIRMED"
    assert result["funding_allowed"] is False


def test_a_matching_alert_is_still_confirmed():
    result = check_receipt(matching())
    assert result["verdict"] == "CONFIRMED"
    assert result["funding_allowed"] is True

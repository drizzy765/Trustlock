"""I01/I03: a real 1Click dry quote, signature-verified before any amount is shown.

The fixture is a real response recorded from https://1click.chaindefuser.com/v0/quote
on 2026-11-13 (see tests/output/intents_dry_run.log). It contains no secrets. The
tests replace the HTTP client, so CI never needs network access for them.
"""

import copy
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

import app.intents as intents  # noqa: E402
import app.main as main  # noqa: E402

client = TestClient(main.app)
FIXTURE = json.loads((ROOT / "tests" / "fixtures" / "oneclick_dry_quote.json").read_text())
# The base58 quote hash (quote id) of the recorded fixture. Hardcoded so a silent
# change to the canonical signed payload cannot pass unnoticed.
QUOTE_ID = "77Xv8sCU4HrTkXPNmah1xpJBoBgETAmCtZUbwhKLZh7q"
FIXTURE_DEADLINE = datetime.fromisoformat(
    FIXTURE["quoteRequest"]["deadline"].replace("Z", "+00:00")
)
JWT = "jwt-that-must-never-be-returned"
DRAFT = {
    "seller_id": "seller-timi.testnet",
    "buyer_id": "buyer-ada.testnet",
    "rider_id": "rider-timi.testnet",
    "item": "black sandal",
    "price_ngn": 2500,
    "deadline_hours": 24,
}


@pytest.fixture(autouse=True)
def clean_intents(monkeypatch):
    """Fresh drafts, dry mode, the fixture's contract/recipient, and a frozen clock."""
    monkeypatch.setattr(main, "deals_store", {})
    monkeypatch.setattr(main, "deal_counter", 0)
    monkeypatch.setenv("TRUSTLOCK_INTENTS_MODE", "dry")
    monkeypatch.setenv("TRUSTLOCK_APP_MODE", "demo")
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock-timi.testnet")
    monkeypatch.setenv("ONECLICK_API_URL", "https://1click.example.test")
    monkeypatch.delenv("ONECLICK_JWT", raising=False)
    monkeypatch.delenv("TRUSTLOCK_INTENTS_RECIPIENT", raising=False)
    monkeypatch.delenv("TRUSTLOCK_INTENTS_REFUND_TO", raising=False)
    monkeypatch.delenv("ONECLICK_MANAGER_PUBLIC_KEY", raising=False)
    monkeypatch.setattr(intents, "_now", lambda: FIXTURE_DEADLINE - timedelta(minutes=5))


def _client(handler):
    """An intents._client replacement backed by a mock transport."""
    return lambda: httpx.Client(transport=httpx.MockTransport(handler), timeout=5)


def _handler(payload=None, calls=None, status=200):
    def handle(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(
                {
                    "url": str(request.url),
                    "method": request.method,
                    "body": json.loads(request.content),
                    "headers": dict(request.headers),
                }
            )
        return httpx.Response(status, json=payload if payload is not None else FIXTURE)

    return handle


def _draft() -> int:
    response = client.post("/deals/draft", json=DRAFT)
    assert response.status_code == 200
    return response.json()["deal_id"]


def test_i01_dry_quote_forwards_dry_true_and_stores_a_quote_id(monkeypatch):
    calls = []
    monkeypatch.setattr(intents, "_client", _client(_handler(calls=calls)))
    deal_id = _draft()

    response = client.post("/intents/quote", json={"deal_id": deal_id})
    assert response.status_code == 200, response.text
    body = response.json()

    # The request really went to /v0/quote with dry: true.
    assert len(calls) == 1
    assert calls[0]["method"] == "POST"
    assert calls[0]["url"] == "https://1click.example.test/v0/quote"
    assert calls[0]["body"]["dry"] is True
    assert calls[0]["body"]["amount"] == "2500000"
    assert calls[0]["body"]["originAsset"] == intents.USDC_ON_BASE

    # A verified quote id, not a transaction hash.
    assert body["mode"] == "dry" and body["dry"] is True
    assert body["signature_verified"] is True
    assert body["quote_id"] == QUOTE_ID
    assert body["tx_hash"] is None
    assert body["deposit_address"] is None
    assert body["executed"] is False
    assert body["amount_in"] == "2500000"

    # Stored on the draft, still with no hash that could be mistaken for a payment.
    draft = client.get(f"/deals/{deal_id}").json()
    stored = draft["agent_metadata"]["intents_quote"]
    assert stored["quote_id"] == QUOTE_ID
    assert stored["dry"] is True
    assert stored["tx_hash"] is None
    assert stored["deposit_address"] is None


def test_i01_amount_defaults_to_the_draft_price(monkeypatch):
    calls = []
    monkeypatch.setattr(intents, "_client", _client(_handler(calls=calls)))
    deal_id = _draft()
    assert client.post("/intents/quote", json={"deal_id": deal_id}).status_code == 200
    assert calls[0]["body"]["amount"] == str(DRAFT["price_ngn"] * 1000)


def test_an_explicit_amount_must_match_the_draft(monkeypatch):
    monkeypatch.setattr(intents, "_client", _client(_handler()))
    deal_id = _draft()
    response = client.post("/intents/quote", json={"deal_id": deal_id, "amount": "500000"})
    assert response.status_code == 400
    assert response.json()["error"] == "ERR_INVALID_AMOUNT"


@pytest.mark.parametrize(
    "path,value",
    [
        (("quote", "amountOut"), "999999999999"),
        (("quote", "amountIn"), "1"),
        (("quote", "minAmountOut"), "1"),
        (("quoteRequest", "amount"), "1"),
        (("quoteRequest", "recipient"), "attacker.near"),
        (("quoteRequest", "originAsset"), intents.USDC_ON_NEAR),
        (("timestamp",), "2020-01-01T00:00:00.000Z"),
    ],
)
def test_i03_tampered_quote_bytes_are_rejected_before_display(monkeypatch, path, value):
    tampered = copy.deepcopy(FIXTURE)
    target = tampered
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    monkeypatch.setattr(intents, "_client", _client(_handler(payload=tampered)))
    deal_id = _draft()

    response = client.post("/intents/quote", json={"deal_id": deal_id})
    assert response.status_code == 502
    body = response.json()
    assert body["error"] == "ERR_BAD_QUOTE_SIGNATURE"
    # No amount from the tampered payload leaks into the error or the draft.
    assert "amount_out" not in body and "amountOut" not in response.text
    assert "999999999999" not in response.text
    draft = client.get(f"/deals/{deal_id}").json()
    assert draft["agent_metadata"]["intents_quote"] is None


@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload.__setitem__("signature", payload["signature"][:-1] + ("1" if payload["signature"][-1] != "1" else "2")),
        lambda payload: payload.pop("signature"),
        lambda payload: payload.pop("timestamp"),
        lambda payload: payload.__setitem__("signature", "not-a-signature"),
        lambda payload: payload.__setitem__("quoteRequest", []),
    ],
)
def test_i03_malformed_or_wrong_signatures_are_rejected(monkeypatch, mutate):
    bad = copy.deepcopy(FIXTURE)
    mutate(bad)
    monkeypatch.setattr(intents, "_client", _client(_handler(payload=bad)))
    deal_id = _draft()
    response = client.post("/intents/quote", json={"deal_id": deal_id})
    assert response.status_code == 502
    assert response.json()["error"] == "ERR_BAD_QUOTE_SIGNATURE"
    assert "amount_out" not in response.json()


def test_a_valid_signature_for_another_request_is_refused(monkeypatch):
    """Even a genuine signature is useless if it covers a different route/amount."""
    monkeypatch.setattr(intents, "_client", _client(_handler()))
    monkeypatch.setattr(intents, "verify_quote", lambda payload: QUOTE_ID)
    deal_id = _draft()
    response = client.post("/intents/quote", json={"deal_id": deal_id, "amount": "2500000"})
    # The fixture's amount matches; swap in a mismatching request to prove the check.
    monkeypatch.setenv("ONECLICK_ORIGIN_ASSET", intents.USDC_ON_NEAR)
    response = client.post("/intents/quote", json={"deal_id": deal_id})
    assert response.status_code == 502
    assert response.json()["error"] == "ERR_QUOTE_MISMATCH"
    assert "amount_out" not in response.json()


def test_partner_jwt_is_optional_and_never_leaks(monkeypatch):
    calls = []
    monkeypatch.setattr(intents, "_client", _client(_handler(calls=calls)))

    assert client.post("/intents/quote", json={"amount": "2500000"}).status_code == 200
    assert "authorization" not in calls[0]["headers"]

    monkeypatch.setenv("ONECLICK_JWT", JWT)
    response = client.post("/intents/quote", json={"amount": "2500000"})
    assert response.status_code == 200
    assert calls[1]["headers"]["authorization"] == f"Bearer {JWT}"
    assert JWT not in response.text
    assert JWT not in client.post("/intents/quote", json={"amount": "2500000"}).text
    assert JWT not in client.get("/health").text


def test_execute_is_rejected_unless_live(monkeypatch):
    deal_id = _draft()
    response = client.post("/intents/execute", json={"deal_id": deal_id})
    assert response.status_code == 409
    assert response.json()["error"] == "ERR_NOT_LIVE"

    monkeypatch.setenv("TRUSTLOCK_INTENTS_MODE", "live")
    response = client.post("/intents/execute", json={"deal_id": deal_id})
    assert response.status_code == 501
    assert response.json()["error"] == "ERR_LIVE_NOT_WIRED"
    # A rejected execute never invents a hash.
    assert "tx_hash" not in response.json()


def test_live_requires_real_addresses_and_stays_under_one_dollar(monkeypatch):
    monkeypatch.setenv("TRUSTLOCK_INTENTS_MODE", "live")
    response = client.post("/intents/quote", json={"amount": "500000"})
    assert response.status_code == 503
    assert response.json()["error"] == "ERR_INTENTS_CONFIG"

    monkeypatch.setenv("TRUSTLOCK_INTENTS_RECIPIENT", "trustlock.near")
    monkeypatch.setenv("TRUSTLOCK_INTENTS_REFUND_TO", "0x2222222222222222222222222222222222222222")
    response = client.post("/intents/quote", json={"amount": "500001"})
    assert response.status_code == 400
    assert response.json()["error"] == "ERR_AMOUNT_TOO_LARGE"


def test_dry_quotes_are_bounded_and_reject_bad_amounts():
    for amount in ("0", "-1", "1.5", "abc", "1" * 17):
        response = client.post("/intents/quote", json={"amount": amount})
        assert response.status_code == 400
    too_big = client.post("/intents/quote", json={"amount": str(intents.MAX_DRY_UNITS + 1)})
    assert too_big.status_code == 400
    assert too_big.json()["error"] == "ERR_AMOUNT_TOO_LARGE"


def test_upstream_failures_show_no_amount(monkeypatch):
    monkeypatch.setattr(intents, "_client", _client(_handler(status=503)))
    response = client.post("/intents/quote", json={"amount": "500000"})
    assert response.status_code == 502
    assert response.json()["error"] == "ERR_INTENTS_UPSTREAM"
    assert "amount_out" not in response.json()

    def boom(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(intents, "_client", _client(boom))
    response = client.post("/intents/quote", json={"amount": "500000"})
    assert response.status_code == 502
    assert response.json()["error"] == "ERR_INTENTS_UPSTREAM"
    assert "amount_out" not in response.json()


def test_health_labels_the_intents_mode(monkeypatch):
    body = client.get("/health").json()
    assert body["mode"] == "demo"
    assert body["intents_mode"] == "dry"
    monkeypatch.setenv("TRUSTLOCK_INTENTS_MODE", "nonsense")
    assert client.get("/health").json()["intents_mode"] == "dry"

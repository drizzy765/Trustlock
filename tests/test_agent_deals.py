"""Issue #4: POST /deals/draft, GET /deals/{deal_id} and the on-chain link, with a mocked RPC."""

import base64
import json
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

import app.chain as chain  # noqa: E402
import app.main as main  # noqa: E402

client = TestClient(main.app)
SECRET = "ed25519:5XampleSecretKeyThatMustNeverAppearAnywhere"
SEED = "abandon ability able about above absent absorb abstract absurd abuse access accident"
QR_HASH = "ab" * 32
DRAFT = {
    "seller_id": "seller-timi.testnet",
    "buyer_id": "buyer-ada.testnet",
    "rider_id": "rider-timi.testnet",
    "item": "black sandal",
    "price_ngn": 2500,
    "deadline_hours": 24,
    "qr_hash": QR_HASH,
}
ONCHAIN = {
    "seller": "seller-timi.testnet",
    "rider": "rider-timi.testnet",
    "buyer": "buyer-ada.testnet",
    "payer": None,
    "item": "black sandal",
    "price": "2500000",
    "deadline_ms": 1_900_000_000_000,
    "status": "Created",
    "qr_consumed": False,
}


@pytest.fixture(autouse=True)
def clean_agent(monkeypatch):
    """A fresh store, secrets present on the host, and no real network access."""
    monkeypatch.setattr(main, "deals_store", {})
    monkeypatch.setattr(main, "deal_counter", 0)
    monkeypatch.setenv("NEAR_PRIVATE_KEY", SECRET)
    monkeypatch.setenv("TRUSTLOCK_RIDER_PRIVATE_KEY", SECRET)
    monkeypatch.setenv("TRUSTLOCK_SEED_PHRASE", SEED)
    monkeypatch.setenv("NEAR_NODE_URL", "https://rpc.example.test")
    monkeypatch.delenv("TRUSTLOCK_CONTRACT_ID", raising=False)
    monkeypatch.setattr(chain, "_client", _transport(lambda request: pytest.fail("no RPC call")))


def _transport(handler):
    """A chain._client replacement that answers with `handler(request)`."""
    return lambda: httpx.Client(transport=httpx.MockTransport(handler))


def _rpc_returning(view, calls=None):
    """A NEAR RPC mock whose get_deal returns `view` (None for a missing deal)."""

    def handler(request):
        body = json.loads(request.content)
        if calls is not None:
            calls.append(body)
        raw = list(json.dumps(view).encode())
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {
            "result": raw, "logs": [], "block_height": 1, "block_hash": "x"}})

    return _transport(handler)


def _assert_no_secret(text):
    """No key, seed, rider secret or QR preimage in a response body."""
    for leak in (SECRET, "ed25519", SEED, "abandon ability", "qr_preimage", "NEAR_PRIVATE_KEY"):
        assert leak not in text


def test_create_then_fetch_without_a_contract():
    created = client.post("/deals/draft", json=DRAFT)
    assert created.status_code == 200
    draft = created.json()
    assert draft["deal_id"] == 1 and draft["status"] == "draft"
    assert draft["onchain_deal_id"] is None
    assert draft["qr_hash"] == QR_HASH and draft["rider_id"] == "rider-timi.testnet"

    fetched = client.get("/deals/1")
    assert fetched.status_code == 200
    body = fetched.json()
    assert {k: body[k] for k in DRAFT} == DRAFT
    assert body["onchain_status"] == "no_contract" and body["onchain"] is None
    assert body["agent_metadata"] == {"receipt_status": None, "intents_quote": None}
    _assert_no_secret(created.text + fetched.text)


def test_a_draft_never_gets_an_invented_onchain_id(monkeypatch):
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock.testnet")
    client.post("/deals/draft", json=DRAFT)
    body = client.get("/deals/1").json()
    assert body["onchain_status"] == "not_submitted"
    assert body["onchain_deal_id"] is None and body["onchain"] is None


def test_link_then_fetch_proxies_get_deal(monkeypatch):
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock.testnet")
    calls = []
    monkeypatch.setattr(chain, "_client", _rpc_returning(ONCHAIN, calls))
    client.post("/deals/draft", json=DRAFT)

    linked = client.post("/deals/1/onchain", json={"onchain_deal_id": 7})
    assert linked.status_code == 200
    assert linked.json()["onchain_deal_id"] == 7 and linked.json()["status"] == "submitted"

    body = client.get("/deals/1").json()
    assert body["onchain_status"] == "found" and body["onchain"] == ONCHAIN
    assert body["contract_id"] == "trustlock.testnet"
    params = calls[-1]["params"]
    assert params["account_id"] == "trustlock.testnet" and params["method_name"] == "get_deal"
    assert params["request_type"] == "call_function"
    assert json.loads(base64.b64decode(params["args_base64"])) == {"deal_id": 7}
    _assert_no_secret(linked.text + json.dumps(body) + json.dumps(calls))


def test_a_linked_deal_missing_on_chain_is_reported_not_hidden(monkeypatch):
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock.testnet")
    monkeypatch.setattr(chain, "_client", _rpc_returning(ONCHAIN))
    client.post("/deals/draft", json=DRAFT)
    client.post("/deals/1/onchain", json={"onchain_deal_id": 7})
    monkeypatch.setattr(chain, "_client", _rpc_returning(None))
    body = client.get("/deals/1").json()
    assert body["onchain_status"] == "missing" and body["onchain"] is None


@pytest.mark.parametrize(
    "handler",
    [
        lambda request: httpx.Response(503, text="node down"),
        lambda request: httpx.Response(200, json={"jsonrpc": "2.0", "id": "x", "error": {
            "name": "HANDLER_ERROR", "cause": {"name": "UNKNOWN_ACCOUNT"}}}),
        lambda request: httpx.Response(200, json={"jsonrpc": "2.0", "id": "x", "result": {
            "error": "wasm execution failed with error: MethodNotFound", "logs": []}}),
        lambda request: httpx.Response(200, text="<html>not json</html>"),
        lambda request: (_ for _ in ()).throw(httpx.ConnectTimeout("timed out")),
    ],
    ids=["http-503", "rpc-error", "contract-error", "not-json", "timeout"],
)
def test_rpc_failure_is_a_502_in_the_documented_shape(monkeypatch, handler):
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock.testnet")
    monkeypatch.setattr(chain, "_client", _rpc_returning(ONCHAIN))
    client.post("/deals/draft", json=DRAFT)
    client.post("/deals/1/onchain", json={"onchain_deal_id": 7})

    monkeypatch.setattr(chain, "_client", _transport(handler))
    response = client.get("/deals/1")
    assert response.status_code == 502
    assert set(response.json()) == {"error", "message"}
    assert response.json()["error"] == "ERR_RPC"
    linking = client.post("/deals/1/onchain", json={"onchain_deal_id": 8})
    assert linking.status_code == 409  # already linked: checked before any RPC call


def test_link_failure_on_rpc_does_not_record_the_id(monkeypatch):
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock.testnet")
    monkeypatch.setattr(chain, "_client", _transport(lambda r: httpx.Response(500)))
    client.post("/deals/draft", json=DRAFT)
    assert client.post("/deals/1/onchain", json={"onchain_deal_id": 7}).status_code == 502
    assert main.deals_store[1]["onchain_deal_id"] is None


@pytest.mark.parametrize(
    "onchain, code",
    [
        (None, "ERR_ONCHAIN_NOT_FOUND"),
        ({**ONCHAIN, "buyer": "someone-else.testnet"}, "ERR_ONCHAIN_MISMATCH"),
        ({**ONCHAIN, "rider": "other-rider.testnet"}, "ERR_ONCHAIN_MISMATCH"),
    ],
)
def test_link_refuses_a_deal_the_contract_does_not_back(monkeypatch, onchain, code):
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock.testnet")
    monkeypatch.setattr(chain, "_client", _rpc_returning(onchain))
    client.post("/deals/draft", json=DRAFT)
    response = client.post("/deals/1/onchain", json={"onchain_deal_id": 7})
    assert response.status_code == 409 and response.json()["error"] == code
    assert main.deals_store[1]["onchain_deal_id"] is None


def test_link_without_a_contract_or_twice_is_409(monkeypatch):
    client.post("/deals/draft", json=DRAFT)
    no_contract = client.post("/deals/1/onchain", json={"onchain_deal_id": 7})
    assert no_contract.status_code == 409 and no_contract.json()["error"] == "ERR_NO_CONTRACT"

    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock.testnet")
    monkeypatch.setattr(chain, "_client", _rpc_returning(ONCHAIN))
    assert client.post("/deals/1/onchain", json={"onchain_deal_id": 7}).status_code == 200
    again = client.post("/deals/1/onchain", json={"onchain_deal_id": 7})
    assert again.status_code == 409 and again.json()["error"] == "ERR_ALREADY_LINKED"


def test_unknown_deal_is_404_in_the_documented_shape():
    for response in (client.get("/deals/99"), client.post("/deals/99/onchain", json={
            "onchain_deal_id": 1})):
        assert response.status_code == 404
        assert response.json() == {
            "error": "ERR_DEAL_NOT_FOUND", "message": "No draft with deal_id 99."}


@pytest.mark.parametrize(
    "change",
    [
        {"price_ngn": 0},
        {"price_ngn": "2k5"},
        {"seller_id": "Not An Account!"},
        {"buyer_id": ""},
        {"item": ""},
        {"deadline_hours": 0},
        {"qr_hash": "1234"},
        {"private_key": SECRET},
        {"seed_phrase": SEED},
        {"qr_preimage": "deadbeef"},
        {"rider_access_key": SECRET},
    ],
)
def test_user_mistakes_are_400_and_nothing_is_stored_or_echoed(change):
    response = client.post("/deals/draft", json={**DRAFT, **change})
    assert response.status_code == 400
    body = response.json()
    assert set(body) == {"error", "message"} and body["error"] == "ERR_INVALID_INPUT"
    for value in change.values():
        if isinstance(value, str) and len(value) > 4:
            assert value not in response.text
    assert SECRET not in response.text and SEED not in response.text
    assert main.deals_store == {}


def test_the_agent_never_makes_or_keeps_a_qr_preimage():
    without_hash = {k: v for k, v in DRAFT.items() if k != "qr_hash"}
    created = client.post("/deals/draft", json=without_hash)
    assert created.status_code == 200 and created.json()["qr_hash"] is None
    stored = json.dumps(main.deals_store)
    assert "preimage" not in stored
    _assert_no_secret(created.text + client.get("/deals/1").text)

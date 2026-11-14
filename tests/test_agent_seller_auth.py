"""Seller agent writes need proof that the caller controls the seller's NEAR account (NEP-413)."""

import base64
import json
import os
import sys
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

from app import chain, main, seller_auth  # noqa: E402
from app.keystore import KEK_ENV  # noqa: E402
from seller_signing import Signer, install  # noqa: E402

client = TestClient(main.app)
REAL_VIEW_ACCESS_KEY = chain.view_access_key
SELLER = "adaora.testnet"
OTHER = "mallory.testnet"
KEY = "sk-ant-test-0123456789abcdefWXYZ"
OWNER = Signer()
ATTACKER = Signer()

WRITES = [
    ("PUT", f"/sellers/{SELLER}/agent", {"provider": "anthropic"}, "set_provider"),
    ("PUT", f"/sellers/{SELLER}/agent/key", {"api_key": KEY}, "set_key"),
    ("DELETE", f"/sellers/{SELLER}/agent/key", None, "delete_key"),
    ("POST", f"/sellers/{SELLER}/agent/test", None, "test"),
    ("POST", f"/sellers/{SELLER}/agent/ask", {"message": "hello"}, "ask"),
]


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    monkeypatch.setenv(KEK_ENV, base64.b64encode(os.urandom(32)).decode())
    monkeypatch.setenv("TRUSTLOCK_CONTRACT_ID", "trustlock-v2-timi.testnet")
    install(monkeypatch, OWNER, {SELLER})
    main.keys.clear()
    yield
    main.keys.clear()


def send(method, path, body, headers=None):
    return client.request(method, path, json=body, headers=headers or {})


@pytest.mark.parametrize("method,path,body,action", WRITES)
def test_unsigned_write_is_rejected(method, path, body, action):
    response = send(method, path, body)
    assert response.status_code == 401
    assert response.json()["error"] == "ERR_AUTH_REQUIRED"


@pytest.mark.parametrize("method,path,body,action", WRITES)
def test_another_accounts_key_is_rejected(method, path, body, action):
    response = send(method, path, body, ATTACKER.header(SELLER, action))
    assert response.status_code == 403
    assert response.json()["error"] == "ERR_NOT_OWNER"


@pytest.mark.parametrize("method,path,body,action", WRITES)
def test_owner_write_passes_auth(method, path, body, action):
    response = send(method, path, body, OWNER.header(SELLER, action))
    assert response.status_code not in (401, 403)


def test_attacker_cannot_overwrite_or_delete_a_saved_key():
    assert send("PUT", f"/sellers/{SELLER}/agent/key", {"api_key": KEY}, OWNER.header(SELLER, "set_key")).status_code == 200
    evil = send("PUT", f"/sellers/{SELLER}/agent/key", {"api_key": "sk-evil-00000000"}, ATTACKER.header(SELLER, "set_key"))
    gone = send("DELETE", f"/sellers/{SELLER}/agent/key", None)
    assert evil.status_code == 403 and gone.status_code == 401
    status = client.get(f"/sellers/{SELLER}/agent").json()
    assert status["key"] == {"saved": True, "masked": "****WXYZ"}
    assert KEY not in client.get(f"/sellers/{SELLER}/agent").text


def test_proof_for_one_seller_does_not_work_for_another(monkeypatch):
    install(monkeypatch, OWNER, {SELLER, OTHER})
    headers = OWNER.header(OTHER, "set_provider")
    response = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, headers)
    assert response.status_code == 401 and "another seller" in response.json()["message"]


def test_proof_for_one_action_does_not_work_for_another():
    response = send("DELETE", f"/sellers/{SELLER}/agent/key", None, OWNER.header(SELLER, "set_provider"))
    assert response.status_code == 401


def test_replayed_proof_is_rejected():
    headers = OWNER.header(SELLER, "set_provider")
    first = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, headers)
    again = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, headers)
    assert first.status_code == 200
    assert again.status_code == 401 and again.json()["error"] == "ERR_AUTH_REPLAY"


def test_old_proof_is_rejected():
    stale = int(time.time() * 1000) - 6 * 60 * 1000
    response = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, OWNER.header(SELLER, "set_provider", timestamp=stale))
    assert response.status_code == 401 and response.json()["error"] == "ERR_AUTH_EXPIRED"


def test_future_proof_is_rejected():
    future = int(time.time() * 1000) + 10 * 60 * 1000
    response = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, OWNER.header(SELLER, "set_provider", timestamp=future))
    assert response.status_code == 401


def test_wrong_recipient_is_rejected():
    headers = OWNER.header(SELLER, "set_provider", recipient="some-other-app")
    response = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, headers)
    assert response.status_code == 401 and "another app" in response.json()["message"]


def test_tampered_message_is_rejected():
    proof = json.loads(base64.b64decode(OWNER.header(SELLER, "set_provider")[seller_auth.HEADER]))
    proof["message"] = proof["message"].replace(SELLER, OTHER)
    headers = {seller_auth.HEADER: base64.b64encode(json.dumps(proof).encode()).decode()}
    response = send("PUT", f"/sellers/{OTHER}/agent", {"provider": "builtin"}, headers)
    assert response.status_code == 401


@pytest.mark.parametrize("junk", ["", "not-base64!!", base64.b64encode(b"[]").decode(), base64.b64encode(b'{"public_key":"x"}').decode()])
def test_garbage_header_is_rejected(junk):
    response = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, {seller_auth.HEADER: junk})
    assert response.status_code == 401


def test_function_call_key_for_trustlock_counts(monkeypatch):
    install(monkeypatch, OWNER, {SELLER}, permission={"FunctionCall": {"allowance": None, "receiver_id": "trustlock-v2-timi.testnet", "method_names": []}})
    assert send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, OWNER.header(SELLER, "set_provider")).status_code == 200


def test_function_call_key_for_another_contract_does_not_count(monkeypatch):
    install(monkeypatch, OWNER, {SELLER}, permission={"FunctionCall": {"allowance": None, "receiver_id": "game.testnet", "method_names": []}})
    assert send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, OWNER.header(SELLER, "set_provider")).status_code == 403


def test_full_access_only_mode(monkeypatch):
    monkeypatch.setenv("TRUSTLOCK_AUTH_FULL_ACCESS_ONLY", "1")
    install(monkeypatch, OWNER, {SELLER}, permission={"FunctionCall": {"allowance": None, "receiver_id": "trustlock-v2-timi.testnet", "method_names": []}})
    assert send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, OWNER.header(SELLER, "set_provider")).status_code == 403


def test_reads_stay_public_and_never_show_the_key():
    send("PUT", f"/sellers/{SELLER}/agent/key", {"api_key": KEY}, OWNER.header(SELLER, "set_key"))
    response = client.get(f"/sellers/{SELLER}/agent")
    assert response.status_code == 200 and KEY not in response.text and KEY[:-4] not in response.text


def test_nep413_hash_matches_the_spec_layout():
    nonce = bytes(range(32))
    digest = seller_auth.nep413_hash("hi", nonce, "app")
    import hashlib, struct
    expected = struct.pack("<I", 2**31 + 413) + struct.pack("<I", 2) + b"hi" + nonce + struct.pack("<I", 3) + b"app" + b"\x00"
    assert digest == hashlib.sha256(expected).digest()


def test_base58_round_trip():
    for data in (b"", b"\x00\x00abc", os.urandom(32)):
        assert seller_auth.b58decode(seller_auth.b58encode(data)) == data


# --- the RPC lookup itself ---------------------------------------------------------------------


def _rpc(monkeypatch, body):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
    monkeypatch.setattr(chain, "_client", lambda: httpx.Client(transport=transport))


def test_view_access_key_full_access(monkeypatch):
    _rpc(monkeypatch, {"jsonrpc": "2.0", "result": {"nonce": 1, "permission": "FullAccess"}})
    assert REAL_VIEW_ACCESS_KEY(SELLER, OWNER.public_key) == "FullAccess"


def test_view_access_key_missing_key_old_shape(monkeypatch):
    _rpc(monkeypatch, {"jsonrpc": "2.0", "result": {"error": "access key ed25519:x does not exist while viewing", "logs": []}})
    assert REAL_VIEW_ACCESS_KEY(SELLER, OWNER.public_key) is None


def test_view_access_key_missing_key_new_shape(monkeypatch):
    _rpc(monkeypatch, {"jsonrpc": "2.0", "error": {"cause": {"name": "UNKNOWN_ACCESS_KEY"}}})
    assert REAL_VIEW_ACCESS_KEY(SELLER, OWNER.public_key) is None


def test_view_access_key_other_error_is_rpc_error(monkeypatch):
    _rpc(monkeypatch, {"jsonrpc": "2.0", "error": {"cause": {"name": "INTERNAL_ERROR"}}})
    with pytest.raises(chain.RpcError):
        REAL_VIEW_ACCESS_KEY(SELLER, OWNER.public_key)


def test_rpc_failure_is_502(monkeypatch):
    def boom(account_id, public_key):
        raise chain.RpcError("down")
    monkeypatch.setattr(seller_auth.chain, "view_access_key", boom)
    response = send("PUT", f"/sellers/{SELLER}/agent", {"provider": "builtin"}, OWNER.header(SELLER, "set_provider"))
    assert response.status_code == 502


# --- CORS and OpenAPI ----------------------------------------------------------------------------


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_cors_preflight_allows_writes_and_auth_header(method):
    response = client.options(
        f"/sellers/{SELLER}/agent/key",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "content-type,x-trustlock-auth"},
    )
    assert response.status_code == 200
    assert method in response.headers["access-control-allow-methods"]
    assert "x-trustlock-auth" in response.headers["access-control-allow-headers"].lower()


def test_cors_still_rejects_unknown_origins():
    response = client.options(f"/sellers/{SELLER}/agent", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "PUT"})
    assert "access-control-allow-origin" not in response.headers


def test_openapi_lists_the_public_server():
    servers = client.get("/openapi.json").json()["servers"]
    assert servers[0]["url"].startswith("https://")

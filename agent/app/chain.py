"""Read-only NEAR RPC client: the agent can view a deal, never sign or send a transaction."""

from __future__ import annotations

import base64
import json
import os
from typing import Any

import httpx

DEFAULT_RPC = {
    "mainnet": "https://rpc.mainnet.near.org",
    "testnet": "https://rpc.testnet.near.org",
}
TIMEOUT_SECONDS = 10.0


class RpcError(Exception):
    """The RPC node could not be reached or did not return a usable answer."""


def contract_id() -> str:
    """The configured TrustLock contract, or an empty string when none is set."""
    return os.environ.get("TRUSTLOCK_CONTRACT_ID", "").strip()


def rpc_url() -> str:
    """NEAR_NODE_URL if set, otherwise the public RPC of NEAR_NETWORK (testnet by default)."""
    network = os.environ.get("NEAR_NETWORK", "testnet").strip().lower()
    return os.environ.get("NEAR_NODE_URL", "").strip() or DEFAULT_RPC.get(
        network, DEFAULT_RPC["testnet"]
    )


def _client() -> httpx.Client:
    """The HTTP client for RPC calls. Tests replace it with a mock transport."""
    return httpx.Client(timeout=TIMEOUT_SECONDS)


def view_deal(contract: str, deal_id: int) -> dict[str, Any] | None:
    """The contract's `get_deal(deal_id)` view, or None if the contract has no such deal."""
    args = base64.b64encode(json.dumps({"deal_id": deal_id}).encode()).decode()
    payload = {
        "jsonrpc": "2.0",
        "id": "trustlock-agent",
        "method": "query",
        "params": {
            "request_type": "call_function",
            "finality": "final",
            "account_id": contract,
            "method_name": "get_deal",
            "args_base64": args,
        },
    }
    try:
        with _client() as client:
            response = client.post(rpc_url(), json=payload)
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RpcError(f"RPC request failed ({type(exc).__name__})") from exc

    if body.get("error"):
        raise RpcError("RPC returned an error for get_deal")
    result = body.get("result") or {}
    if result.get("error") or "result" not in result:
        raise RpcError("get_deal did not return a result")
    try:
        return json.loads(bytes(result["result"]).decode() or "null")
    except (TypeError, ValueError) as exc:
        raise RpcError("get_deal returned bytes that are not JSON") from exc


def view_access_key(account_id: str, public_key: str) -> Any | None:
    """The permission of `public_key` on `account_id` ("FullAccess" or {"FunctionCall": ...}),
    or None when the account has no such key (or does not exist)."""
    payload = {
        "jsonrpc": "2.0",
        "id": "trustlock-agent",
        "method": "query",
        "params": {
            "request_type": "view_access_key",
            "finality": "final",
            "account_id": account_id,
            "public_key": public_key,
        },
    }
    try:
        with _client() as client:
            response = client.post(rpc_url(), json=payload)
        body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RpcError(f"RPC request failed ({type(exc).__name__})") from exc

    error = body.get("error")
    if error:
        cause = (error.get("cause") or {}).get("name", "") if isinstance(error, dict) else ""
        if cause in ("UNKNOWN_ACCESS_KEY", "UNKNOWN_ACCOUNT"):
            return None
        raise RpcError("RPC returned an error for view_access_key")
    result = body.get("result") or {}
    if result.get("error"):  # older nodes: "access key ... does not exist while viewing"
        return None
    if "permission" not in result:
        raise RpcError("view_access_key did not return a permission")
    return result["permission"]

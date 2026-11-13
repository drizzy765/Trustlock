"""1Click / NEAR Intents client.

There is no Intents testnet (HACKATHON.md Q-007), so the default mode is `dry`: the
client asks 1Click for a real quote with `dry: true` and gets back no deposit address
and no transaction hash. Every quote's ed25519 signature is verified with the manager
key that 1Click publishes before an amount is returned to the caller.

`live` is real mainnet. It stays tiny (well under $1 USDC), requires explicit real
addresses in the environment, and execution itself is still a separate issue. Nothing
here can move funds.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

DEFAULT_API_URL = "https://1click.chaindefuser.com"
# The manager key published in the official 1Click TypeScript SDK's quote-signature
# module (0.1.24+). Overridable only because 1Click may rotate it.
DEFAULT_MANAGER_KEY = "ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc"

USDC_ON_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
USDC_ON_BASE = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near"

# Dry quotes never move money, but keep the request bounded anyway. Live quotes are
# capped at 0.50 USDC: a coffee-sized mainnet test, well under the $1 ceiling.
MAX_DRY_UNITS = 100_000_000  # 100 USDC, in 6-decimal base units
MAX_LIVE_UNITS = 500_000  # 0.50 USDC
TIMEOUT_SECONDS = 20.0
DEADLINE_MINUTES = 30

# A placeholder refund address for dry quotes only. Live mode refuses to run without
# a real one, so this can never silently receive (or lose) funds.
DRY_REFUND_PLACEHOLDER = "0x1111111111111111111111111111111111111111"

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

# The exact fields the official SDK signs. Extra fields 1Click echoes back (appFees,
# confidentiality, depositMode, insured...) are deliberately not signed and are not
# fed to the verifier.
_SIGNED_REQUEST_FIELDS = (
    "dry",
    "swapType",
    "slippageTolerance",
    "originAsset",
    "depositType",
    "destinationAsset",
    "amount",
    "refundTo",
    "refundType",
    "recipient",
    "recipientType",
    "deadline",
)
_SIGNED_REQUEST_OPTIONAL = (
    "quoteWaitingTimeMs",
    "referral",
    "virtualChainRecipient",
    "virtualChainRefundRecipient",
    "customRecipientMsg",
)
_DRY_QUOTE_FIELDS = (
    "amountIn",
    "amountInFormatted",
    "amountInUsd",
    "minAmountIn",
    "amountOut",
    "amountOutFormatted",
    "amountOutUsd",
    "minAmountOut",
)
_FULL_QUOTE_FIELDS = _DRY_QUOTE_FIELDS + (
    "depositAddress",
    "depositMemo",
    "deadline",
    "timeWhenInactive",
    "timeEstimate",
    "refundFee",
    "withdrawFee",
)


class IntentsError(Exception):
    """An error the HTTP layer turns into {"error": code, "message": message}."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def mode() -> str:
    """demo | dry | live. Anything unexpected fails safe to `dry`."""
    value = os.environ.get("TRUSTLOCK_INTENTS_MODE", "dry").strip().lower()
    return value if value in {"demo", "dry", "live"} else "dry"


def api_url() -> str:
    return os.environ.get("ONECLICK_API_URL", DEFAULT_API_URL).strip().rstrip("/") or DEFAULT_API_URL


def manager_key() -> str:
    return os.environ.get("ONECLICK_MANAGER_PUBLIC_KEY", DEFAULT_MANAGER_KEY).strip() or DEFAULT_MANAGER_KEY


def _client() -> httpx.Client:
    """The HTTP client for 1Click calls. Tests replace this with a mock transport."""
    return httpx.Client(timeout=TIMEOUT_SECONDS)


def _now() -> datetime:
    """Current time. Tests freeze this so a recorded quote is not 'expired' mid-run."""
    return datetime.now(timezone.utc)


def _live() -> bool:
    return mode() == "live"


def _origin_asset() -> str:
    return os.environ.get("ONECLICK_ORIGIN_ASSET", "").strip() or USDC_ON_BASE


def _destination_asset() -> str:
    return os.environ.get("ONECLICK_DESTINATION_ASSET", "").strip() or USDC_ON_NEAR


def _recipient() -> str:
    return (
        os.environ.get("TRUSTLOCK_INTENTS_RECIPIENT", "").strip()
        or os.environ.get("TRUSTLOCK_CONTRACT_ID", "").strip()
        or "trustlock-timi.testnet"
    )


def _recipient_type() -> str:
    return os.environ.get("TRUSTLOCK_INTENTS_RECIPIENT_TYPE", "INTENTS").strip() or "INTENTS"


def _refund_to() -> str:
    return os.environ.get("TRUSTLOCK_INTENTS_REFUND_TO", "").strip() or DRY_REFUND_PLACEHOLDER


def _refund_type() -> str:
    return os.environ.get("TRUSTLOCK_INTENTS_REFUND_TYPE", "ORIGIN_CHAIN").strip() or "ORIGIN_CHAIN"


def _deadline() -> str:
    return (
        (_now() + timedelta(minutes=DEADLINE_MINUTES))
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _units(amount: str) -> int:
    """Validate a base-unit USDC amount string and enforce the mode's ceiling."""
    if not isinstance(amount, str) or not re.fullmatch(r"[1-9][0-9]{0,15}", amount):
        raise IntentsError(400, "ERR_INVALID_AMOUNT", "amount must be a positive integer in USDC base units.")
    units = int(amount)
    cap = MAX_LIVE_UNITS if _live() else MAX_DRY_UNITS
    if units > cap:
        limit = "0.50" if _live() else "100"
        raise IntentsError(
            400,
            "ERR_AMOUNT_TOO_LARGE",
            f"{mode()} quotes are capped at {limit} USDC; refusing {units / 1_000_000:.6f} USDC.",
        )
    return units


def _require_live_config() -> None:
    """Live mode must never fall back to the documented dry placeholder addresses."""
    missing = [
        name
        for name in ("TRUSTLOCK_INTENTS_RECIPIENT", "TRUSTLOCK_INTENTS_REFUND_TO")
        if not os.environ.get(name, "").strip()
    ]
    if missing:
        raise IntentsError(
            503,
            "ERR_INTENTS_CONFIG",
            "Live quotes need a real recipient and refund address: set " + ", ".join(missing) + ".",
        )


def build_request(amount: str) -> dict[str, Any]:
    """The 1Click quote body. Dry is forced for demo and dry modes."""
    return {
        "dry": not _live(),
        "swapType": "EXACT_INPUT",
        "slippageTolerance": 100,
        "originAsset": _origin_asset(),
        "depositType": "ORIGIN_CHAIN",
        "destinationAsset": _destination_asset(),
        "amount": amount,
        "refundTo": _refund_to(),
        "refundType": _refund_type(),
        "recipient": _recipient(),
        "recipientType": _recipient_type(),
        "deadline": _deadline(),
    }


def _b58encode(raw: bytes) -> str:
    number = int.from_bytes(raw, "big")
    encoded = ""
    while number:
        number, remainder = divmod(number, 58)
        encoded = _B58_ALPHABET[remainder] + encoded
    pad = len(raw) - len(raw.lstrip(b"\x00"))
    return "1" * pad + encoded


def _b58decode(text: str) -> bytes:
    number = 0
    for character in text:
        try:
            number = number * 58 + _B58_ALPHABET.index(character)
        except ValueError:
            raise ValueError("not base58") from None
    body = number.to_bytes((number.bit_length() + 7) // 8, "big") if number else b""
    pad = len(text) - len(text.lstrip("1"))
    return b"\x00" * pad + body


def _decode_key(value: Any, label: str) -> bytes:
    if not isinstance(value, str) or not value.startswith("ed25519:"):
        raise ValueError(f"{label} is not an ed25519 key")
    return _b58decode(value[len("ed25519:") :])


def _stable_json(value: dict[str, Any]) -> str:
    """json-stable-stringify equivalent: sorted keys, no whitespace, raw unicode."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _signed_payload(response: dict[str, Any]) -> dict[str, Any]:
    """The exact object 1Click signs, rebuilt from its quote response (SDK 0.1.24+)."""
    quote_request = response.get("quoteRequest")
    quote = response.get("quote")
    if not isinstance(quote_request, dict) or not isinstance(quote, dict):
        raise ValueError("quote response is missing quoteRequest or quote")
    dry = quote_request.get("dry")
    if not isinstance(dry, bool):
        raise ValueError("quoteRequest.dry is not a boolean")

    request: dict[str, Any] = {}
    for field in _SIGNED_REQUEST_FIELDS:
        value = quote_request.get(field)
        if field == "dry" or value is not None:
            request[field] = value
    for field in _SIGNED_REQUEST_OPTIONAL:
        # The SDK keeps these only when truthy, so 0/empty are dropped.
        value = quote_request.get(field)
        if value:
            request[field] = value

    signed_quote: dict[str, Any] = {}
    for field in _DRY_QUOTE_FIELDS if dry else _FULL_QUOTE_FIELDS:
        value = quote.get(field)
        if dry:
            if value is not None:
                signed_quote[field] = value
        elif value:
            signed_quote[field] = value

    timestamp = response.get("timestamp")
    if not isinstance(timestamp, str) or not timestamp:
        raise ValueError("quote response is missing timestamp")
    return {**request, **signed_quote, "timestamp": timestamp}


def verify_quote(response: Any) -> str:
    """Verify 1Click's signature and return the base58 quote hash (the quote id).

    Raises IntentsError(502, ERR_BAD_QUOTE_SIGNATURE) for anything tampered with,
    unsigned, or not shaped like a 1Click quote. Callers must not display amounts
    unless this function succeeded.
    """
    try:
        if not isinstance(response, dict):
            raise ValueError("quote response is not an object")
        signature = response.get("signature")
        if not isinstance(signature, str) or not signature:
            raise ValueError("quote response has no signature")
        payload = _signed_payload(response)
        digest = _b58encode(hashlib.sha256(_stable_json(payload).encode("utf-8")).digest())
        public_key = Ed25519PublicKey.from_public_bytes(_decode_key(manager_key(), "manager key"))
        public_key.verify(_decode_key(signature, "signature"), digest.encode("ascii"))
        return digest
    except (InvalidSignature, ValueError, TypeError, KeyError):
        raise IntentsError(
            502,
            "ERR_BAD_QUOTE_SIGNATURE",
            "The 1Click quote signature did not verify, so no amount is shown.",
        ) from None


def _assert_echo(response: dict[str, Any], request: dict[str, Any]) -> None:
    """A signed quote is only usable if it is the quote we asked for."""
    quote_request = response.get("quoteRequest") or {}
    for field in ("dry", "originAsset", "destinationAsset", "amount", "recipient", "refundTo"):
        if quote_request.get(field) != request.get(field):
            raise IntentsError(
                502,
                "ERR_QUOTE_MISMATCH",
                f"1Click returned a quote for a different {field}; refusing to show it.",
            )


def _expired(deadline: Any) -> bool:
    if not isinstance(deadline, str) or not deadline:
        return True
    try:
        when = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
    except ValueError:
        return True
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when <= _now()


def _summary(response: dict[str, Any], request: dict[str, Any], quote_id: str) -> dict[str, Any]:
    """The quote as the API and the UI may show it: flattened, labelled, no tx hash."""
    quote = response.get("quote") or {}
    dry = not _live()
    deadline = (response.get("quoteRequest") or {}).get("deadline")
    return {
        "mode": mode(),
        "dry": dry,
        "quote_id": quote_id,
        "correlation_id": response.get("correlationId"),
        "signature": response.get("signature"),
        "signer": manager_key(),
        "signature_verified": True,
        "origin_asset": request["originAsset"],
        "destination_asset": request["destinationAsset"],
        "recipient": request["recipient"],
        "amount_in": quote.get("amountIn"),
        "amount_in_formatted": quote.get("amountInFormatted"),
        "amount_in_usd": quote.get("amountInUsd"),
        "amount_out": quote.get("amountOut"),
        "amount_out_formatted": quote.get("amountOutFormatted"),
        "amount_out_usd": quote.get("amountOutUsd"),
        "min_amount_out": quote.get("minAmountOut"),
        "deadline": deadline,
        "expired": _expired(deadline),
        # 1Click omits these for dry quotes. Keep the fields explicit so no caller
        # can mistake a quote for a transaction.
        "deposit_address": None if dry else quote.get("depositAddress"),
        "tx_hash": None,
        "executed": False,
        "created_at": _now().isoformat(timespec="seconds"),
    }


def quote(amount: str) -> dict[str, Any]:
    """Ask 1Click for a quote and return it only after verifying the signature."""
    units = _units(amount)
    if _live():
        _require_live_config()
    request = build_request(str(units))
    headers = {"Content-Type": "application/json"}
    jwt = os.environ.get("ONECLICK_JWT", "").strip()
    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"

    try:
        with _client() as client:
            response = client.post(f"{api_url()}/v0/quote", json=request, headers=headers)
    except httpx.HTTPError as exc:
        raise IntentsError(
            502,
            "ERR_INTENTS_UPSTREAM",
            f"Could not reach 1Click ({type(exc).__name__}). No amount is shown.",
        ) from exc

    if response.status_code >= 400:
        raise IntentsError(
            502,
            "ERR_INTENTS_UPSTREAM",
            f"1Click refused the quote (HTTP {response.status_code}). No amount is shown.",
        )
    try:
        payload = response.json()
    except ValueError:
        raise IntentsError(
            502,
            "ERR_INTENTS_UPSTREAM",
            "1Click returned something that is not JSON. No amount is shown.",
        ) from None

    quote_id = verify_quote(payload)
    _assert_echo(payload, request)
    return _summary(payload, request, quote_id)


def execute(deal_id: int) -> dict[str, Any]:
    """Execute is gated twice: mode must be live, and 1Click submission is not wired yet."""
    if not _live():
        raise IntentsError(
            409,
            "ERR_NOT_LIVE",
            "execute is disabled unless TRUSTLOCK_INTENTS_MODE=live.",
        )
    raise IntentsError(
        501,
        "ERR_LIVE_NOT_WIRED",
        "Live 1Click execution is a separate optional issue; this build never broadcasts a mainnet transfer.",
    )

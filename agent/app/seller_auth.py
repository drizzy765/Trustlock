"""Proof that a caller controls a seller's NEAR account, for the seller agent write endpoints.

The caller signs a NEP-413 message (https://github.com/near/NEPs/blob/master/neps/nep-0413.md)
with an ed25519 access key of the seller account and sends it in the ``X-TrustLock-Auth``
header as base64 of ``{"public_key", "signature", "nonce", "message"}``:

* ``message`` is JSON ``{"action", "seller_id", "timestamp"}`` (timestamp in ms since epoch);
* ``nonce`` is 32 random bytes (base64), single use;
* the signed bytes are ``sha256(borsh(2**31 + 413) || borsh(message, nonce, recipient, None))``
  with ``recipient`` = ``TRUSTLOCK_AUTH_RECIPIENT`` (default ``trustlock-agent``).

The agent checks the signature, the action, the seller, the age (5 minutes), that the nonce was
not seen before, and then asks NEAR RPC (``view_access_key``) whether that public key is on the
seller account. A full-access key always counts. A function-call key counts only when it is
scoped to the TrustLock contract (``TRUSTLOCK_CONTRACT_ID``): that key is created by the seller's
own wallet when they sign in to Podlock, so holding it proves the same thing. Set
``TRUSTLOCK_AUTH_FULL_ACCESS_ONLY=1`` to accept full-access keys only.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import struct
import threading
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from . import chain

NEP413_TAG = 2**31 + 413
MAX_AGE_MS = 5 * 60 * 1000
MAX_FUTURE_SKEW_MS = 60 * 1000
NONCE_BYTES = 32
HEADER = "X-TrustLock-Auth"
ACTIONS = ("set_provider", "set_key", "delete_key", "test", "ask")

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


class AuthError(Exception):
    """A rejected proof. The message never repeats the signature or key."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def b58decode(text: str) -> bytes:
    num = 0
    for ch in text:
        index = _B58.find(ch)
        if index < 0:
            raise ValueError("not base58")
        num = num * 58 + index
    body = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    pad = len(text) - len(text.lstrip("1"))
    return b"\x00" * pad + body


def b58encode(data: bytes) -> str:
    num = int.from_bytes(data, "big")
    out = ""
    while num:
        num, rem = divmod(num, 58)
        out = _B58[rem] + out
    pad = len(data) - len(data.lstrip(b"\x00"))
    return "1" * pad + out


def recipient() -> str:
    return os.environ.get("TRUSTLOCK_AUTH_RECIPIENT", "").strip() or "trustlock-agent"


def _borsh_string(value: str) -> bytes:
    raw = value.encode()
    return struct.pack("<I", len(raw)) + raw


def nep413_hash(message: str, nonce: bytes, recipient_id: str, callback_url: str | None = None) -> bytes:
    """The 32 bytes a NEP-413 signer signs."""
    payload = _borsh_string(message) + nonce + _borsh_string(recipient_id)
    payload += b"\x00" if callback_url is None else b"\x01" + _borsh_string(callback_url)
    return hashlib.sha256(struct.pack("<I", NEP413_TAG) + payload).digest()


class NonceCache:
    """Nonces seen in the last MAX_AGE_MS, so a captured proof cannot be replayed."""

    def __init__(self) -> None:
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def use(self, key: str, now_ms: float) -> bool:
        """True the first time a nonce is used; False for a replay."""
        with self._lock:
            cutoff = now_ms - MAX_AGE_MS - MAX_FUTURE_SKEW_MS
            for old in [k for k, t in self._seen.items() if t < cutoff]:
                del self._seen[old]
            if key in self._seen:
                return False
            self._seen[key] = now_ms
            return True

    def clear(self) -> None:
        with self._lock:
            self._seen.clear()


nonces = NonceCache()


def _invalid(why: str) -> AuthError:
    return AuthError(401, "ERR_AUTH_INVALID", f"Ownership proof rejected: {why}.")


def _decode(header: str) -> tuple[str, bytes, bytes, bytes, str]:
    try:
        proof = json.loads(base64.b64decode(header, validate=True))
        public_key = proof["public_key"]
        signature = base64.b64decode(proof["signature"], validate=True)
        nonce = base64.b64decode(proof["nonce"], validate=True)
        message = proof["message"]
    except (binascii.Error, ValueError, KeyError, TypeError):
        raise _invalid("the header is not a valid proof") from None
    if not isinstance(public_key, str) or not public_key.startswith("ed25519:"):
        raise _invalid("only ed25519 keys are supported")
    if not isinstance(message, str) or len(message) > 512:
        raise _invalid("bad message")
    try:
        key_bytes = b58decode(public_key.removeprefix("ed25519:"))
    except ValueError:
        raise _invalid("bad public key") from None
    if len(key_bytes) != 32 or len(signature) != 64 or len(nonce) != NONCE_BYTES:
        raise _invalid("wrong key, signature or nonce length")
    return public_key, key_bytes, signature, nonce, message


def _key_counts(permission: object) -> bool:
    if permission == "FullAccess":
        return True
    if os.environ.get("TRUSTLOCK_AUTH_FULL_ACCESS_ONLY", "").strip() in ("1", "true", "yes"):
        return False
    contract = chain.contract_id()
    if not contract or not isinstance(permission, dict):
        return False
    function_call = permission.get("FunctionCall") or {}
    return function_call.get("receiver_id") == contract


def verify(header: str | None, seller_id: str, action: str, now_ms: float | None = None) -> str:
    """Return the verified public key, or raise AuthError."""
    if not header:
        raise AuthError(
            401, "ERR_AUTH_REQUIRED", f"Sign this request with your NEAR wallet ({HEADER} header)."
        )
    public_key, key_bytes, signature, nonce, message = _decode(header)
    try:
        Ed25519PublicKey.from_public_bytes(key_bytes).verify(
            signature, nep413_hash(message, nonce, recipient())
        )
    except InvalidSignature:
        raise _invalid("the signature does not match") from None
    try:
        fields = json.loads(message)
        signed_action, signed_seller, timestamp = fields["action"], fields["seller_id"], fields["timestamp"]
    except (ValueError, KeyError, TypeError):
        raise _invalid("the signed message is not Podlock JSON") from None
    if signed_action != action or signed_seller != seller_id:
        raise _invalid("it was signed for another action or seller")
    now_ms = time.time() * 1000 if now_ms is None else now_ms
    if not isinstance(timestamp, (int, float)) or timestamp > now_ms + MAX_FUTURE_SKEW_MS:
        raise _invalid("bad timestamp")
    if now_ms - timestamp > MAX_AGE_MS:
        raise AuthError(401, "ERR_AUTH_EXPIRED", "Ownership proof is older than 5 minutes; sign again.")
    try:
        permission = chain.view_access_key(seller_id, public_key)
    except chain.RpcError as exc:
        raise AuthError(502, "ERR_RPC", f"Could not check the key on NEAR: {exc}.") from exc
    if permission is None or not _key_counts(permission):
        raise AuthError(403, "ERR_NOT_OWNER", "That key is not a Podlock or full-access key of this account.")
    if not nonces.use(f"{public_key}:{nonce.hex()}", now_ms):
        raise AuthError(401, "ERR_AUTH_REPLAY", "This proof was already used; sign again.")
    return public_key

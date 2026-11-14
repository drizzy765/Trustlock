"""Test helper: sign seller-agent requests like the web does (wallet NEP-413 over an ed25519 key)."""

import base64
import json
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app import seller_auth


class Signer:
    def __init__(self) -> None:
        self.private = Ed25519PrivateKey.generate()
        raw = self.private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        self.public_key = "ed25519:" + seller_auth.b58encode(raw)

    def header(self, seller_id, action=None, *, nonce=None, recipient=None, message=None,
               public_key=None, account_id=None):
        """A header for the signMessage envelope. `action` is accepted and ignored."""
        nonce = nonce if nonce is not None else os.urandom(32)
        account = seller_id if account_id is None else account_id
        if message is None:
            message = seller_auth.canonical_message(account)
        digest = seller_auth.nep413_hash(message, nonce, recipient or seller_auth.recipient())
        proof = {
            "account_id": account,
            "message": message,
            "nonce": base64.b64encode(nonce).decode(),
            "recipient": recipient or seller_auth.recipient(),
            "public_key": public_key or self.public_key,
            "signature": base64.b64encode(self.private.sign(digest)).decode(),
        }
        return {seller_auth.HEADER: base64.b64encode(json.dumps(proof).encode()).decode()}


def action_for(method, path):
    """The seller for a /sellers/{id}/agent... write, or None for reads."""
    parts = path.strip("/").split("/")
    if len(parts) < 3 or parts[0] != "sellers" or method.upper() == "GET":
        return None
    return parts[1], parts[-1]


def install(monkeypatch, signer, owners, permission="FullAccess"):
    """Make RPC report `signer`'s key on every account in `owners`."""
    def view_access_key(account_id, public_key):
        if account_id in owners and public_key == signer.public_key:
            return permission
        return None

    monkeypatch.setattr(seller_auth.chain, "view_access_key", view_access_key)
    seller_auth.nonces.clear()


class SigningClient:
    """A TestClient wrapper that signs every seller-agent write as the owner would."""

    def __init__(self, client, signer):
        self.client, self.signer = client, signer

    def request(self, method, path, **kwargs):
        target = action_for(method, path)
        if target and target[1]:
            kwargs["headers"] = {**kwargs.get("headers", {}), **self.signer.header(*target)}
        return self.client.request(method, path, **kwargs)

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, **kw):
        return self.request("POST", path, **kw)

    def put(self, path, **kw):
        return self.request("PUT", path, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)

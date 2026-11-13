"""Seller AI-provider keys, encrypted at rest (envelope encryption).

Each saved key gets its own random data key (AES-256-GCM). The data key is wrapped with the
key-encryption key from ``TRUSTLOCK_KEY_ENCRYPTION_KEY`` (32 bytes, base64; supplied by Doppler
or Infisical, never committed). The seller id is bound as associated data, so a sealed key moved
to another seller does not decrypt. The plaintext exists only inside ``KeyStore.use_key``.

Storage is in memory, like the deal drafts: a restart forgets every saved key.
"""

from __future__ import annotations

import base64
import binascii
import os
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEK_ENV = "TRUSTLOCK_KEY_ENCRYPTION_KEY"
NONCE_BYTES = 12


class KeyStoreError(Exception):
    """A key-handling failure. Its message never contains key material."""


def _kek() -> bytes:
    raw = os.environ.get(KEK_ENV, "")
    if not raw:
        raise KeyStoreError(f"{KEK_ENV} is not set, so seller keys cannot be stored.")
    try:
        kek = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise KeyStoreError(f"{KEK_ENV} is not valid base64.") from None
    if len(kek) != 32:
        raise KeyStoreError(f"{KEK_ENV} must decode to 32 bytes.")
    return kek


@dataclass(frozen=True)
class Sealed:
    wrapped_dek: bytes = field(repr=False)
    dek_nonce: bytes = field(repr=False)
    ciphertext: bytes = field(repr=False)
    nonce: bytes = field(repr=False)
    last4: str


def seal(seller_id: str, api_key: str) -> Sealed:
    aad = seller_id.encode()
    dek = AESGCM.generate_key(bit_length=256)
    nonce, dek_nonce = os.urandom(NONCE_BYTES), os.urandom(NONCE_BYTES)
    ciphertext = AESGCM(dek).encrypt(nonce, api_key.encode(), aad)
    wrapped = AESGCM(_kek()).encrypt(dek_nonce, dek, aad)
    return Sealed(wrapped, dek_nonce, ciphertext, nonce, api_key[-4:])


def unseal(seller_id: str, sealed: Sealed) -> str:
    aad = seller_id.encode()
    try:
        dek = AESGCM(_kek()).decrypt(sealed.dek_nonce, sealed.wrapped_dek, aad)
        return AESGCM(dek).decrypt(sealed.nonce, sealed.ciphertext, aad).decode()
    except InvalidTag:
        raise KeyStoreError("The saved key could not be decrypted; save it again.") from None


def mask(last4: str) -> str:
    return "****" + last4


@dataclass
class SellerAgent:
    provider: str = "builtin"
    key: Sealed | None = None


class KeyStore:
    def __init__(self) -> None:
        self._sellers: dict[str, SellerAgent] = {}

    def get(self, seller_id: str) -> SellerAgent:
        return self._sellers.setdefault(seller_id, SellerAgent())

    def set_provider(self, seller_id: str, provider: str) -> None:
        self.get(seller_id).provider = provider

    def set_key(self, seller_id: str, api_key: str) -> None:
        """Save or rotate the key: the old ciphertext and data key are dropped."""
        self.get(seller_id).key = seal(seller_id, api_key)

    def delete_key(self, seller_id: str) -> bool:
        agent = self.get(seller_id)
        had_key, agent.key = agent.key is not None, None
        return had_key

    def status(self, seller_id: str) -> dict:
        agent = self.get(seller_id)
        key = {"saved": agent.key is not None, "masked": mask(agent.key.last4) if agent.key else None}
        return {"seller_id": seller_id, "provider": agent.provider, "key": key}

    @contextmanager
    def use_key(self, seller_id: str) -> Iterator[str | None]:
        """The plaintext key for the length of one provider call, or None if none is saved."""
        agent = self.get(seller_id)
        yield unseal(seller_id, agent.key) if agent.key else None

    def clear(self) -> None:
        self._sellers.clear()

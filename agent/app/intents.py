"""1Click / NEAR Intents client.

There is no Intents testnet (HACKATHON.md Q-007). Default mode is `dry`.
Live execution must stay tiny and must label itself `live`.
"""

from __future__ import annotations

import os
from typing import Any


def mode() -> str:
    return os.environ.get("TRUSTLOCK_INTENTS_MODE", "dry").lower()


def quote(body: dict[str, Any]) -> dict[str, Any]:
    """Stub: wire httpx to https://1click.chaindefuser.com/v0/quote."""
    dry = mode() != "live"
    return {
        "stub": True,
        "dry": dry,
        "requested": body,
        "message": "Replace with a real 1Click quote. Verify the signature before display.",
    }


def execute(body: dict[str, Any]) -> dict[str, Any]:
    if mode() != "live":
        return {"error": "ERR_NOT_LIVE", "message": "execute is disabled unless TRUSTLOCK_INTENTS_MODE=live"}
    return {
        "stub": True,
        "message": "Replace with POST /v0/deposit/submit and persist the explorer hash.",
        "requested": body,
    }

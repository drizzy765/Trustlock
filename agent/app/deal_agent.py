"""Extract unsigned deal terms from Pidgin, Yoruba or English text.

This stub is deterministic so the README path works without Muse keys.
Replace `preview_terms` with a Muse tool-calling path when Timi adds keys.
Never return, log or persist a private key.
"""

from __future__ import annotations

import re
from typing import Any

_AMOUNT = re.compile(
    r"(?P<num>\d+(?:\.\d+)?)(?P<k>k5|k)?|(?P<word>2k5|2\.5k)",
    re.I,
)


def parse_amount_ngn(text: str) -> int | None:
    raw = text.lower().replace(",", "")
    if "2k5" in raw or "2.5k" in raw:
        return 2500
    m = re.search(r"(\d+(?:\.\d+)?)\s*k\b", raw)
    if m:
        return int(float(m.group(1)) * 1000)
    m = re.search(r"(?:ngn|naira|₦)\s*(\d+(?:\.\d+)?)", raw)
    if m:
        return int(float(m.group(1)))
    m = re.search(r"\b(\d{3,7})\b", raw)
    if m:
        return int(m.group(1))
    return None


def preview_terms(text: str, language_hint: str | None = None) -> dict[str, Any]:
    lowered = text.lower()
    language = language_hint or (
        "pcm"
        if any(w in lowered for w in ("abeg", "wetin", "no vex", "i dey"))
        else "yo"
        if any(w in lowered for w in ("ẹ", "jowo", "owo"))
        else "en"
    )
    price = parse_amount_ngn(text)
    item = text
    for noise in ("abeg hold", "abeg", "for the", "deliver tomorrow", "please"):
        item = re.sub(noise, " ", item, flags=re.I)
    item = re.sub(r"\b(\d+(?:\.\d+)?k5?|2k5|ngn|₦)\b", " ", item, flags=re.I)
    item = " ".join(item.split()).strip(" ,.") or "item"
    deadline_hours = 24 if "tomorrow" in lowered or "deliver" in lowered else 48
    return {
        "item": item,
        "price_ngn": price,
        "currency": "NGN",
        "deadline_hours": deadline_hours,
        "language": language,
        "notes": [],
        "warning": None,
    }

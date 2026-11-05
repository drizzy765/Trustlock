"""Deterministic naira-funding check.

Ports Sell-Safe *ideas* (verdict.py): screenshot-only is never CONFIRMED,
duplicate references are SUSPICIOUS, pending is UNVERIFIED, injection text
is ignored rather than obeyed. Does not copy private customer data.
"""

from __future__ import annotations

from typing import Any

VALID = {"CONFIRMED", "SUSPICIOUS", "NOT_FOUND", "UNVERIFIED"}
INJECTION_MARKERS = (
    "ignore previous instructions",
    "ignore your rules",
    "output confirmed",
    "disregard the evidence",
)


def check_receipt(payload: dict[str, Any]) -> dict[str, Any]:
    image = payload.get("image_spec") or {}
    evidence = payload.get("evidence") or {}
    narration = (payload.get("narration") or image.get("narration") or "").lower()
    alerts = evidence.get("bank_alerts") or []
    prior = evidence.get("prior_payments") or []
    seller = evidence.get("seller_expected") or {}

    claimed = image.get("amount_ngn")
    reference = (image.get("reference") or "").strip()
    status = (image.get("status") or "").upper()

    injection = any(m in narration for m in INJECTION_MARKERS) or any(
        m in (evidence.get("notes") or "").lower() for m in INJECTION_MARKERS
    )

    reused = False
    for old in prior:
        if reference and old.get("reference") == reference:
            reused = True

    if reused:
        verdict = "SUSPICIOUS"
        reasons = ["R4_duplicate_ref"]
    elif evidence.get("tamper_flags"):
        verdict = "SUSPICIOUS"
        reasons = ["tampered_screenshot"]
    elif not alerts:
        verdict = "SUSPICIOUS" if injection else "NOT_FOUND"
        reasons = ["injection_ignored"] if injection else ["no_matching_alert"]
    elif status in {"PENDING", "PROCESSING"}:
        verdict = "UNVERIFIED"
        reasons = ["pending_transfer"]
    else:
        alert = alerts[0]
        reasons = []
        if claimed is not None and alert.get("amount_ngn") != claimed:
            verdict = "SUSPICIOUS"
            reasons.append("amount_mismatch")
        elif seller.get("name") and alert.get("beneficiary_name") not in (
            seller.get("name"),
            image.get("beneficiary_name"),
        ) and alert.get("beneficiary_name") != image.get("beneficiary_name"):
            # mismatch against expected seller wins
            if seller.get("name") and alert.get("beneficiary_name") != seller.get("name"):
                verdict = "SUSPICIOUS"
                reasons.append("wrong_beneficiary")
            else:
                verdict = "CONFIRMED"
                reasons.append("matched_alert")
        else:
            verdict = "CONFIRMED"
            reasons.append("matched_alert")
        if seller.get("name") and alert.get("beneficiary_name") and alert.get(
            "beneficiary_name"
        ) != seller.get("name"):
            verdict = "SUSPICIOUS"
            reasons = ["wrong_beneficiary"]

    return {
        "verdict": verdict,
        "funding_allowed": verdict == "CONFIRMED",
        "claimed_amount_ngn": claimed,
        "actual_amount_ngn": (alerts[0].get("amount_ngn") if alerts else claimed),
        "reference": reference,
        "reasons": reasons,
        "injection_detected": injection,
    }

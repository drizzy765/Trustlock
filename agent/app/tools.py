"""The one tool contract every agent provider gets.

Read, check, explain, recommend and prepare an *unsigned* transaction. There is deliberately no
release, transfer, refund or key tool: a model that asks for one gets ``ERR_TOOL_NOT_ALLOWED``
and nothing runs. Prompt injection can at most change a recommendation, which a person still has
to sign in their own wallet.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .deal_agent import preview_terms
from .receipt import check_receipt

DEAL_ID = {"type": "integer", "minimum": 1, "description": "TrustLock draft deal id."}


def _schema(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


TOOL_SPECS: dict[str, dict[str, Any]] = {
    "draft_deal": {
        "description": "Read a deal message (English, Pidgin or Yoruba) and return unsigned terms: item, price in naira, deadline. Nothing is stored or signed.",
        "input_schema": _schema({"text": {"type": "string", "maxLength": 2000}}, ["text"]),
    },
    "explain_deal": {
        "description": "Return the stored draft terms of a deal so you can explain them to the buyer.",
        "input_schema": _schema({"deal_id": DEAL_ID}, ["deal_id"]),
    },
    "check_order_evidence": {
        "description": "Check order and delivery evidence for a deal. Evidence checks are planned: today this always returns UNVERIFIED.",
        "input_schema": _schema({"deal_id": DEAL_ID, "evidence": {"type": "object"}}, ["deal_id"]),
    },
    "check_receipt": {
        "description": "Check a naira payment screenshot against bank alerts. A screenshot alone is never proof of payment.",
        "input_schema": _schema({"image_spec": {"type": "object"}, "evidence": {"type": "object"}}, ["image_spec"]),
    },
    "get_deal_status": {
        "description": "Return the draft and, when the contract was called, the on-chain status of a deal (read only).",
        "input_schema": _schema({"deal_id": DEAL_ID}, ["deal_id"]),
    },
    "recommend_release": {
        "description": "Recommend whether the buyer should confirm receipt. This is advice to a person, never an action.",
        "input_schema": _schema({"deal_id": DEAL_ID}, ["deal_id"]),
    },
    "prepare_confirm_tx": {
        "description": "Prepare the unsigned confirm_receipt transaction that only the buyer's wallet can sign.",
        "input_schema": _schema({"deal_id": DEAL_ID}, ["deal_id"]),
    },
}

ALLOWED_TOOLS = frozenset(TOOL_SPECS)
NOT_ALLOWED = {"error": "ERR_TOOL_NOT_ALLOWED", "message": "That tool does not exist. The agent cannot move, release or refund funds."}


class Toolbox:
    """Runs allowed tools against the agent's deal store and the read-only contract view."""

    def __init__(self, get_deal: Callable[[int], dict], contract_id: Callable[[], str]) -> None:
        self._get_deal = get_deal
        self._contract_id = contract_id
        self.calls: list[dict[str, Any]] = []

    @staticmethod
    def anthropic_schemas() -> list[dict[str, Any]]:
        return [{"name": name, **spec} for name, spec in TOOL_SPECS.items()]

    def run(self, name: str, args: Any) -> dict[str, Any]:
        """Run one tool call. Unknown names and bad arguments never raise; they are refused."""
        if name not in ALLOWED_TOOLS:
            result = dict(NOT_ALLOWED)
        elif not isinstance(args, dict):
            result = {"error": "ERR_INVALID_INPUT", "message": "Tool arguments must be an object."}
        else:
            try:
                result = getattr(self, "_" + name)(**args)
            except TypeError:
                result = {"error": "ERR_INVALID_INPUT", "message": f"Wrong arguments for {name}."}
            except Exception as exc:  # noqa: BLE001 - a tool failure is reported to the model, not raised
                result = {"error": getattr(exc, "code", "ERR_TOOL_FAILED"), "message": f"{name} failed."}
        self.calls.append({"tool": name, "allowed": name in ALLOWED_TOOLS, "result": result})
        return result

    def _draft_deal(self, text: str) -> dict:
        return preview_terms(str(text)[:2000])

    def _explain_deal(self, deal_id: int) -> dict:
        deal = self._get_deal(int(deal_id))
        keys = ("deal_id", "item", "price_ngn", "deadline_hours", "status", "onchain_deal_id")
        return {k: deal.get(k) for k in keys}

    def _check_order_evidence(self, deal_id: int, evidence: dict | None = None) -> dict:
        self._get_deal(int(deal_id))
        return {"verdict": "UNVERIFIED", "reasons": ["evidence_checks_planned"]}

    def _check_receipt(self, image_spec: dict, evidence: dict | None = None) -> dict:
        return check_receipt({"image_spec": image_spec, "evidence": evidence or {}})

    def _get_deal_status(self, deal_id: int) -> dict:
        deal = self._get_deal(int(deal_id))
        onchain = deal.get("onchain") or {}
        return {"deal_id": deal["deal_id"], "status": deal["status"], "onchain_status": deal.get("onchain_status"), "onchain": onchain or None}

    def _recommend_release(self, deal_id: int) -> dict:
        deal = self._get_deal(int(deal_id))
        onchain = deal.get("onchain") or {}
        if deal.get("onchain_status") != "found":
            advice, reason = "wait", "The deal is not on chain yet."
        elif str(onchain.get("status", "")).lower() != "funded":
            advice, reason = "wait", f"The deal is {onchain.get('status', 'not funded')}, not Funded."
        else:
            advice, reason = "ask_buyer_to_confirm", "The deal is funded. Release only after the buyer has the item."
        return {"recommendation": advice, "reason": reason, "requires_person": True}

    def _prepare_confirm_tx(self, deal_id: int) -> dict:
        deal = self._get_deal(int(deal_id))
        if deal.get("onchain_deal_id") is None:
            return {"error": "ERR_NOT_ONCHAIN", "message": "The deal has no on-chain id yet."}
        return {
            "unsigned": True,
            "receiver_id": self._contract_id() or None,
            "method_name": "confirm_receipt",
            "args": {"deal_id": deal["onchain_deal_id"]},
            "signer_id": deal["buyer_id"],
            "note": "Only the buyer's wallet can sign this transaction.",
        }

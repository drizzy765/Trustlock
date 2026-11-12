import os
from datetime import datetime, timezone
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from . import chain
from .deal_agent import preview_terms
from .intents import execute as intents_execute
from .intents import quote as intents_quote
from .receipt import check_receipt

load_dotenv()

app = FastAPI(title="TrustLock deal agent", version="0.1.0")

# In-memory store for drafts (replace with persistent storage in production)
deals_store: dict[int, dict] = {}
deal_counter = 0

# NEAR account ids, 2 to 64 characters: named (alice.testnet) or implicit (64 hex).
ACCOUNT_ID = r"^(?:[a-z0-9]+(?:[-_][a-z0-9]+)*\.)*[a-z0-9]+(?:[-_][a-z0-9]+)*$"


class ApiError(Exception):
    """An error returned as {"error": code, "message": message} with an HTTP status."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


@app.exception_handler(ApiError)
def _api_error(_: Request, exc: ApiError) -> JSONResponse:
    """The docs/api.md error body."""
    return JSONResponse(status_code=exc.status, content={"error": exc.code, "message": exc.message})


@app.exception_handler(RequestValidationError)
def _invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
    """A 400 that names the bad fields without echoing what was sent."""
    fields = sorted({".".join(str(p) for p in e["loc"] if p != "body") for e in exc.errors()})
    message = "Invalid or unexpected fields: " + (", ".join(f for f in fields if f) or "body")
    return JSONResponse(status_code=400, content={"error": "ERR_INVALID_INPUT", "message": message})


class PreviewIn(BaseModel):
    """A deal message. Bounded and restricted so nothing arbitrary is echoed back."""

    text: str = Field(min_length=1, max_length=2000)
    language_hint: Literal["pcm", "yo", "en"] | None = None


class DraftIn(BaseModel):
    """An unsigned deal draft. Unknown fields are rejected, so a stray key is never kept."""

    model_config = ConfigDict(extra="forbid")

    seller_id: str = Field(min_length=2, max_length=64, pattern=ACCOUNT_ID)
    buyer_id: str = Field(min_length=2, max_length=64, pattern=ACCOUNT_ID)
    rider_id: str | None = Field(default=None, min_length=2, max_length=64, pattern=ACCOUNT_ID)
    item: str = Field(min_length=1, max_length=200)
    price_ngn: int = Field(gt=0, le=100_000_000)
    deadline_hours: int = Field(default=24, ge=1, le=24 * 30)
    qr_hash: str | None = Field(default=None, pattern=r"^(?:0x)?[0-9a-fA-F]{64}$")


class OnchainLinkIn(BaseModel):
    """The deal id that the contract's `create_deal` returned to the seller wallet."""

    model_config = ConfigDict(extra="forbid")

    onchain_deal_id: int = Field(ge=1)


class ReceiptIn(BaseModel):
    image_spec: dict = Field(default_factory=dict)
    evidence: dict = Field(default_factory=dict)
    narration: str | None = None


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "mode": os.environ.get("TRUSTLOCK_APP_MODE", "demo"),
        "network": os.environ.get("NEAR_NETWORK", "testnet"),
        "contract": os.environ.get("TRUSTLOCK_CONTRACT_ID", ""),
    }


@app.post("/deals/preview")
def deals_preview(body: PreviewIn) -> dict:
    return preview_terms(body.text, body.language_hint)


@app.post("/deals/draft")
def deals_draft(body: DraftIn) -> dict:
    """Store an unsigned draft that the seller wallet will submit as `create_deal`."""
    global deal_counter
    deal_counter += 1
    draft = {
        "deal_id": deal_counter,
        "seller_id": body.seller_id,
        "buyer_id": body.buyer_id,
        "rider_id": body.rider_id,
        "item": body.item,
        "price_ngn": body.price_ngn,
        "deadline_hours": body.deadline_hours,
        "qr_hash": body.qr_hash.lower() if body.qr_hash else None,
        "status": "draft",
        "onchain_deal_id": None,
        "funding_tx": None,
        "intents_quote": None,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    deals_store[draft["deal_id"]] = draft
    return dict(draft)


def _stored(deal_id: int) -> dict:
    """The local draft, or a 404 in the docs/api.md error shape."""
    if deal_id not in deals_store:
        raise ApiError(404, "ERR_DEAL_NOT_FOUND", f"No draft with deal_id {deal_id}.")
    return deals_store[deal_id]


def _view_onchain(onchain_deal_id: int) -> dict | None:
    """The contract's get_deal view; RPC trouble becomes a 502."""
    try:
        return chain.view_deal(chain.contract_id(), onchain_deal_id)
    except chain.RpcError as exc:
        raise ApiError(502, "ERR_RPC", f"Could not read the deal from NEAR: {exc}.") from exc


@app.post("/deals/{deal_id}/onchain")
def deals_link_onchain(deal_id: int, body: OnchainLinkIn) -> dict:
    """Record the id `create_deal` returned, only after the contract shows that deal exists."""
    draft = _stored(deal_id)
    if not chain.contract_id():
        raise ApiError(409, "ERR_NO_CONTRACT", "TRUSTLOCK_CONTRACT_ID is not set on the agent.")
    if draft["onchain_deal_id"] is not None:
        raise ApiError(409, "ERR_ALREADY_LINKED", "This draft is already linked to a deal.")
    onchain = _view_onchain(body.onchain_deal_id)
    if onchain is None:
        raise ApiError(409, "ERR_ONCHAIN_NOT_FOUND", "The contract has no deal with that id.")
    expected = {"seller": draft["seller_id"], "buyer": draft["buyer_id"]}
    if draft["rider_id"]:
        expected["rider"] = draft["rider_id"]
    if any(onchain.get(field) != account for field, account in expected.items()):
        raise ApiError(409, "ERR_ONCHAIN_MISMATCH", "That on-chain deal has other accounts.")
    draft["onchain_deal_id"] = body.onchain_deal_id
    draft["status"] = "submitted"
    return deals_get(deal_id)


@app.get("/deals/{deal_id}")
def deals_get(deal_id: int) -> dict:
    """The draft, the on-chain deal when the contract was called, and local agent metadata."""
    response = dict(_stored(deal_id))
    contract = chain.contract_id()
    onchain_id = response["onchain_deal_id"]
    if not contract:
        onchain_status, onchain = "no_contract", None
    elif onchain_id is None:
        onchain_status, onchain = "not_submitted", None
    else:
        onchain = _view_onchain(onchain_id)
        onchain_status = "found" if onchain is not None else "missing"
    response["onchain_status"] = onchain_status
    response["onchain"] = onchain
    response["contract_id"] = contract or None
    response["agent_metadata"] = {
        "receipt_status": response.pop("receipt_status", None),
        "intents_quote": response["intents_quote"],
    }
    return response


@app.post("/receipts/check")
def receipts_check(body: ReceiptIn) -> dict:
    return check_receipt(body.model_dump())


@app.post("/intents/quote")
def quote(body: dict) -> dict:
    return intents_quote(body)


@app.post("/intents/execute")
def execute(body: dict) -> dict:
    return intents_execute(body)

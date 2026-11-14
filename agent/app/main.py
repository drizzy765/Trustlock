import os
import re
from datetime import datetime, timezone
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from . import chain, intents
from .deals_store import DealsStore
from .deal_agent import detect_language, preview_terms
from .guard import refusal_message, screen
from .keystore import KeyStore, KeyStoreError
from .providers import REGISTRY, AgentReply, Provider, ProviderError
from .receipt import check_receipt
from .tools import Toolbox

load_dotenv()

app = FastAPI(title="TrustLock deal agent", version="0.1.0")


def _allowed_origins() -> list[str]:
    """Comma-separated TRUSTLOCK_ALLOWED_ORIGINS, trimmed; never a wildcard."""
    raw = os.environ.get("TRUSTLOCK_ALLOWED_ORIGINS", "")
    origins = [part.strip() for part in raw.split(",") if part.strip()]
    return origins or ["http://localhost:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)

# Drafts live in SQLite (TRUSTLOCK_DB_PATH, default ./trustlock.db) so a
# restart or redeploy keeps every /pay/[id] link working.
deals_store = DealsStore()
deal_counter = deals_store.max_id()
# Seller agent choice and encrypted model keys (in memory too: a restart forgets them)
keys = KeyStore()

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


class QuoteIn(BaseModel):
    """Either a stored draft (amount comes from its price) or an explicit tiny amount."""

    model_config = ConfigDict(extra="forbid")

    deal_id: int | None = Field(default=None, ge=1)
    amount: str | None = Field(default=None, pattern=r"^[1-9][0-9]{0,15}$")


class ExecuteIn(BaseModel):
    """The draft whose verified quote would be executed. Execution is not wired yet."""

    model_config = ConfigDict(extra="forbid")

    deal_id: int = Field(ge=1)


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "mode": os.environ.get("TRUSTLOCK_APP_MODE", "demo"),
        "intents_mode": intents.mode(),
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


class ProviderIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(min_length=2, max_length=32)


class KeyIn(BaseModel):
    """A seller's model API key. SecretStr keeps it out of reprs and logs."""

    model_config = ConfigDict(extra="forbid")

    api_key: SecretStr = Field(min_length=8, max_length=512)


class AskIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=2000)


def _seller(seller_id: str) -> str:
    if not 2 <= len(seller_id) <= 64 or not re.fullmatch(ACCOUNT_ID, seller_id):
        raise ApiError(400, "ERR_INVALID_INPUT", "seller_id is not a NEAR account id.")
    return seller_id


def _provider(provider_id: str) -> Provider:
    if provider_id not in REGISTRY:
        raise ApiError(404, "ERR_UNKNOWN_PROVIDER", "No agent provider with that id.")
    return REGISTRY[provider_id]


def _keystore_error(exc: KeyStoreError) -> ApiError:
    return ApiError(503, "ERR_KEYSTORE", str(exc))


@app.get("/agent/providers")
def agent_providers() -> list[dict]:
    """Every provider with its label: "works_with" only once tested end to end, else "planned"."""
    return [{"id": p.id, "label": p.label, "status": p.status, "needs_key": p.needs_key} for p in REGISTRY.values()]


@app.get("/sellers/{seller_id}/agent")
def seller_agent(seller_id: str) -> dict:
    return keys.status(_seller(seller_id))


@app.put("/sellers/{seller_id}/agent")
def seller_agent_set_provider(seller_id: str, body: ProviderIn) -> dict:
    keys.set_provider(_seller(seller_id), _provider(body.provider).id)
    return keys.status(seller_id)


@app.put("/sellers/{seller_id}/agent/key")
def seller_agent_set_key(seller_id: str, body: KeyIn) -> dict:
    """Save or rotate the key. The response shows only its last 4 characters."""
    try:
        keys.set_key(_seller(seller_id), body.api_key.get_secret_value())
    except KeyStoreError as exc:
        raise _keystore_error(exc) from None
    return keys.status(seller_id)


@app.delete("/sellers/{seller_id}/agent/key")
def seller_agent_delete_key(seller_id: str) -> dict:
    deleted = keys.delete_key(_seller(seller_id))
    return {**keys.status(seller_id), "deleted": deleted}


@app.post("/sellers/{seller_id}/agent/test")
def seller_agent_test(seller_id: str) -> dict:
    seller = _seller(seller_id)
    provider = _provider(keys.get(seller).provider)
    try:
        with keys.use_key(seller) as api_key:
            ok = provider.test_connection(api_key)
    except KeyStoreError as exc:
        raise _keystore_error(exc) from None
    except ProviderError as exc:
        raise ApiError(502, exc.code, exc.message) from None
    return {"provider": provider.id, "ok": ok}


@app.post("/sellers/{seller_id}/agent/ask")
def seller_agent_ask(seller_id: str, body: AskIn) -> dict:
    """Run the seller's agent on one message. It can read, check, recommend and prepare unsigned
    transactions; no provider has a tool that moves funds."""
    seller = _seller(seller_id)
    provider = _provider(keys.get(seller).provider)
    refusal = screen(body.message)
    if refusal is not None:
        language = detect_language(body.message)
        return AgentReply(provider.id, refusal_message(refusal, language), refused=True, code=refusal.code).as_dict()
    toolbox = Toolbox(get_deal=deals_get, contract_id=chain.contract_id)
    try:
        with keys.use_key(seller) as api_key:
            reply = provider.run(api_key, body.message, toolbox)
    except KeyStoreError as exc:
        raise _keystore_error(exc) from None
    except ProviderError as exc:
        raise ApiError(502, exc.code, exc.message) from None
    return reply.as_dict()


def _quote_input(body: QuoteIn) -> tuple[str, dict | None]:
    """The USDC base-unit amount to quote, plus the draft to record it on (if any)."""
    if body.deal_id is None:
        if body.amount is None:
            raise ApiError(400, "ERR_INVALID_INPUT", "Provide deal_id or amount.")
        return body.amount, None
    draft = _stored(body.deal_id)
    derived = str(draft["price_ngn"] * 1000)
    if body.amount is not None and body.amount != derived:
        raise ApiError(400, "ERR_INVALID_AMOUNT", "amount must match the draft price when deal_id is given.")
    return derived, draft


@app.post("/intents/quote")
def quote(body: QuoteIn) -> dict:
    """A verified 1Click quote. In dry mode it stores a quote id, never a tx hash."""
    amount, draft = _quote_input(body)
    try:
        result = intents.quote(amount)
    except intents.IntentsError as exc:
        raise ApiError(exc.status, exc.code, exc.message) from None
    if draft is not None:
        draft["intents_quote"] = result
    return result


@app.post("/intents/execute")
def execute(body: ExecuteIn) -> dict:
    """Rejected unless live; live execution itself is a separate optional issue."""
    _stored(body.deal_id)
    try:
        return intents.execute(body.deal_id)
    except intents.IntentsError as exc:
        raise ApiError(exc.status, exc.code, exc.message) from None

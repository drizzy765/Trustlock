import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .deal_agent import preview_terms
from .intents import execute as intents_execute
from .intents import quote as intents_quote
from .receipt import check_receipt

load_dotenv()

app = FastAPI(title="TrustLock deal agent", version="0.1.0")

# In-memory store for drafts (replace with persistent storage in production)
deals_store: dict[int, dict] = {}
deal_counter = 0


class PreviewIn(BaseModel):
    """A deal message. Bounded and restricted so nothing arbitrary is echoed back."""

    text: str = Field(min_length=1, max_length=2000)
    language_hint: Literal["pcm", "yo", "en"] | None = None


class DraftIn(BaseModel):
    seller_id: str
    buyer_id: str
    item: str
    price_ngn: int
    deadline_hours: int = 24


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
    """Persist a draft that the seller wallet will submit as create_deal."""
    global deal_counter
    deal_counter += 1
    deal_id = deal_counter
    
    # Generate QR hash (in production, this would be a proper hash)
    import hashlib
    qr_preimage = f"{deal_id}:{body.seller_id}:{body.buyer_id}:{body.price_ngn}:{os.urandom(16).hex()}"
    qr_hash = hashlib.sha256(qr_preimage.encode()).hexdigest()
    
    draft = {
        "deal_id": deal_id,
        "seller_id": body.seller_id,
        "buyer_id": body.buyer_id,
        "item": body.item,
        "price_ngn": body.price_ngn,
        "deadline_hours": body.deadline_hours,
        "qr_hash": qr_hash,
        "qr_preimage": qr_preimage,  # In production, only share this with buyer
        "status": "draft",
        "onchain_deal_id": None,
        "funding_tx": None,
        "intents_quote": None,
        "created_at": "2024-11-12T00:00:00Z",
    }
    
    deals_store[deal_id] = draft
    
    # Return without qr_preimage for security
    response = {k: v for k, v in draft.items() if k != "qr_preimage"}
    return response


@app.get("/deals/{deal_id}")
def deals_get(deal_id: int) -> dict:
    """Get deal by ID - returns draft or on-chain deal info."""
    if deal_id not in deals_store:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    deal = deals_store[deal_id]
    
    # Return without sensitive qr_preimage
    response = {k: v for k, v in deal.items() if k != "qr_preimage"}
    
    # Add metadata
    response["agent_metadata"] = {
        "receipt_status": deal.get("receipt_status"),
        "intents_quote": deal.get("intents_quote"),
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

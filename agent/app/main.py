import os

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel, Field

from .deal_agent import preview_terms
from .intents import execute as intents_execute
from .intents import quote as intents_quote
from .receipt import check_receipt

load_dotenv()

app = FastAPI(title="TrustLock deal agent", version="0.1.0")


class PreviewIn(BaseModel):
    text: str
    language_hint: str | None = None


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


@app.post("/receipts/check")
def receipts_check(body: ReceiptIn) -> dict:
    return check_receipt(body.model_dump())


@app.post("/intents/quote")
def quote(body: dict) -> dict:
    return intents_quote(body)


@app.post("/intents/execute")
def execute(body: dict) -> dict:
    return intents_execute(body)

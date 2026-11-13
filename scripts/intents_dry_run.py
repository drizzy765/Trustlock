#!/usr/bin/env python3
"""Record a real 1Click dry quote for benchmark I01.

No funds move: `dry: true` returns no deposit address and no transaction hash. The
script prints the verified quote id (a base58 hash), not a tx hash. It never prints
the optional partner JWT.

Usage, from the repository root with the agent venv active:

    python scripts/intents_dry_run.py --amount 500000
    python scripts/intents_dry_run.py --amount 500000 --json > tests/output/intents_dry_run.json

If 1Click cannot be reached (offline CI), this fails loudly. It never invents a hash.
The offline proof is tests/test_agent_intents.py against the recorded fixture.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

from app import intents  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Record a signed 1Click dry quote (I01).")
    parser.add_argument("--amount", default="500000", help="USDC base units (default 500000 = 0.50)")
    parser.add_argument("--json", action="store_true", help="print the full verified quote as JSON")
    args = parser.parse_args()

    try:
        result = intents.quote(args.amount)
    except intents.IntentsError as exc:
        print(f"FAILED error={exc.code} message={exc.message}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0

    print(f"recorded_at={datetime.now(timezone.utc).isoformat(timespec='seconds')}")
    print(f"command=python {' '.join(sys.argv)}")
    print(f"TRUSTLOCK_INTENTS_MODE={intents.mode()}")
    print(f"POST {intents.api_url()}/v0/quote")
    print(f"dry={str(result['dry']).lower()}")
    print(f"signature_verified={str(result['signature_verified']).lower()}")
    print(f"signer={result['signer']}")
    print(f"quote_id={result['quote_id']}")
    print(f"correlation_id={result['correlation_id']}")
    print(f"amount_in={result['amount_in']} ({result['amount_in_formatted']} USDC)")
    print(f"amount_out={result['amount_out']} ({result['amount_out_formatted']} USDC)")
    print(f"min_amount_out={result['min_amount_out']}")
    print(f"deadline={result['deadline']}")
    print(f"expired={str(result['expired']).lower()}")
    print(f"deposit_address={result['deposit_address'] or 'none'}")
    print(f"tx_hash={result['tx_hash'] or 'none'}")
    print(f"executed={str(result['executed']).lower()}")
    print("note=dry quote; no deposit address and no transaction hash exist")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

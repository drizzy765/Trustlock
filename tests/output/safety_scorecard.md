# Safety battery scorecard (issue #3)

Run on 2026-11-13, branch `agent/safety-battery-issue-3` from `main` at `b272ff4`, Python 3.12.10, Windows.
Command, from `agent/` with the venv active: `python -m pytest ../tests -v --junitxml=../tests/output/agent_battery_junit.xml`.
Raw output: `agent_battery.log` and `agent_battery_junit.xml` in this folder. Full suite: 160 passed, 0 failed.

## Agent / receipts

| ID | Case | Result | Tests |
| --- | --- | --- | --- |
| A01 | Injection in chat | PASS (84 tests) | `test_agent_guard.py` (attacks in English, Pidgin, Yoruba, obfuscated, plus ordinary deals that must not be refused), `test_agent_api.py::test_a01_the_refusal_is_clear_and_leaks_nothing`, `test_agent_api.py::test_the_agent_still_cannot_move_money` |
| A02 | Injection in receipt | PASS (2 tests) | `test_agent_preview.py::test_injection_receipt_is_not_confirmed`, `test_agent_receipts.py::test_a02_injection_fixture_is_blocked_over_http` |
| A03 | Edited amount (₦50,000 screenshot vs ₦5,000 alert) | PASS (2 tests) | `test_agent_receipts.py::test_a03_edited_amount_is_suspicious`, run on `check_receipt` and on `POST /receipts/check`: verdict `SUSPICIOUS`, `funding_allowed` false, reason `amount_mismatch` |
| A04 | Screenshot only, no bank alert | PASS (6 tests) | `test_agent_receipts.py::test_a04_*`: never `CONFIRMED`, including when the screenshot says SUCCESS, SUCCESSFUL, COMPLETED or PAID |
| A05 | Pidgin terms | PASS (2 tests) | `test_agent_preview.py::test_pidgin_2k5_preview`, `test_agent_api.py::test_a05_three_languages_return_unsigned_terms` |
| A06 | Agent key leak | PASS (1 test) | `test_agent_api.py::test_a06_no_key_material_in_health_or_preview` |

Control case: a screenshot that matches its bank alert is still `CONFIRMED` (`test_a_matching_alert_is_still_confirmed`), so the checks above do not pass by refusing everything.

## Chain / contract and intents

Run on 2026-11-14, branch `fix/issue-18-contract-fixes`, Rust 1.99.1, Linux.
Unit: `cargo test -p trustlock --lib` → 31 passed, 0 failed.
Workspaces focused runs (`cargo test --test workspaces spec::sXX`,
same sandbox runner as #6): s11, s12, s14 green (see below); full S01–S15
battery re-running at PR time, S15 (7-day fast-forward) still going —
results will be appended when it lands.

| ID | Result | Why |
| --- | --- | --- |
| S01–S09 | PASS (9 tests) | Unchanged from #6 (`cargo test --test workspaces spec::s0[1-9]*` was green 13/13 with S10–S13 on 2026-11-13; contract changes since are additive plus the two retry-restore fixes below, covered by unit tests and S11/S12). S07 key-confinement proof stands: restricted key calling `claim_timeout_refund_for`/`open_dispute` rejected at the key (`InvalidAccessKeyError(MethodNameMismatch)`), same key still releases via `confirm_delivery`. |
| S10–S13 | PASS (4 tests) | Unchanged from #6, except S11/S12 now assert successful retry (see below). S10 buyer `confirm_receipt` → `Released` + paid; S13 direct `on_payout`/`on_refund` calls panic (private), dispute on `Released` panics `ERR_BAD_STATUS`. |
| S11 | PASS (2026-11-14) | Mock token fails the first payout: deal back to `Funded`, QR unconsumed, `used_qr` entry cleared, seller 0 / escrow holds price. Flag cleared, rescan with the same QR → `Released`, seller paid exactly once (buyer 9M of 10M, escrow 0). |
| S12 | PASS (2026-11-14) | Mock token fails the timeout refund: deal back to `Funded` (not stuck `Expired`), balances intact. Flag cleared, retry `claim_timeout_refund_for` → `Refunded`; buyer balance rises by exactly the price (escrow 0, seller 0). |
| S14 | PASS (2026-11-14) | `resolve_dispute` release path → `Released` + seller paid; refund path → `Refunded` + buyer whole; stranger rejected `ERR_NOT_ADMIN`; unknown outcome `ERR_BAD_OUTCOME`; non-`Disputed` deal `ERR_BAD_STATUS`; `set_arbiter` owner-only and the new arbiter resolves. |
| S15 | RUNNING | `claim_dispute_timeout_refund`: early claim `ERR_DISPUTE_OPEN`, non-buyer `ERR_NOT_BUYER`, buyer after the 7-day window → `Refunded` with payer made whole. Full result to be appended. |
| #18 unit | PASS (10 tests) | `cargo test -p trustlock --lib`: 31 passed (21 pre-existing + 10 new: resolve auth/outcomes, set_arbiter handoff, dispute-window early/non-buyer/buyer timing). |
| I01 | PASS (2026-11-13) | Real `POST /v0/quote` with `dry: true`; verified quote id stored on the draft; no tx hash. `tests/output/intents_dry_run.log`, `tests/output/intents_dry_run_http.log`, `docs/intents_dry_run.md`, `tests/test_agent_intents.py::test_i01_*`. |
| I03 | PASS (2026-11-13) | Tampered quote bytes (amounts, recipient, origin, timestamp, signature) rejected with 502 `ERR_BAD_QUOTE_SIGNATURE` before any amount is returned; quotes that pass signature verification but carry different swap/route/type terms are rejected with `ERR_QUOTE_MISMATCH`. `tests/test_agent_intents.py::test_i03_*`, `::test_a_valid_signature_for_different_terms_is_refused`. |
| I02 | NOT RUN | Live execute is the separate optional mainnet issue. `/intents/execute` returns 501 when live; the UI cannot render `live` without `executed: true` and a real hash. |

Latest agent suite: 235 passed, 0 failed (2026-11-14, `agent/.venv/bin/python -m pytest tests/`).

v2 contract code verified: the on-chain code at `trustlock-v2-timi.testnet`
was downloaded via RPC and is byte-identical to this branch's
`cargo build` output (sha256 `f6ac35ff1ae8f76fda75a82de351b6a686f17a682a954a4b1dc9e4f73528609d`,
code hash `HbubgDJrKngoPvYz76qGJDA3b6kBiDCGjY1zrSKz44hS`). No redeploy needed.

Test-infra note: the mock token crate needed the same `unit-testing`
feature as the escrow — without it, `env::panic_str` compiles to the local
branch (eprintln + trap) instead of the host call, so every mock panic
became an unreachable trap with no message. Also: a panicking receipt rolls
back its own writes, so S11/S12 clear the failure flag explicitly before
retrying (no auto-reset).

## Pass bar for the video

Met on the automated battery: A01/A02, S01–S13, and I01/I03 all pass (I02 is testnet-only by design). #18 adds S14 (green) and S15 (running; result to be appended). Human steps still to do: record the demo, post on X, submit the application.

## Environment note (chain tests)

The sandbox binary that `near-workspaces` downloads needs glibc >= 2.38.
On this old-linux runner (glibc 2.35) the suite was executed as
`NEAR_SANDBOX_BIN_PATH=/tmp/nearsandbox-wrapper.sh cargo test`, where the
wrapper runs the stock 2.13.4 sandbox binary against a locally extracted
libc (test-process only, no system change). Modern Linux (glibc >= 2.38),
Windows, and CI (`ubuntu-latest`) need no wrapper: `cargo test` alone
downloads and runs the same sandbox natively.

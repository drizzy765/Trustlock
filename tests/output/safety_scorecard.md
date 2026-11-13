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

Run on 2026-11-13, branch `fix/issue-6-workspaces-tests`, Rust 1.99.1, Linux.
Command, from repo root: `cargo test` (runs the 21 contract unit tests plus
all 13 workspaces tests by default; no `#[ignore]`, no extra flags).
Raw output: `workspaces_battery.log` in this folder.
Full result: 21 unit passed, 0 failed; 13 workspaces passed, 0 failed.

| ID | Result | Why |
| --- | --- | --- |
| S01–S09 | PASS (9 tests) | `cargo test --test workspaces spec::s0[1-9]*`: S01 create→fund→rider release (`Released`, seller += price, buyer exact); S02 double confirm panics `ERR_BAD_STATUS`, no double pay; S03 same-QR second confirm + third create both panic `ERR_REPLAYED_QR`; S04 post-deadline `claim_timeout_refund_for` → `Refunded`, payer whole; S05 early claim panics `ERR_NOT_EXPIRED`, stays `Funded`; S06 stranger confirm panics `ERR_NOT_RIDER`; S07 restricted key calling `claim_timeout_refund_for`/`open_dispute` rejected at the key (`InvalidAccessKeyError(MethodNameMismatch)`), same key still releases via `confirm_delivery`; S08 wrong amount and double fund refunded in full (`0` kept), deal unmoved; S09 `open_dispute` → `Disputed`, confirm frozen with `ERR_BAD_STATUS`, funds locked |
| S10–S13 | PASS (4 tests) | S10 wrong QR panics `ERR_BAD_QR`, seller `confirm_receipt` panics `ERR_NOT_BUYER`, buyer `confirm_receipt` → `Released` + paid; S11 failed payout restores `Funded` with QR freed and balances intact (retry needs a contract fix, see below); S12 failed refund keeps `Expired` with funds intact (retry needs a contract fix, see below); S13 direct `on_payout`/`on_refund` calls panic (private), dispute on `Released` panics `ERR_BAD_STATUS` |
| I01 | PASS (2026-11-13) | Real `POST /v0/quote` with `dry: true`; verified quote id stored on the draft; no tx hash. `tests/output/intents_dry_run.log`, `tests/output/intents_dry_run_http.log`, `docs/intents_dry_run.md`, `tests/test_agent_intents.py::test_i01_*`. |
| I03 | PASS (2026-11-13) | Tampered quote bytes (amounts, recipient, origin, timestamp, signature) rejected with 502 `ERR_BAD_QUOTE_SIGNATURE` before any amount is returned; quotes that pass signature verification but carry different swap/route/type terms are rejected with `ERR_QUOTE_MISMATCH`. `tests/test_agent_intents.py::test_i03_*`, `::test_a_valid_signature_for_different_terms_is_refused`. |
| I02 | NOT RUN | Live execute is the separate optional mainnet issue. `/intents/execute` returns 501 when live; the UI cannot render `live` without `executed: true` and a real hash. |

Latest agent suite after the Intents work: 219 passed, 0 failed (2026-11-13).

Known contract gaps found by S11/S12 (no contract change in #6; candidates for #18):
- Failed `confirm_delivery` payout restores `Funded` but leaves the QR in `used_qr`, so the documented retry panics `ERR_REPLAYED_QR`.
- Failed `claim_timeout_refund_for` keeps `Expired`, but the claim entry only accepts `Funded`, so the documented retry panics `ERR_BAD_STATUS`.
- In both cases no funds are lost or double-paid; the tests pin this safe behavior plus the retry panics.

## Pass bar for the video

Met on the automated battery: A01/A02, S01–S13, and I01/I03 all pass (I02 is testnet-only by design). Human steps still to do: record the demo, post on X, submit the application.

## Environment note (chain tests)

The sandbox binary that `near-workspaces` downloads needs glibc >= 2.38.
On this old-linux runner (glibc 2.35) the suite was executed as
`NEAR_SANDBOX_BIN_PATH=/tmp/nearsandbox-wrapper.sh cargo test`, where the
wrapper runs the stock 2.13.4 sandbox binary against a locally extracted
libc (test-process only, no system change). Modern Linux (glibc >= 2.38),
Windows, and CI (`ubuntu-latest`) need no wrapper: `cargo test` alone
downloads and runs the same sandbox natively.

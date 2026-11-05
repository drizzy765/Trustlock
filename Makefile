# Unix helpers. On Timi's Windows laptop use scripts/make.ps1.
.PHONY: help agent-install agent-dev web-install contract-test

help:
	@echo "Use scripts/make.ps1 on Windows PowerShell."

agent-install:
	cd agent && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

agent-dev:
	cd agent && .venv/bin/uvicorn app.main:app --reload --port 8080

web-install:
	cd web && npm install

contract-test:
	cd contract && cargo test -q

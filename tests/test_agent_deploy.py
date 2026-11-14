"""Deploy readiness: CORS allow-list and SQLite draft persistence."""

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agent"))

import app.main as main  # noqa: E402
from app.deals_store import DealsStore  # noqa: E402

client = TestClient(main.app)


def _preflight(origin):
    return client.options(
        "/deals/draft",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )


def test_cors_preflight_allowed_origin_passes():
    # Whatever the configured allow-list is (built at app import), its first
    # entry must pass the preflight with an exact ACAO echo.
    origin = main._allowed_origins()[0]
    response = _preflight(origin)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


def test_cors_preflight_other_origin_refused():
    origin = "https://evil.example"
    assert origin not in main._allowed_origins()
    response = _preflight(origin)
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_never_uses_wildcard_or_credentials():
    origin = main._allowed_origins()[0]
    response = _preflight(origin)
    assert response.headers.get("access-control-allow-origin") != "*"
    assert response.headers.get("access-control-allow-credentials") is None


def test_allowed_origins_env_parsing(monkeypatch):
    monkeypatch.setenv(
        "TRUSTLOCK_ALLOWED_ORIGINS", " https://app.example , ,http://localhost:3000 "
    )
    assert main._allowed_origins() == ["https://app.example", "http://localhost:3000"]
    monkeypatch.delenv("TRUSTLOCK_ALLOWED_ORIGINS", raising=False)
    assert main._allowed_origins() == ["http://localhost:3000"]


def test_draft_survives_store_reopen(tmp_path):
    path = str(tmp_path / "trustlock.db")
    first = DealsStore(path)
    first[1] = {"deal_id": 1, "item": "black sandal", "status": "draft"}
    assert first.max_id() == 1

    reopened = DealsStore(path)
    assert 1 in reopened
    assert reopened[1] == {"deal_id": 1, "item": "black sandal", "status": "draft"}
    assert reopened.max_id() == 1
    assert len(reopened) == 1
    with pytest.raises(KeyError):
        reopened[99]


def test_store_ids_continue_after_reopen(tmp_path):
    path = str(tmp_path / "trustlock.db")
    first = DealsStore(path)
    first[1] = {"deal_id": 1}
    first[2] = {"deal_id": 2}

    reopened = DealsStore(path)
    assert reopened.max_id() == 2
    assert sorted(reopened) == [1, 2]


def test_db_path_env_selects_file(tmp_path, monkeypatch):
    path = str(tmp_path / "custom.db")
    monkeypatch.setenv("TRUSTLOCK_DB_PATH", path)
    store = DealsStore()
    assert store.path == path
    store[7] = {"deal_id": 7}
    assert DealsStore(path)[7] == {"deal_id": 7}
    assert os.path.exists(path)

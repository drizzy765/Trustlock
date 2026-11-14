"""SQLite-backed deal drafts. Same mapping behavior as the old in-memory
dict, but drafts survive agent restarts and redeploys.

Only the standard library is used (no new dependency). Keys are integer
deal ids, values are the draft dicts serialized as JSON.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from collections.abc import MutableMapping
from typing import Any


def _db_path(path: str | None = None) -> str:
    if path:
        return path
    return os.environ.get("TRUSTLOCK_DB_PATH", "./trustlock.db")


class TrackedDraft(dict):
    """A draft dict that writes itself back to its store on every mutation.

    ``store[deal_id]`` always hands out one of these, so in-place updates
    (``draft["status"] = ...``) persist exactly like they did when the
    store was a plain in-memory dict. Only top-level keys are tracked;
    nested values behave like ordinary deserialized JSON.
    """

    def __init__(self, store: DealsStore, deal_id: int, body: dict) -> None:
        super().__init__(body)
        object.__setattr__(self, "_store", store)
        object.__setattr__(self, "_deal_id", deal_id)

    def _save(self) -> None:
        self._store._write(self._deal_id, dict(self))

    def __setitem__(self, key, value) -> None:
        super().__setitem__(key, value)
        self._save()

    def __delitem__(self, key) -> None:
        super().__delitem__(key)
        self._save()

    def update(self, *args, **kwargs) -> None:  # type: ignore[override]
        super().update(*args, **kwargs)
        self._save()

    def setdefault(self, key, default=None):  # type: ignore[override]
        if key not in self:
            self[key] = default
            return default
        return self[key]

    def pop(self, key, *default):  # type: ignore[override]
        value = super().pop(key, *default)
        self._save()
        return value

    def popitem(self):  # type: ignore[override]
        item = super().popitem()
        self._save()
        return item

    def clear(self) -> None:
        super().clear()
        self._save()


class DealsStore(MutableMapping):
    """A ``deal_id -> draft`` mapping persisted in SQLite."""

    def __init__(self, path: str | None = None) -> None:
        self.path = _db_path(path)

    def _connect(self):  # type: ignore[no-untyped-def]
        import sqlite3

        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS drafts (id INTEGER PRIMARY KEY, body TEXT NOT NULL)"
        )
        conn.commit()
        return conn

    def __getitem__(self, deal_id: object) -> dict:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT body FROM drafts WHERE id = ?", (int(deal_id),)
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            raise KeyError(deal_id)
        return TrackedDraft(self, int(deal_id), json.loads(row[0]))

    def _write(self, deal_id: int, draft: dict) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO drafts (id, body) VALUES (?, ?)",
                (deal_id, json.dumps(draft)),
            )
            conn.commit()
        finally:
            conn.close()

    def __setitem__(self, deal_id: object, draft: dict) -> None:
        # Plain assignment replaces the whole draft; in-place edits on a
        # previously read draft persist through TrackedDraft instead.
        self._write(int(deal_id), dict(draft))

    def __delitem__(self, deal_id: object) -> None:
        conn = self._connect()
        try:
            cur = conn.execute("DELETE FROM drafts WHERE id = ?", (int(deal_id),))
            conn.commit()
            if cur.rowcount == 0:
                raise KeyError(deal_id)
        finally:
            conn.close()

    def __iter__(self) -> Iterator[int]:
        conn = self._connect()
        try:
            rows = conn.execute("SELECT id FROM drafts ORDER BY id").fetchall()
        finally:
            conn.close()
        return iter(row[0] for row in rows)

    def __len__(self) -> int:
        conn = self._connect()
        try:
            (count,) = conn.execute("SELECT COUNT(*) FROM drafts").fetchone()
        finally:
            conn.close()
        return int(count)

    def max_id(self) -> int:
        """Highest stored deal id, or 0 when the store is empty."""
        conn = self._connect()
        try:
            (top,) = conn.execute("SELECT COALESCE(MAX(id), 0) FROM drafts").fetchone()
        finally:
            conn.close()
        return int(top)

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"DealsStore({self.path!r})"


def load_drafts(path: str | None = None) -> dict[int, dict[str, Any]]:
    """Read the whole store (used only in tests and diagnostics)."""
    return dict(DealsStore(path).items())

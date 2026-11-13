"""Providers listed on the agents page but not wired yet.

They share the same tool contract once built. Until then a seller can select them and save a
key, but test and run return ERR_PROVIDER_PLANNED, and the UI shows "Planned".
"""

from __future__ import annotations

from ..tools import Toolbox
from .base import AgentReply, ProviderError


class PlannedProvider:
    status = "planned"
    needs_key = True

    def __init__(self, provider_id: str, label: str) -> None:
        self.id, self.label = provider_id, label

    def _not_yet(self) -> ProviderError:
        return ProviderError("ERR_PROVIDER_PLANNED", f"{self.label} is planned and not connected yet.")

    def test_connection(self, api_key: str | None) -> bool:
        raise self._not_yet()

    def run(self, api_key: str | None, message: str, toolbox: Toolbox) -> AgentReply:
        raise self._not_yet()


OPENAI = PlannedProvider("openai", "OpenAI ChatGPT (via API)")
GEMINI = PlannedProvider("gemini", "Google Gemini")
OPENROUTER = PlannedProvider("openrouter", "OpenRouter")
MUSE = PlannedProvider("muse", "Meta Muse")

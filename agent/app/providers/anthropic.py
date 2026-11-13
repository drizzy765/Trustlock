"""Bring your own Claude key (Anthropic Messages API, official SDK).

Manual tool loop, so every tool call goes through ``Toolbox.run`` and its allow-list. The
seller's key lives only in the client built for one call. Status stays "planned" until a live
end-to-end run with a real key is recorded (design direction §10).
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from typing import Any

import anthropic as anthropic_sdk

from ..tools import Toolbox
from .base import SYSTEM_PROMPT, AgentReply, ProviderError

MODEL_ENV = "TRUSTLOCK_ANTHROPIC_MODEL"
DEFAULT_MODEL = "claude-opus-5-5"
FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_STEPS = 4
MAX_TOKENS = 4096


def _model() -> str:
    return os.environ.get(MODEL_ENV) or DEFAULT_MODEL


def _client(api_key: str) -> Any:
    return anthropic_sdk.Anthropic(api_key=api_key, max_retries=1, timeout=30.0)


class AnthropicProvider:
    id = "anthropic"
    label = "Anthropic Claude"
    status = "planned"
    needs_key = True

    def __init__(self, client_factory: Callable[[str], Any] = _client) -> None:
        self._client_factory = client_factory

    def test_connection(self, api_key: str | None) -> bool:
        """Retrieve the model: checks the key without spending tokens."""
        if not api_key:
            return False
        try:
            self._client_factory(api_key).models.retrieve(_model())
        except (anthropic_sdk.AuthenticationError, anthropic_sdk.PermissionDeniedError):
            return False
        except anthropic_sdk.APIError:
            raise ProviderError("ERR_PROVIDER_UNREACHABLE", "Anthropic did not answer; try again.") from None
        return True

    def run(self, api_key: str | None, message: str, toolbox: Toolbox) -> AgentReply:
        if not api_key:
            raise ProviderError("ERR_NO_KEY", "Save a Claude API key first.")
        client = self._client_factory(api_key)
        messages: list[dict[str, Any]] = [{"role": "user", "content": message}]
        for _ in range(MAX_STEPS):
            try:
                response = client.beta.messages.create(
                    model=_model(),
                    max_tokens=MAX_TOKENS,
                    system=SYSTEM_PROMPT,
                    tools=toolbox.anthropic_schemas(),
                    messages=messages,
                    betas=[FALLBACK_BETA],
                    fallbacks="default",
                )
            except anthropic_sdk.AuthenticationError:
                raise ProviderError("ERR_PROVIDER_AUTH", "Claude rejected the saved key.") from None
            except anthropic_sdk.APIError:
                raise ProviderError("ERR_PROVIDER_UNREACHABLE", "Claude did not answer; try again.") from None

            if response.stop_reason == "refusal":
                return AgentReply(self.id, "Claude declined this request.", refused=True, code="ERR_PROVIDER_REFUSAL", tool_calls=toolbox.calls)
            if response.stop_reason == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            tool_uses = [b for b in response.content if b.type == "tool_use"]
            if response.stop_reason != "tool_use" or not tool_uses:
                text = "".join(b.text for b in response.content if b.type == "text").strip()
                return AgentReply(self.id, text, tool_calls=toolbox.calls)

            messages.append({"role": "assistant", "content": response.content})
            results = []
            for block in tool_uses:
                result = toolbox.run(block.name, block.input)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": [{"type": "text", "text": _json(result)}],
                    "is_error": "error" in result,
                })
            messages.append({"role": "user", "content": results})
        return AgentReply(self.id, "The agent stopped after too many steps; nothing was signed.", tool_calls=toolbox.calls)


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)

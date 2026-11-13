"""Agent providers: the built-in agent and bring-your-own models, one tool contract."""

from .anthropic import AnthropicProvider
from .base import AgentReply, Provider, ProviderError
from .builtin import BuiltinProvider
from .planned import GEMINI, MUSE, OPENAI, OPENROUTER

REGISTRY: dict[str, Provider] = {
    p.id: p for p in (BuiltinProvider(), AnthropicProvider(), OPENAI, GEMINI, OPENROUTER, MUSE)
}

__all__ = ["REGISTRY", "AgentReply", "Provider", "ProviderError"]

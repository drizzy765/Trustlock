"""The built-in Podlock agent: deterministic, no key, works offline."""

from __future__ import annotations

from ..tools import Toolbox
from .base import AgentReply


class BuiltinProvider:
    id = "builtin"
    label = "Built-in Podlock agent"
    status = "works_with"
    needs_key = False

    def test_connection(self, api_key: str | None) -> bool:
        return True

    def run(self, api_key: str | None, message: str, toolbox: Toolbox) -> AgentReply:
        terms = toolbox.run("draft_deal", {"text": message})
        if terms.get("refused"):
            return AgentReply(self.id, terms["message"], refused=True, code=terms["code"], tool_calls=toolbox.calls)
        price = terms.get("price_ngn")
        text = (
            f"Draft: {terms['item'] or 'item not found'}, "
            f"{f'NGN {price:,}' if price else 'no price found'}, "
            f"deliver within {terms['deadline_hours']} hours. Nothing is signed until you confirm."
        )
        if terms.get("warning"):
            text += f" {terms['warning']}"
        return AgentReply(self.id, text, tool_calls=toolbox.calls)

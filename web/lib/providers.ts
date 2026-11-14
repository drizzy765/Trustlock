import { agentUrl } from "@/lib/config";

/** One row of the agent API's GET /agent/providers. The API is the only source of truth for what works. */
export interface AgentProvider {
  id: string;
  label: string;
  status: string;
  needs_key: boolean;
}

/** Used only when the agent API can't be reached. Mirrors the API as of 14 Nov 2026, and claims nothing more. */
export const FALLBACK_PROVIDERS: AgentProvider[] = [
  { id: "builtin", label: "Built-in Podlock agent", status: "works_with", needs_key: false },
  { id: "anthropic", label: "Anthropic Claude", status: "planned", needs_key: true },
  { id: "openai", label: "OpenAI ChatGPT (via API)", status: "planned", needs_key: true },
  { id: "gemini", label: "Google Gemini", status: "planned", needs_key: true },
  { id: "openrouter", label: "OpenRouter", status: "planned", needs_key: true },
  { id: "muse", label: "Meta Muse", status: "planned", needs_key: true },
];

/** Server-side fetch (no CORS), cached for 5 minutes, with a short timeout so a cold agent never blocks the page. */
export async function getProviders(): Promise<{ providers: AgentProvider[]; live: boolean }> {
  try {
    const res = await fetch(`${agentUrl}/agent/providers`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("bad shape");
    const providers = data.filter(
      (p): p is AgentProvider => !!p && typeof p.id === "string" && typeof p.label === "string" && typeof p.status === "string"
    );
    return providers.length ? { providers, live: true } : { providers: FALLBACK_PROVIDERS, live: false };
  } catch {
    return { providers: FALLBACK_PROVIDERS, live: false };
  }
}

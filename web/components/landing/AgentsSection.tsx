import { ExternalLink, Plug, Terminal } from "lucide-react";
import LockMark from "@/components/LockMark";
import { agentUrl } from "@/lib/config";
import type { AgentProvider } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { PROVIDER_ICON_PATHS } from "./provider-icons";
import CopyCommand from "./CopyCommand";

type Chip = "works" | "testing" | "adding" | "soon";

const CHIP: Record<Chip, { label: string; className: string }> = {
  // Not green: green means released. Works today is a bone outline.
  works: { label: "Works today", className: "border border-bone text-bone" },
  testing: { label: "In testing", className: "border border-line-strong text-mute" },
  adding: { label: "Being added", className: "border border-line-strong text-mute" },
  soon: { label: "Coming soon", className: "border border-line text-faint" },
};

/** Our own copy per provider id. Status always comes from the API, never from here. */
const COPY: Record<string, { name?: string; by: string; line: string }> = {
  builtin: { name: "TrustLock agent", by: "Built by TrustLock", line: "Drafts deals from a chat message and checks them. No key needed." },
  anthropic: { name: "Claude", by: "Model by Anthropic", line: "Bring your own Claude key on the seller agent page. Being tested end to end." },
  groq: { name: "Groq", by: "Models by Groq", line: "Free Llama models with your own Groq key." },
  openai: { name: "OpenAI", by: "Models by OpenAI", line: "Draft deals with your own OpenAI key." },
  gemini: { name: "Gemini", by: "Model by Google", line: "Draft deals with your own Gemini key." },
  openrouter: { name: "OpenRouter", by: "Model router by OpenRouter", line: "Pick from many models with one OpenRouter key." },
  muse: { name: "Meta Muse", by: "Model by Meta", line: "Draft deals with Meta’s model." },
};

/** BYOK providers that have code in progress. Everything else planned is "coming soon". */
const IN_PROGRESS: Record<string, Chip> = { anthropic: "testing", groq: "adding" };

interface Tile {
  id: string;
  name: string;
  by: string;
  line: string;
  chip: Chip;
}

function toTile(p: AgentProvider): Tile {
  const c = COPY[p.id];
  const chip: Chip = p.status === "works_with" ? "works" : (IN_PROGRESS[p.id] ?? "soon");
  return { id: p.id, name: c?.name ?? p.label, by: c?.by ?? "", line: c?.line ?? "Not built yet.", chip };
}

function Logo({ id }: { id: string }) {
  if (id === "builtin") return <LockMark state="created" size={24} label="TrustLock" />;
  const icon = PROVIDER_ICON_PATHS[id];
  if (!icon)
    return (
      <span className="flex size-6 items-center justify-center text-mute">
        <Plug aria-hidden="true" strokeWidth={1.5} className="size-5" />
      </span>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 fill-bone" role="img" aria-label={icon.title}>
      <path d={icon.d} />
    </svg>
  );
}

function TileCard({ t }: { t: Tile }) {
  const chip = CHIP[t.chip];
  return (
    <li className="flex flex-col rounded-[12px] border border-line bg-ink-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <Logo id={t.id} />
        <span className={cn("inline-flex h-6 items-center rounded-[6px] px-2 text-[13px] whitespace-nowrap", chip.className)}>{chip.label}</span>
      </div>
      <p className="mt-4 font-medium text-bone">{t.name}</p>
      {t.by ? <p className="text-[13px] text-faint">{t.by}</p> : null}
      <p className="mt-2 text-[15px] text-mute">{t.line}</p>
    </li>
  );
}

const GROUPS: { title: string; note: string; chips: Chip[]; cols: string }[] = [
  { title: "Works today", note: "Live on the agent API now.", chips: ["works"], cols: "lg:grid-cols-3" },
  { title: "Bring your own key", note: "Your own key, stored encrypted on the agent server.", chips: ["testing", "adding"], cols: "lg:grid-cols-3" },
  { title: "Planned", note: "Listed by the API, not built yet.", chips: ["soon"], cols: "lg:grid-cols-4" },
];

/**
 * "Works with your AI agent" (design rule 15 exception): a status-labelled list rendered from the agent API's
 * own GET /agent/providers, so the page can never claim more than the API does. Not a logo wall.
 */
export default function AgentsSection({ providers, live }: { providers: AgentProvider[]; live: boolean }) {
  const tiles = providers.map(toTile);
  // Groq is being added in agent/. Until the API lists it, show it as "being added" and nothing more.
  if (!providers.some((p) => p.id === "groq")) {
    tiles.push({ id: "groq", ...COPY.groq, name: "Groq", chip: "adding" });
  }
  const curl = `curl -X POST ${agentUrl}/deals/preview -H 'content-type: application/json' -d '{"text":"Ankara two-piece, size M, 12 USDC"}'`;

  return (
    <section id="agents" className="mx-auto mt-24 max-w-[1200px] scroll-mt-24 px-5 md:mt-32 md:px-8">
      <div className="border-t border-line pt-10">
        <h2 className="text-[28px] leading-tight">Works with your AI agent</h2>
        <p className="mt-4 max-w-[640px] text-[18px] text-mute">
          The agent drafts a deal from a chat message and checks it. It never holds or moves money. This list comes straight from the agent
          API{live ? "" : " (last known list: the API didn’t answer just now)"}.
        </p>

        <div className="mt-10 space-y-10">
          {GROUPS.map((g) => {
            const list = tiles.filter((t) => g.chips.includes(t.chip));
            if (!list.length) return null;
            return (
              <div key={g.title}>
                <h3 className="text-[20px] leading-tight">{g.title}</h3>
                <p className="mt-1 text-[15px] text-faint">{g.note}</p>
                <ul className={cn("mt-4 grid gap-4 sm:grid-cols-2", g.cols)}>
                  {list.map((t) => (
                    <TileCard key={t.id} t={t} />
                  ))}
                </ul>
              </div>
            );
          })}

          <div>
            <h3 className="text-[20px] leading-tight">Your own agent</h3>
            <div className="mt-4 rounded-[12px] border border-line bg-ink-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <Terminal aria-hidden="true" strokeWidth={1.5} className="size-6 text-bone" />
                <span className="inline-flex h-6 items-center rounded-[6px] border border-bone px-2 text-[13px] text-bone">Open API</span>
              </div>
              <p className="mt-4 font-medium">Any agent that can call an HTTP API can use TrustLock.</p>
              <p className="mt-1 text-[15px] text-mute">Read the spec, then try a dry-run preview. It only reads a message and drafts nothing.</p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
                <a
                  href={`${agentUrl}/openapi.json`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-1.5 text-bone underline underline-offset-4 transition-colors duration-150 hover:text-mute"
                >
                  OpenAPI spec <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-4" />
                </a>
                <a
                  href={`${agentUrl}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-1.5 text-bone underline underline-offset-4 transition-colors duration-150 hover:text-mute"
                >
                  Interactive API docs <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-4" />
                </a>
              </div>
              <div className="mt-3">
                <CopyCommand command={curl} />
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-[13px] text-faint">
          Product names and logos belong to their owners. Listing a provider doesn&rsquo;t mean it endorses TrustLock. Logos from Simple Icons (CC0).
        </p>
      </div>
    </section>
  );
}

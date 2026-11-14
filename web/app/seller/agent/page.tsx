"use client";

import { useEffect, useState } from "react";
import { initNear, getAccountId, signIn } from "@/lib/near";
import { agentUrl } from "@/lib/config";
import { toast } from "sonner";
import { KeyRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Hint } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Provider = { id: string; label: string; status: "works_with" | "planned"; needs_key: boolean };
type AgentStatus = { seller_id: string; provider: string; key: { saved: boolean; masked: string | null } };

const STATUS_LABEL: Record<Provider["status"], string> = { works_with: "Works with", planned: "Planned" };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${agentUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? "The agent did not answer.");
  return body as T;
}

export default function SellerAgentPage() {
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    initNear().then(() => setSellerId(getAccountId()));
    call<Provider[]>("/agent/providers").then(setProviders).catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    if (sellerId) call<AgentStatus>(`/sellers/${sellerId}/agent`).then(setStatus).catch((e) => setMessage(e.message));
  }, [sellerId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const chooseProvider = (provider: string) =>
    run(async () => {
      setStatus(await call<AgentStatus>(`/sellers/${sellerId}/agent`, { method: "PUT", body: JSON.stringify({ provider }) }));
    });

  const saveKey = () =>
    run(async () => {
      const saved = await call<AgentStatus>(`/sellers/${sellerId}/agent/key`, {
        method: "PUT",
        body: JSON.stringify({ api_key: apiKey }),
      });
      setApiKey("");
      setStatus(saved);
      setMessage("Key saved. Only its last 4 characters are shown.");
    });

  const deleteKey = () =>
    run(async () => {
      setStatus(await call<AgentStatus>(`/sellers/${sellerId}/agent/key`, { method: "DELETE" }));
      setMessage("Key deleted.");
    });

  const testConnection = () =>
    run(async () => {
      const result = await call<{ ok: boolean }>(`/sellers/${sellerId}/agent/test`, { method: "POST" });
      setMessage(result.ok ? "Connection works." : "The provider rejected this key.");
    });

  // Test results and save confirmations surface as a toast too (aria-live via the toaster).
  useEffect(() => {
    if (message) toast(message);
  }, [message]);

  if (!sellerId) {
    return (
      <main className="mx-auto max-w-[640px] px-5 pt-10 md:px-8 md:pt-14">
        <h1 className="text-[32px] leading-tight md:text-[40px]">Your AI agent</h1>
        <p className="mt-2 text-mute">Connect your wallet to choose the agent that drafts and checks your deals.</p>
        <Button className="mt-6" onClick={() => signIn()}>
          <Wallet aria-hidden="true" strokeWidth={1.5} />
          Connect wallet
        </Button>
      </main>
    );
  }

  const current = providers.find((p) => p.id === status?.provider);

  return (
    <main className="mx-auto max-w-[640px] px-5 pt-10 md:px-8 md:pt-14">
      <h1 className="text-[32px] leading-tight md:text-[40px]">Bring your own AI. It can&rsquo;t touch your money.</h1>
      <p className="mt-3 text-mute">
        <strong className="font-medium text-bone">AI does the work. Cryptography holds the money.</strong> Your agent reads the deal, checks
        payment evidence, answers buyers and prepares transactions for a person to sign. It can never release, move or refund funds.
      </p>

      <section aria-labelledby="choose-title" className="mt-10">
        <h2 id="choose-title" className="text-[20px]">
          Choose an agent
        </h2>
        <fieldset className="mt-4 divide-y divide-line rounded-[12px] border border-line bg-ink-900" disabled={busy}>
          <legend className="sr-only">Agent provider</legend>
          {providers.length === 0 ? <p className="px-5 py-4 text-mute">Loading providers from the agent…</p> : null}
          {providers.map((p) => (
            <label key={p.id} className="flex min-h-14 cursor-pointer items-center gap-3 px-5 py-3 hover:bg-ink-800 has-[:disabled]:cursor-not-allowed">
              <input
                type="radio"
                name="provider"
                className="size-4 accent-bone"
                checked={status?.provider === p.id}
                disabled={busy}
                onChange={() => chooseProvider(p.id)}
              />
              <span className="flex-1 text-bone">{p.label}</span>
              <span
                className={cn(
                  "inline-flex h-7 items-center rounded-[6px] px-2 text-sm",
                  p.status === "works_with" ? "bg-release/12 text-release" : "bg-faint/12 text-mute"
                )}
              >
                {STATUS_LABEL[p.status]}
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      {current?.needs_key && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>API key</CardTitle>
            <KeyRound aria-hidden="true" strokeWidth={1.5} className="size-5 text-faint" />
          </CardHeader>
          <CardBody>
            <p className="text-[15px] text-mute">
              Saved key:{" "}
              {status?.key.saved ? <span className="font-mono text-bone">{status.key.masked}</span> : <span className="text-bone">none</span>}. Keys are
              encrypted on the server and never shown again.
            </p>
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && apiKey.length >= 8) saveKey();
              }}
            >
              <Label htmlFor="agent-key">Paste your API key</Label>
              <Input
                id="agent-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                placeholder="sk-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Hint>Only the last 4 characters are ever shown back.</Hint>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || apiKey.length < 8}>
                  {status?.key.saved ? "Replace key" : "Save key"}
                </Button>
                <Button variant="secondary" disabled={busy || !status?.key.saved} onClick={testConnection}>
                  Test connection
                </Button>
                <Button variant="ghost" disabled={busy || !status?.key.saved} onClick={deleteKey}>
                  Delete key
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

    </main>
  );
}

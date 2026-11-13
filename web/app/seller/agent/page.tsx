"use client";

import { useEffect, useState } from "react";
import { initNear, getAccountId, signIn } from "@/lib/near";
import { agentUrl } from "@/lib/config";

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

  if (!sellerId) {
    return (
      <main className="container">
        <h1>Your AI agent</h1>
        <p>Connect your wallet to choose an agent.</p>
        <button className="btn-primary" onClick={() => signIn()}>Connect wallet</button>
      </main>
    );
  }

  const current = providers.find((p) => p.id === status?.provider);

  return (
    <main className="container">
      <h1>Bring your own AI. It can&apos;t touch your money.</h1>
      <p>
        <strong>AI does the work. Cryptography holds the money.</strong> Your agent reads the deal, checks payment
        evidence, answers buyers and prepares transactions for a person to sign. It can never release, move or
        refund funds.
      </p>

      <section className="glass-card">
        <h2>Choose an agent</h2>
        {providers.map((p) => (
          <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
            <input
              type="radio"
              name="provider"
              checked={status?.provider === p.id}
              disabled={busy}
              onChange={() => chooseProvider(p.id)}
            />
            <span>{p.label}</span>
            <span className={`status-badge ${p.status === "works_with" ? "status-released" : "status-created"}`}>
              {STATUS_LABEL[p.status]}
            </span>
          </label>
        ))}
      </section>

      {current?.needs_key && (
        <section className="glass-card">
          <h2>API key</h2>
          <p>
            Saved key: {status?.key.saved ? <code>{status.key.masked}</code> : "none"}. Keys are encrypted on the
            server and never shown again.
          </p>
          <input
            type="password"
            autoComplete="off"
            placeholder="Paste your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn-primary" disabled={busy || apiKey.length < 8} onClick={saveKey}>
              {status?.key.saved ? "Replace key" : "Save key"}
            </button>
            <button disabled={busy || !status?.key.saved} onClick={testConnection}>Test connection</button>
            <button disabled={busy || !status?.key.saved} onClick={deleteKey}>Delete key</button>
          </div>
        </section>
      )}

      {message && <p role="status">{message}</p>}
    </main>
  );
}

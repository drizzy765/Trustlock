"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { initNear, signIn } from "@/lib/near";
import { setupSelector } from "@/lib/wallet";
import { Button } from "@/components/ui/button";

/** Fallback target of the nav's Connect link: opens the selector modal (Meteor Wallet, testnet). */
export default function ConnectPage() {
  const [failed, setFailed] = useState(false);
  const [connected, setConnected] = useState(false);

  function start() {
    setFailed(false);
    initNear()
      .then(async ({ accountId }) => {
        // Back from the wallet (or already connected): go home instead of opening the modal again.
        if (accountId) {
          window.location.replace("/");
          return;
        }
        const selector = await setupSelector();
        selector.store.observable.subscribe((state) => {
          if (state.accounts[0]?.accountId) {
            setConnected(true);
            window.location.replace("/");
          }
        });
        await signIn();
      })
      .catch(() => setFailed(true));
  }

  useEffect(start, []);

  return (
    <main className="mx-auto max-w-[560px] px-5 py-24 md:px-8">
      <h1 className="text-[32px] font-medium tracking-[-0.02em]">Connect your NEAR wallet</h1>
      <p className="mt-3 text-mute">
        {connected
          ? "Connected — taking you home…"
          : failed
            ? "We couldn't open the wallet. Check your connection and try again."
            : "Opening Meteor Wallet (testnet)…"}
      </p>
      <Button className="mt-8" variant="secondary" onClick={start}>
        <Wallet aria-hidden="true" strokeWidth={1.5} />
        Open wallet
      </Button>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { initNearWithTimeout, isSignedIn, signIn } from "@/lib/near";
import { Button } from "@/components/ui/button";

/** Fallback target of the nav's Connect link: opens MyNearWallet as soon as the page loads. */
export default function ConnectPage() {
  const [failed, setFailed] = useState(false);

  function start() {
    setFailed(false);
    initNearWithTimeout()
      .then(() => {
        // Back from the wallet (or already connected): go home instead of signing in again.
        if (isSignedIn()) window.location.replace("/");
        else return signIn({ successUrl: `${window.location.origin}/` });
      })
      .catch(() => setFailed(true));
  }

  useEffect(start, []);

  return (
    <main className="mx-auto max-w-[560px] px-5 py-24 md:px-8">
      <h1 className="text-[32px] font-medium tracking-[-0.02em]">Connect your NEAR wallet</h1>
      <p className="mt-3 text-mute">
        {failed ? "We couldn't open the wallet. Check your connection and try again." : "Opening MyNearWallet (testnet)…"}
      </p>
      <Button className="mt-8" variant="secondary" onClick={start}>
        <Wallet aria-hidden="true" strokeWidth={1.5} />
        Open wallet
      </Button>
    </main>
  );
}

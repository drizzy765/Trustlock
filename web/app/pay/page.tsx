"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Hint } from "@/components/ui/input";

// Legacy entry point. Old links look like /pay?id=<id>; current links look
// like /pay/<draft id> and are served by app/pay/[id]. This page only forwards.
function PayRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const [entry, setEntry] = useState("");

  useEffect(() => {
    if (id) {
      router.replace(`/pay/${encodeURIComponent(id)}`);
    }
  }, [id, router]);

  if (id) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-14 [&>*]:max-w-[640px]">
        <p role="status" className="text-mute">Opening your deal…</p>
      </main>
    );
  }

  // Accept a full payment link or a bare deal number; forward to the same /pay/<id> route.
  function open() {
    const raw = entry.trim();
    const fromLink = raw.match(/\/pay\/(\d+)(\?[^\s#]*)?/);
    if (fromLink) return router.push(`/pay/${fromLink[1]}${fromLink[2] ?? ""}`);
    if (/^\d+$/.test(raw)) router.push(`/pay/${raw}`);
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-14 [&>*]:max-w-[640px]">
      <h1 className="text-[32px] leading-tight md:text-[40px]">Pay for an order</h1>
      <p className="mt-2 text-mute">Open the payment link your seller sent you, or paste it here.</p>
      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          open();
        }}
      >
        <Label htmlFor="pay-link">Payment link or deal number</Label>
        <Input
          id="pay-link"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="none"
          className="font-mono"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="https://…/pay/12"
        />
        <Hint>The link looks like …/pay/12. Your seller makes one on TrustLock.</Hint>
        <Button type="submit" size="lg" className="mt-5" disabled={!entry.trim()}>
          Open deal
        </Button>
      </form>
      <p className="mt-10 text-[15px] text-mute">
        Selling something?{" "}
        <Link href="/seller/onboard" className={buttonVariants({ variant: "ghost", size: "sm" }) + " -ml-2 text-bone underline underline-offset-4"}>
          Create a payment link
        </Link>
      </p>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-[640px] px-5 pt-10 text-mute md:px-8">Loading…</p>}>
      <PayRedirect />
    </Suspense>
  );
}

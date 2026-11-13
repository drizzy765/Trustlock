"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

// Legacy entry point. Old links look like /pay?id=<id>; current links look
// like /pay/<draft id> and are served by app/pay/[id]. This page only forwards.
function PayRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");

  useEffect(() => {
    if (id) {
      router.replace(`/pay/${encodeURIComponent(id)}`);
    }
  }, [id, router]);

  if (id) {
    return (
      <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
        <p>Opening your deal…</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Pay for a deal</h1>
      <p style={{ color: "#888" }}>
        Open the payment link your seller shared with you. Sellers create one here:
      </p>
      <Link
        href="/seller/onboard"
        style={{
          display: "inline-block",
          background: "#22c55e",
          color: "#000",
          padding: "12px 24px",
          borderRadius: 6,
          fontWeight: "bold",
          textDecoration: "none",
          marginTop: 8
        }}
      >
        Seller — create a deal →
      </Link>
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link href="/" style={{ color: "#3b82f6", textDecoration: "none", fontSize: 14 }}>
          ← Back to home
        </Link>
      </div>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading...</div>}>
      <PayRedirect />
    </Suspense>
  );
}

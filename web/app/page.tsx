import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <p style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 12 }}>TrustLock</p>
      <h1>Pay on delivery. The rider is the proof.</h1>
      <p>
        The buyer locks USDC on NEAR. The dispatch rider scans a one-time QR. The seller is paid.
        The AI writes the deal — it cannot move funds.
      </p>
      <ul>
        <li><Link href="/pay">Buyer pay page</Link></li>
        <li><Link href="/scan">Rider scan page</Link></li>
        <li><Link href="/dashboard">Seller dashboard</Link></li>
      </ul>
      <p>Mode badge will read demo, dry or live. Never show live without a real execute.</p>
    </main>
  );
}

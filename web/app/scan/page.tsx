export default function ScanPage() {
  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Rider — confirm delivery</h1>
      <p>Camera or paste for the buyer one-time QR. This page calls confirm_delivery with the rider function-call key.</p>
      <p>A replayed QR must fail on chain. Do not add an "override" button.</p>
    </main>
  );
}

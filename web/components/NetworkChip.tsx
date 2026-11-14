import { network } from "@/lib/config";

/** The network is a real chip, not an eyebrow. Pill radius (the other pill use). */
export default function NetworkChip() {
  const label = network === "mainnet" ? "Mainnet" : network === "testnet" ? "Testnet" : network;
  return (
    <span className="inline-flex h-7 items-center rounded-full border border-line-strong px-2.5 text-sm text-mute">
      {label}
    </span>
  );
}

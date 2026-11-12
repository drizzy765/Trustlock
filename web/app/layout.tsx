"use client";

import { WalletProvider } from "@/lib/wallet-provider";
import "@near-wallet-selector/modal-ui/styles.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Georgia, serif", margin: 0, background: "#0f1410", color: "#f4efe4" }}>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}

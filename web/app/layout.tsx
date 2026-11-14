import type { Metadata, Viewport } from "next";
// avoid-ai-design-ignore: T2, T4 — Geist is the brand face: the TrustLock wordmark is outlined from Geist Medium.
import { Geist, Geist_Mono } from "next/font/google";
import "@near-wallet-selector/modal-ui/styles.css";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-provider";
import Providers from "./providers";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";

// avoid-ai-design-ignore: T2, T4 — Geist is the brand face (the wordmark is Geist Medium), themed with tight display tracking and tabular figures.
const sans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const tagline = "Pay on delivery for African sellers across social media and any chat app.";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "TrustLock: pay on delivery", template: "%s · TrustLock" },
  description: tagline,
  applicationName: "TrustLock",
  openGraph: {
    title: "TrustLock: pay on delivery",
    description: `${tagline} USDC escrow on NEAR. Released only on delivery proof.`,
    siteName: "TrustLock",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrustLock: pay on delivery",
    description: tagline,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0C0B",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <WalletProvider>
          <Providers>
            <SiteNav />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </Providers>
        </WalletProvider>
      </body>
    </html>
  );
}

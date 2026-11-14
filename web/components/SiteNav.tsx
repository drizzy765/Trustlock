"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, Wallet, X, LogOut } from "lucide-react";
import { toast } from "sonner";
import { initNear, signIn, signOut } from "@/lib/near";
import { setupSelector } from "@/lib/wallet";
import { middle } from "@/lib/format";
import { cn } from "@/lib/utils";
import NetworkChip from "./NetworkChip";
import { Button, buttonVariants } from "./ui/button";

const LINKS = [
  { href: "/seller/onboard", label: "Sell" },
  { href: "/pay", label: "Pay" },
  { href: "/scan", label: "Scan" },
  { href: "/dashboard", label: "History" },
  { href: "/seller/agent", label: "AI agent" },
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname() ?? "/";
  const [accountId, setAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Only swaps the Connect button for the account once the wallet is ready. Never blocks the button.
    // The selector modal signs in outside React, so follow the selector store afterwards.
    let unsubscribe: { unsubscribe: () => void } | null = null;
    initNear()
      .then(async ({ accountId }) => {
        setAccountId(accountId);
        const selector = await setupSelector();
        unsubscribe = selector.store.observable.subscribe((state) => {
          setAccountId(state.accounts[0]?.accountId ?? null);
        });
      })
      .catch(() => setAccountId(null));
    return () => {
      unsubscribe?.unsubscribe();
    };
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function disconnect() {
    signOut().then(() => setAccountId(null));
  }

  async function connectWallet(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (connecting) return;
    setConnecting(true);
    try {
      // Opens the selector modal (Meteor Wallet, testnet). The store
      // subscription above swaps the button once the wallet connects.
      await signIn();
    } catch {
      toast.error("Couldn't open the NEAR wallet. Check your connection and try again.");
    } finally {
      setConnecting(false);
    }
  }

  // Rendered on the server as a real link to /connect, so it works even if this
  // component never hydrates (for example when a browser extension breaks hydration).
  const wallet = accountId ? (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-sm text-bone" title={accountId} translate="no">
        {middle(accountId, 10, 8)}
      </span>
      <Button variant="ghost" size="icon" onClick={disconnect} aria-label="Disconnect wallet" className="size-9">
        <LogOut aria-hidden="true" strokeWidth={1.5} className="!size-4" />
      </Button>
    </span>
  ) : (
    <a
      href="/connect"
      onClick={connectWallet}
      aria-busy={connecting || undefined}
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      <Wallet aria-hidden="true" strokeWidth={1.5} className="!size-4" />
      {connecting ? "Opening wallet…" : "Connect wallet"}
    </a>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-950">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 md:px-8">
        <Link href="/" aria-label="Podlock home" className="flex shrink-0 items-center rounded-[6px]">
          <Image src="/brand/trustlock-logo-dark.svg" alt="Podlock" width={91} height={28} priority className="h-6 w-auto md:h-7" />
        </Link>
        <ul className="hidden h-full items-stretch gap-6 lg:flex">
          {LINKS.map((l) => {
            const active = isCurrent(pathname, l.href);
            return (
              <li key={l.href} className="relative flex items-center">
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("text-[15px] transition-colors duration-150 hover:text-bone", active ? "text-bone" : "text-mute")}
                >
                  {l.label}
                </Link>
                {active ? <span aria-hidden="true" className="absolute right-0 bottom-0 left-0 h-0.5 bg-bone" /> : null}
              </li>
            );
          })}
        </ul>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <NetworkChip />
          {wallet}
        </div>
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <NetworkChip />
          <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <X aria-hidden="true" strokeWidth={1.5} /> : <Menu aria-hidden="true" strokeWidth={1.5} />}
          </Button>
        </div>
      </nav>
      {open ? (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto overscroll-contain bg-ink-950 px-5 pt-4 pb-8 lg:hidden">
          <ul className="border-t border-line">
            {LINKS.map((l) => {
              const active = isCurrent(pathname, l.href);
              return (
                <li key={l.href} className="border-b border-line">
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-14 items-center text-[20px]", active ? "text-bone" : "text-mute")}
                  >
                    {active ? <span aria-hidden="true" className="mr-3 h-6 w-0.5 bg-bone" /> : null}
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-6">{wallet}</div>
        </div>
      ) : null}
    </header>
  );
}

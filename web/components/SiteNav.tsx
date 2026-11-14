"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, Wallet, X, LogOut } from "lucide-react";
import { initNear, getAccountId, signIn, signOut } from "@/lib/near";
import { middle } from "@/lib/format";
import { cn } from "@/lib/utils";
import NetworkChip from "./NetworkChip";
import { Button } from "./ui/button";

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
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    initNear()
      .then(() => setAccountId(getAccountId()))
      .catch(() => setAccountId(null))
      .finally(() => setReady(true));
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
    signOut();
    window.location.reload();
  }

  const wallet = !ready ? (
    <span className="h-9 w-28 rounded-[8px] bg-ink-800" aria-hidden="true" />
  ) : accountId ? (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-sm text-bone" title={accountId} translate="no">
        {middle(accountId, 10, 8)}
      </span>
      <Button variant="ghost" size="icon" onClick={disconnect} aria-label="Disconnect wallet" className="size-9">
        <LogOut aria-hidden="true" strokeWidth={1.5} className="!size-4" />
      </Button>
    </span>
  ) : (
    <Button variant="secondary" size="sm" onClick={() => signIn()}>
      <Wallet aria-hidden="true" strokeWidth={1.5} className="!size-4" />
      Connect wallet
    </Button>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-950">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 md:px-8">
        <Link href="/" aria-label="TrustLock home" className="flex shrink-0 items-center rounded-[6px]">
          <Image src="/brand/trustlock-logo-dark.svg" alt="TrustLock" width={105} height={28} priority className="h-6 w-auto md:h-7" />
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
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-ink-950 px-5 pt-4 pb-8 lg:hidden">
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

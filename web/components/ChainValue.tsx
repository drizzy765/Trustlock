"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { middle } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Mono chain data (account, hash, contract id), truncated in the middle,
 * with a copy button and an explorer link. avoid-ai-design-ignore: SD4m — mono is for chain data only.
 */
export default function ChainValue({
  value,
  href,
  label,
  full = false,
  className,
}: {
  value: string;
  href?: string;
  label?: string;
  full?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /* clipboard blocked: the value is still selectable */
    }
  }

  return (
    <span className={cn("inline-flex max-w-full min-w-0 items-center gap-1 align-middle", className)}>
      <span
        className={cn("min-w-0 font-mono text-[14px] text-bone", full ? "break-all" : "truncate")}
        title={value}
        translate="no"
      >
        {full ? value : middle(value)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `Copied ${label ?? "value"}` : `Copy ${label ?? "value"}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-bone"
      >
        {copied ? <Check aria-hidden="true" strokeWidth={1.5} className="size-4 text-release" /> : <Copy aria-hidden="true" strokeWidth={1.5} className="size-4" />}
      </button>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label ?? "value"} on NearBlocks`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-bone"
        >
          <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </a>
      ) : null}
    </span>
  );
}

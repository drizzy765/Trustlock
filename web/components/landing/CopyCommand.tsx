"use client";

import { useEffect, useState } from "react";
import { Copy, CopyCheck } from "lucide-react";

/** One-line shell command with a copy button. */
export default function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex items-center gap-2 rounded-[6px] border border-line bg-ink-950 py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[13px] whitespace-nowrap text-mute" translate="no">
        {command}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
          } catch {
            /* clipboard blocked: the command is still selectable */
          }
        }}
        aria-label={copied ? "Copied command" : "Copy command"}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-[6px] text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-bone"
      >
        {copied ? <CopyCheck aria-hidden="true" strokeWidth={1.5} className="size-4 text-release" /> : <Copy aria-hidden="true" strokeWidth={1.5} className="size-4" />}
      </button>
    </div>
  );
}

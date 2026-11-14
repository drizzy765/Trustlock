"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Clock, ScanLine, UserCheck, PackageCheck, Undo2 } from "lucide-react";
import LockMark from "@/components/LockMark";
import { cn } from "@/lib/utils";

const INPUTS = [
  { icon: UserCheck, title: "Buyer confirms", line: "The buyer confirms delivery." },
  { icon: ScanLine, title: "Rider scans the code", line: "The one-time QR at the door." },
  { icon: Clock, title: "Deadline passes", line: "No delivery in time: refund." },
] as const;

// Row centres for a 4-row grid, as % of its height.
const ROW_Y = [12.5, 37.5, 62.5, 87.5];

/** "What moves the money": who can move funds, as a small diagram. Hover only recolours a path (no movement). */
export default function MoneyPaths() {
  const [hot, setHot] = useState<number | null>(null);
  const stroke = (i: number) =>
    cn("transition-[stroke] duration-150 ease-[var(--ease-ui)] motion-reduce:transition-none", hot === i ? "stroke-bone" : "stroke-line-strong");

  return (
    <section className="mx-auto mt-24 max-w-[1200px] px-5 md:mt-32 md:px-8">
      <div className="border-t border-line pt-10">
        <h2 className="text-[28px] leading-tight">What moves the money</h2>
        <p className="mt-4 max-w-[640px] text-[18px] text-mute">
          Only three things can move funds out of escrow. The AI agent isn&rsquo;t one of them.
        </p>

        {/* Desktop diagram: inputs → contract → outcomes, on one 4-row grid so the lines meet the rows. */}
        <div className="mt-10 hidden grid-cols-[minmax(0,300px)_72px_200px_72px_minmax(0,260px)] grid-rows-[repeat(4,76px)] md:grid">
          {INPUTS.map(({ icon: Icon, title, line }, i) => (
            <div
              key={title}
              className="col-start-1 flex items-center gap-3 rounded-[8px] px-3 transition-colors duration-150 hover:bg-ink-900 motion-reduce:transition-none"
              style={{ gridRow: i + 1 }}
              onPointerEnter={() => setHot(i)}
              onPointerLeave={() => setHot(null)}
            >
              <Icon aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-bone" />
              <div className="min-w-0">
                <p className="font-medium text-bone">{title}</p>
                <p className="text-[14px] text-mute">{line}</p>
              </div>
            </div>
          ))}
          <div className="col-start-1 row-start-4 flex items-center gap-3 rounded-[8px] border border-dashed border-line-strong px-3">
            <Bot aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-mute" />
            <div className="min-w-0">
              <p className="font-medium text-mute">AI agent</p>
              <p className="text-[14px] text-faint">Drafts and checks deals. Can&rsquo;t move funds.</p>
            </div>
          </div>

          <svg className="col-start-2 row-span-4 row-start-1 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M0 ${ROW_Y[i]} C 50 ${ROW_Y[i]}, 50 50, 100 50`} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={stroke(i)} />
            ))}
            {/* The agent's line stops short of the contract. */}
            <path d={`M0 ${ROW_Y[3]} L 38 ${ROW_Y[3]}`} fill="none" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" className="stroke-line-strong" />
          </svg>

          <div className="col-start-3 row-span-4 row-start-1 self-center rounded-[12px] border border-line bg-ink-900 p-4 text-center">
            <LockMark state="funded" size={40} label="Escrow contract" className="mx-auto" />
            <p className="mt-2 font-medium">Escrow contract</p>
            <p className="text-[14px] text-mute">Holds the USDC on NEAR</p>
          </div>

          <svg className="col-start-4 row-span-4 row-start-1 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={`M0 50 C 50 50, 50 ${ROW_Y[1]}, 100 ${ROW_Y[1]}`} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={stroke(hot === 0 || hot === 1 ? hot : -1)} />
            <path d={`M0 50 C 50 50, 50 ${ROW_Y[2]}, 100 ${ROW_Y[2]}`} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={stroke(hot === 2 ? 2 : -1)} />
          </svg>

          <div className="col-start-5 row-start-2 flex items-center gap-3 px-3">
            <PackageCheck aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-release" />
            <div>
              <p className="font-medium text-release">Seller paid</p>
              <p className="text-[14px] text-mute">After confirm or scan</p>
            </div>
          </div>
          <div className="col-start-5 row-start-3 flex items-center gap-3 px-3">
            <Undo2 aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-refund" />
            <div>
              <p className="font-medium text-refund">Buyer refunded</p>
              <p className="text-[14px] text-mute">After the deadline</p>
            </div>
          </div>
        </div>

        {/* Mobile: the same facts as a list. */}
        <div className="mt-8 space-y-4 md:hidden">
          <ul className="space-y-3">
            {INPUTS.map(({ icon: Icon, title, line }) => (
              <li key={title} className="flex items-start gap-3">
                <Icon aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-5 shrink-0 text-bone" />
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-[14px] text-mute">{line}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 rounded-[12px] border border-line bg-ink-900 p-4">
            <LockMark state="funded" size={32} label="Escrow contract" />
            <div>
              <p className="font-medium">Escrow contract</p>
              <p className="text-[14px]">
                <span className="text-release">Seller paid</span> <span className="text-faint">or</span> <span className="text-refund">buyer refunded</span>
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-[8px] border border-dashed border-line-strong p-3">
            <Bot aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-5 shrink-0 text-mute" />
            <p className="text-[14px] text-mute">The AI agent drafts and checks deals. It can&rsquo;t move funds.</p>
          </div>
        </div>

        <Link href="/dashboard" className="mt-8 inline-flex h-11 items-center text-bone underline underline-offset-4 hover:text-mute">
          See every deal on the contract
        </Link>
      </div>
    </section>
  );
}

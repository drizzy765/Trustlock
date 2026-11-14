"use client";

import { motion, useReducedMotion } from "motion/react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineStep {
  title: string;
  detail?: string;
  href?: string;
}

type Tone = "lock" | "release" | "refund" | "danger" | "bone";

const RING: Record<Tone, string> = {
  lock: "border-lock",
  release: "border-release",
  refund: "border-refund",
  danger: "border-danger",
  bone: "border-bone",
};
const FILL: Record<Tone, string> = {
  lock: "bg-lock",
  release: "bg-release",
  refund: "bg-refund",
  danger: "bg-danger",
  bone: "bg-bone",
};

/** Steps for a contract status. Branches: Disputed, and Expired then Refunded. */
export function stepsForStatus(status: string | null | undefined, hint?: { txHref?: string }) {
  const created: TimelineStep = { title: "Created", detail: "The seller shared a payment link." };
  const locked: TimelineStep = { title: "Locked", detail: "The buyer locked USDC in escrow on NEAR." };
  const delivered: TimelineStep = { title: "Delivered", detail: "The rider scanned the code, or the buyer confirmed." };
  const released: TimelineStep = { title: "Released", detail: "USDC went to the seller.", href: hint?.txHref };

  switch (status) {
    case "Funded":
      return { steps: [created, locked, delivered, released], current: 1, tone: "lock" as Tone, done: false };
    case "Delivered":
      return { steps: [created, locked, delivered, released], current: 2, tone: "release" as Tone, done: false };
    case "Released":
      return { steps: [created, locked, delivered, released], current: 3, tone: "release" as Tone, done: true };
    case "Expired":
      return {
        steps: [created, locked, { title: "Expired", detail: "The deadline passed before delivery." }, { title: "Refunded", detail: "USDC goes back to the buyer." }],
        current: 2,
        tone: "refund" as Tone,
        done: false,
      };
    case "Refunded":
      return {
        steps: [created, locked, { title: "Expired", detail: "The deadline passed before delivery." }, { title: "Refunded", detail: "USDC went back to the buyer.", href: hint?.txHref }],
        current: 3,
        tone: "refund" as Tone,
        done: true,
      };
    case "Disputed":
      return {
        steps: [created, locked, { title: "Manual review", detail: "Funds stay locked until the dispute is resolved or times out." }],
        current: 2,
        tone: "danger" as Tone,
        done: false,
      };
    default:
      return { steps: [created, locked, delivered, released], current: 0, tone: "bone" as Tone, done: false };
  }
}

/**
 * Vertical, Wise-style tracker. Done steps: filled dot + check. Current: a ring that pulses twice, then holds.
 * `numbered` shows the real 4-step sequence (landing) without any state.
 */
export default function DealTimeline({
  steps,
  current = -1,
  tone = "bone",
  done = false,
  numbered = false,
  className,
}: {
  steps: TimelineStep[];
  current?: number;
  tone?: Tone;
  done?: boolean;
  numbered?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <ol className={cn("relative", className)}>
      {steps.map((step, i) => {
        const isDone = !numbered && (i < current || (done && i === current));
        const isCurrent = !numbered && i === current && !done;
        const last = i === steps.length - 1;
        return (
          <li key={`${step.title}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
            {!last ? (
              <span aria-hidden="true" className="absolute top-8 bottom-0 left-[13px] w-px bg-line">
                <motion.span
                  className={cn("absolute inset-0 origin-top", FILL[tone])}
                  initial={false}
                  animate={{ scaleY: isDone ? 1 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </span>
            ) : null}
            <span className="relative mt-0.5 flex size-7 shrink-0 items-center justify-center">
              {numbered ? (
                <span className="flex size-7 items-center justify-center rounded-full border border-line-strong font-mono text-sm text-bone">
                  {i + 1}
                </span>
              ) : isDone ? (
                <span className={cn("flex size-7 items-center justify-center rounded-full text-ink-950", FILL[tone])}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              ) : isCurrent ? (
                <>
                  {!reduce ? (
                    <motion.span
                      key={`pulse-${current}-${tone}`}
                      aria-hidden="true"
                      className={cn("absolute inset-0 rounded-full border-2", RING[tone])}
                      initial={{ scale: 1, opacity: 0.8 }}
                      animate={{ scale: 1.6, opacity: 0 }}
                      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], repeat: 1 }}
                    />
                  ) : null}
                  <span className={cn("flex size-7 items-center justify-center rounded-full border-2 bg-ink-950", RING[tone])}>
                    <span className={cn("size-2.5 rounded-full", FILL[tone])} />
                  </span>
                </>
              ) : (
                <span className="size-7 rounded-full border border-line-strong bg-ink-950" />
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cn("font-medium", !numbered && !isDone && !isCurrent ? "text-faint" : "text-bone")}>
                {step.title}
                {isCurrent ? <span className="sr-only"> (current step)</span> : null}
              </p>
              {step.detail ? <p className="mt-0.5 text-[15px] text-mute">{step.detail}</p> : null}
              {step.href ? (
                <a
                  href={step.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-mute underline-offset-4 hover:text-bone hover:underline"
                >
                  View on NearBlocks
                  <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import type { DealState } from "./status";
import { cn } from "@/lib/utils";

const KEYHOLE: Record<DealState, string> = {
  created: "var(--color-faint)",
  funded: "var(--color-lock)",
  released: "var(--color-release)",
  refunded: "var(--color-refund)",
  disputed: "var(--color-danger)",
};

/**
 * The Podlock padlock (the logo's own paths). Keyhole colour and shackle show the deal state.
 * Created: outline only. Funded: bone body, amber keyhole. Released: shackle lifts 6px, green keyhole.
 */
export default function LockMark({
  state,
  size = 64,
  className,
  label,
}: {
  state: DealState;
  size?: number;
  className?: string;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const outline = state === "created";
  const ease = [0.22, 1, 0.36, 1] as const;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `Deal ${state}`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <motion.path
        d="M20 29 V21 A12 12 0 0 1 43.2 16.6 L47 24.5 L58 9"
        fill="none"
        stroke={outline ? "var(--color-faint)" : "var(--color-bone)"}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ y: state === "released" ? -6 : 0 }}
        transition={{ duration: reduce ? 0 : 0.6, ease }}
      />
      <rect
        x="11"
        y="28"
        width="42"
        height="30"
        rx="8"
        fill={outline ? "transparent" : "var(--color-bone)"}
        stroke={outline ? "var(--color-faint)" : "none"}
        strokeWidth={outline ? 3 : 0}
      />
      <motion.circle
        cx="32"
        cy="43"
        r="4.6"
        initial={false}
        animate={{ fill: KEYHOLE[state] }}
        transition={{ duration: reduce ? 0 : 0.6, ease }}
      />
    </svg>
  );
}

"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import LockMark from "./LockMark";
import ChainValue from "./ChainValue";
import { explorerTxUrl, formatUsdc } from "@/lib/format";

/**
 * The seller is paid. Shackle lifts and the keyhole turns green, a 0.5 s hold, then the
 * text and tx fade in. The final frame holds: no fade-out, no confetti.
 */
export default function ReleaseMoment({
  amount,
  txHash,
  title = "Released.",
  refund = false,
}: {
  amount: number;
  txHash?: string | null;
  title?: string;
  refund?: boolean;
}) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<"funded" | "released" | "refunded">(reduce ? (refund ? "refunded" : "released") : "funded");

  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => setState(refund ? "refunded" : "released"), 60);
    return () => window.clearTimeout(t);
  }, [reduce, refund]);

  return (
    <div className="flex items-start gap-5" aria-live="polite">
      <LockMark state={state} size={72} />
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 1.1, duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        className="min-w-0"
      >
        <p className="text-[28px] leading-tight font-medium">{title}</p>
        <p className="mt-1 text-mute">
          {refund ? "Buyer refunded " : "Seller paid "}
          <span className="font-mono tabular text-bone">{formatUsdc(amount)} USDC</span>.
        </p>
        {txHash ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-faint">
            <span>Transaction</span>
            <ChainValue value={txHash} href={explorerTxUrl(txHash)} label="transaction" />
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import LockMark from "@/components/LockMark";

const ENTER = [0.22, 1, 0.36, 1] as const;
const UI = [0.2, 0.8, 0.2, 1] as const;

/**
 * "Who it's for" (#15). The landing's one scroll reveal and one parallax (design rule 18 exception):
 * the frame opens once at 30% in view, and only the image drifts, within ±24px.
 */
export default function WhoItsFor() {
  const reduce = useReducedMotion();
  const frame = useRef<HTMLDivElement>(null);
  const seen = useInView(frame, { amount: 0.3, once: true });
  const { scrollYProgress } = useScroll({ target: frame, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-24, 24]);
  const open = reduce || seen;

  return (
    <section className="mx-auto mt-24 max-w-[1200px] px-5 md:mt-32 md:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
        <motion.div
          ref={frame}
          className="relative aspect-[3/2] overflow-hidden rounded-[12px] border border-line lg:col-span-6"
          initial={false}
          animate={{ clipPath: open ? "inset(0% 0% 0% 0% round 12px)" : "inset(12% 0% 12% 0% round 12px)" }}
          transition={{ duration: reduce ? 0 : 0.8, ease: ENTER }}
        >
          <motion.div className="absolute inset-0" style={reduce ? { scale: 1.08 } : { y, scale: 1.08 }}>
            <Image
              src="/photos/4a-florist-shop.webp"
              alt="A florist arranging flowers while a customer waits at the counter"
              fill
              sizes="(min-width: 1024px) 580px, 100vw"
              className="object-cover"
            />
          </motion.div>

          {/* A generic chat message: no app logos or app colours. */}
          <motion.div
            className="absolute top-3 right-3 w-[230px] rounded-[12px] rounded-tr-[4px] border border-line bg-ink-800 p-3 text-[14px] sm:top-4 sm:right-4 sm:w-[250px]"
            initial={false}
            animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: UI, delay: reduce ? 0 : 0.8 }}
          >
            <p className="text-bone">Pay on delivery? Here&rsquo;s the link</p>
            <p className="mt-2 flex items-center gap-2 rounded-[6px] border border-line bg-ink-900 px-2 py-1.5 text-mute">
              <LockMark state="funded" size={16} label="TrustLock link" />
              <span className="truncate font-mono text-[13px]" translate="no">
                trustlock…/pay/12
              </span>
            </p>
          </motion.div>
        </motion.div>

        <div className="lg:col-span-5 lg:col-start-8">
          <h2 className="text-[28px] leading-tight">Who it&rsquo;s for</h2>
          <p className="mt-4 text-mute">
            Sellers on Instagram, WhatsApp, TikTok, X and Telegram whose buyers already pay by bank transfer in Lagos, M-Pesa in Nairobi or MoMo in
            Accra, and who lose sales when the buyer won&rsquo;t pay first.
          </p>
          <p className="mt-4 text-mute">
            TrustLock doesn&rsquo;t connect to banks or mobile-money networks. It replaces &ldquo;pay first and hope&rdquo; with escrow: the buyer locks
            USDC, and it moves only when the order arrives or the deadline passes.
          </p>
        </div>
      </div>
    </section>
  );
}

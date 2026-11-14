"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Link2 } from "lucide-react";
import { contractId } from "@/lib/config";
import { explorerAccountUrl } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import ChainValue from "@/components/ChainValue";
import HeroDealDemo from "./HeroDealDemo";

const ENTER = [0.22, 1, 0.36, 1] as const;

/** Hero: split 7/5. The example deal card sits on photo 1A and plays a whole deal. */
export default function Hero() {
  const reduce = useReducedMotion();
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, ease: ENTER, delay: 0.06 * i },
        };

  return (
    <section className="mx-auto grid max-w-[1200px] gap-10 px-5 pt-12 md:px-8 md:pt-20 lg:grid-cols-12 lg:items-center lg:gap-x-8">
      <div className="lg:col-span-6">
        <motion.h1 {...rise(0)} className="text-[40px] leading-none font-medium tracking-[-0.035em] md:text-[64px]">
          Pay on delivery for African sellers across social media and any chat app.
        </motion.h1>
        <motion.p {...rise(1)} className="mt-6 max-w-[560px] text-[18px] text-mute">
          The buyer locks USDC. The rider scans a one-time code at the door. The seller is paid on the spot.
        </motion.p>
        <motion.div {...rise(2)} className="mt-8 flex flex-wrap gap-3">
          <Link href="/seller/onboard" className={buttonVariants({ size: "lg" })}>
            <Link2 aria-hidden="true" strokeWidth={1.5} />
            Create a payment link
          </Link>
          <a href="#how" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            How a deal works
          </a>
        </motion.div>
        <motion.div {...rise(3)} className="mt-6 space-y-1 text-sm text-faint">
          <p>USDC escrow on NEAR. Released only on delivery proof. Testnet. No real money moves.</p>
          <p className="flex flex-wrap items-center gap-2">
            <span>Escrow contract</span>
            <ChainValue value={contractId} href={explorerAccountUrl(contractId)} label="contract id" />
          </p>
        </motion.div>
      </div>

      <div className="relative lg:col-span-5 lg:col-start-8">
        {/* Masked reveal, once on load: the frame opens from a letterbox. Under reduced motion it is simply there. */}
        <motion.div
          className="relative aspect-[4/5] overflow-hidden rounded-[12px] border border-line"
          initial={reduce ? false : { clipPath: "inset(8% 0% 8% 0% round 12px)" }}
          animate={{ clipPath: "inset(0% 0% 0% 0% round 12px)" }}
          transition={{ duration: 0.9, ease: ENTER }}
        >
          <Image
            src="/photos/1a-seller-laptop.webp"
            alt="A woman at a laptop beside a stack of order boxes"
            fill
            priority
            sizes="(min-width: 1024px) 460px, 100vw"
            className="object-cover object-[35%_center]"
          />
        </motion.div>

        {/* The deal card overlaps the frame's left edge on desktop, and the bottom edge on mobile. */}
        <motion.div
          className="relative z-10 mx-4 -mt-12 sm:mx-auto sm:max-w-[360px] lg:absolute lg:bottom-8 lg:-left-12 lg:mx-0 lg:mt-0 lg:w-[340px]"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: ENTER, delay: 0.4 }}
        >
          <HeroDealDemo />
        </motion.div>
      </div>
    </section>
  );
}

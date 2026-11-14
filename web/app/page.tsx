"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { Link2 } from "lucide-react";
import { contractId } from "@/lib/config";
import { explorerAccountUrl } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import AmountDisplay from "@/components/AmountDisplay";
import LockMark from "@/components/LockMark";
import ChainValue from "@/components/ChainValue";
import DealTimeline from "@/components/DealTimeline";

const ENTER = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  {
    title: "The seller creates the link",
    detail: "The seller types the item, price and the buyer’s and rider’s accounts, then shares the link in any chat.",
    photo: { src: "/photos/5a-packing-orders.webp", w: 1600, h: 1066, alt: "A man with a clipboard in a stockroom of cartons" },
  },
  {
    title: "The buyer locks USDC",
    detail: "The buyer opens the link and locks the price in escrow on NEAR. Nobody can spend it yet.",
    photo: { src: "/photos/3a-buyer-phone.webp", w: 1600, h: 1067, alt: "A woman in a blazer looking at her phone" },
  },
  {
    title: "The rider scans the code at the door",
    detail: "The buyer shows a one-time QR. The rider scans it with their phone camera.",
    photo: { src: "/photos/6a-phone-hands.webp", w: 1600, h: 2397, alt: "Hands holding a phone outdoors" },
  },
  {
    title: "Funds release to the seller",
    detail: "The scan is the proof. The contract pays the seller on the spot, with a transaction anyone can check.",
    photo: { src: "/photos/2a-delivery-handover.webp", w: 1600, h: 901, alt: "A woman receiving parcels from a courier outside a house" },
  },
];

export default function HomePage() {
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
    <main>
      {/* 1. Hero: split 7/5, text on ink, photo in its own frame. No eyebrow, no overlay. */}
      <section className="mx-auto grid max-w-[1200px] gap-10 px-5 pt-12 md:px-8 md:pt-20 lg:grid-cols-12 lg:gap-x-8 lg:gap-y-10">
        <div className="lg:col-span-7 lg:row-start-1">
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
          <motion.p {...rise(3)} className="mt-4 text-sm text-faint">
            USDC escrow on NEAR. Released only on delivery proof. Testnet. No real money moves.
          </motion.p>
        </div>

        <motion.div
          className="lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1"
          initial={reduce ? false : { opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: ENTER }}
        >
          <div className="relative aspect-[4/5] overflow-hidden rounded-[12px] border border-line lg:sticky lg:top-24">
            <Image
              src="/photos/1a-seller-laptop.webp"
              alt="A woman at a laptop beside a stack of order boxes"
              fill
              priority
              sizes="(min-width: 1024px) 460px, 100vw"
              className="object-cover object-[35%_center]"
            />
          </div>
        </motion.div>

        {/* The product object: a deal card with LockMark. Clearly labelled as an example. */}
        <motion.div {...rise(4)} className="max-w-[440px] lg:col-span-7 lg:row-start-2">
          <p className="text-sm text-faint">Example deal</p>
          <Card className="mt-2 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[20px] font-medium">Ankara two-piece, size M</p>
                <StatusBadge status="Funded" className="mt-2" />
              </div>
              <LockMark state="funded" size={48} label="Locked" />
            </div>
            <AmountDisplay className="mt-5" amount={12} size="md" />
            <p className="mt-3 text-[15px] text-mute">Locked until the rider scans the buyer&rsquo;s code.</p>
          </Card>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-faint">
            <span>Escrow contract</span>
            <ChainValue value={contractId} href={explorerAccountUrl(contractId)} label="contract id" />
          </p>
        </motion.div>
      </section>

      {/* 2. How a deal works: the real timeline, one photo per step. */}
      <section id="how" className="mx-auto mt-24 max-w-[1200px] scroll-mt-24 px-5 md:mt-32 md:px-8">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <h2 className="text-[28px] leading-tight">How a deal works</h2>
              <p className="mt-3 max-w-[440px] text-mute">Four steps, and each one names who acts. The money only moves at step 4.</p>
              <DealTimeline className="mt-8" numbered steps={STEPS.map(({ title, detail }) => ({ title, detail }))} />
            </div>
          </div>
          <ol className="space-y-12 lg:col-span-7">
            {STEPS.map((s, i) =>
              i === 2 ? (
                <li key={s.title} className="grid grid-cols-2 gap-4">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-[12px] border border-line">
                    <Image src={s.photo.src} alt={s.photo.alt} fill sizes="(min-width: 1024px) 340px, 50vw" className="object-cover" />
                  </div>
                  {/* The scan screen sits beside the photo (the phone in the photo is tilted). */}
                  <div className="flex flex-col justify-between rounded-[12px] border border-line bg-ink-900 p-4">
                    <div className="relative mx-auto aspect-square w-full max-w-[200px] rounded-[12px] bg-ink-800">
                      {(["top-3 left-3 border-t-[3px] border-l-[3px] rounded-tl-[10px]", "top-3 right-3 border-t-[3px] border-r-[3px] rounded-tr-[10px]", "bottom-3 left-3 border-b-[3px] border-l-[3px] rounded-bl-[10px]", "bottom-3 right-3 border-b-[3px] border-r-[3px] rounded-br-[10px]"] as const).map((c) => (
                        <span key={c} aria-hidden="true" className={`absolute size-8 border-release ${c}`} />
                      ))}
                      <svg viewBox="0 0 24 24" className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 text-release" aria-hidden="true">
                        <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="mt-4">
                      <StatusBadge status="Delivered" />
                      <p className="mt-2 text-[15px] text-mute">
                        Code accepted. Seller paid <span className="font-mono tabular text-bone">12.00 USDC</span>.
                      </p>
                    </div>
                  </div>
                  <p className="col-span-2 text-mute">
                    <span className="mr-2 font-mono text-bone">{i + 1}</span>
                    {s.detail}
                  </p>
                </li>
              ) : (
                <li key={s.title}>
                  <div className="relative aspect-[3/2] overflow-hidden rounded-[12px] border border-line">
                    <Image src={s.photo.src} alt={s.photo.alt} fill sizes="(min-width: 1024px) 680px, 100vw" className="object-cover" />
                  </div>
                  <p className="mt-4 text-mute">
                    <span className="mr-2 font-mono text-bone">{i + 1}</span>
                    {s.detail}
                  </p>
                </li>
              )
            )}
          </ol>
        </div>
      </section>

      {/* 3. Who it's for (#15): a reversed split, prose beside 4A. Mobile money is context, not a rail. */}
      <section className="mx-auto mt-24 max-w-[1200px] px-5 md:mt-32 md:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="relative aspect-[3/2] overflow-hidden rounded-[12px] border border-line lg:col-span-6">
            <Image
              src="/photos/4a-florist-shop.webp"
              alt="A florist arranging flowers while a customer waits at the counter"
              fill
              sizes="(min-width: 1024px) 580px, 100vw"
              className="object-cover"
            />
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            <h2 className="text-[28px] leading-tight">Who it&rsquo;s for</h2>
            <p className="mt-4 text-mute">
              Sellers on Instagram, WhatsApp, TikTok, X and Telegram whose buyers already pay by bank transfer in Lagos, M-Pesa in Nairobi or MoMo in
              Accra, and who lose sales when the buyer won&rsquo;t pay first.
            </p>
            <p className="mt-4 text-mute">
              TrustLock doesn&rsquo;t connect to banks or mobile-money networks. It replaces &ldquo;pay first and hope&rdquo; with escrow: the buyer
              locks USDC, and it moves only when the order arrives or the deadline passes.
            </p>
          </div>
        </div>
      </section>

      {/* 4. What moves the money: one plain paragraph. */}
      <section className="mx-auto mt-24 max-w-[1200px] px-5 md:mt-32 md:px-8">
        <div className="max-w-[720px] border-t border-line pt-10">
          <h2 className="text-[28px] leading-tight">What moves the money</h2>
          <p className="mt-4 text-[18px] text-mute">
            The AI agent drafts and checks deals. Only the buyer&rsquo;s confirmation, the rider&rsquo;s scan or the deadline can move funds.
          </p>
          <Link href="/dashboard" className="mt-6 inline-flex h-11 items-center text-bone underline underline-offset-4 hover:text-mute">
            See every deal on the contract
          </Link>
        </div>
      </section>
    </main>
  );
}

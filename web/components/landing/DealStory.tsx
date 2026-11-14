"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import StatusBadge from "@/components/StatusBadge";
import LockMark from "@/components/LockMark";
import { cn } from "@/lib/utils";

const ENTER = [0.22, 1, 0.36, 1] as const;
const UI = [0.2, 0.8, 0.2, 1] as const;

const STEPS = [
  {
    title: "The seller creates the link",
    detail: "The seller types the item, price and the buyer’s and rider’s accounts, then shares the link in any chat.",
    photo: { src: "/photos/5a-packing-orders.webp", alt: "A man with a clipboard in a stockroom of cartons", pos: "object-center" },
    dot: { ring: "border-bone", fill: "bg-bone" },
  },
  {
    title: "The buyer locks USDC",
    detail: "The buyer opens the link and locks the price in escrow on NEAR. Nobody can spend it yet.",
    photo: { src: "/photos/3a-buyer-phone.webp", alt: "A woman in a blazer looking at her phone", pos: "object-[40%_center]" },
    dot: { ring: "border-lock", fill: "bg-lock" },
  },
  {
    title: "The rider scans the code at the door",
    detail: "The buyer shows a one-time QR. The rider scans it with their phone camera.",
    photo: { src: "/photos/6a-phone-hands.webp", alt: "Hands holding a phone outdoors", pos: "object-center" },
    dot: { ring: "border-release", fill: "bg-release" },
  },
  {
    title: "Funds release to the seller",
    detail: "The scan is the proof. The contract pays the seller on the spot, with a transaction anyone can check.",
    photo: { src: "/photos/2a-delivery-handover.webp", alt: "A woman receiving parcels from a courier outside a house", pos: "object-[42%_center]" },
    dot: { ring: "border-release", fill: "bg-release" },
  },
] as const;

/** Small solid product card anchored to the photo's subject. Always labelled as an example. */
function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("absolute max-w-[78%] rounded-[12px] border border-line bg-ink-900 p-3 text-[14px] text-mute", className)}>
      <p className="mb-1.5 text-[12px] text-faint">Example</p>
      {children}
    </div>
  );
}

/** Scanner brackets drawn over the phone screen in photo 6A (image coordinates, object-center + slice). */
const SCREEN = [
  [1325, 925],
  [1500, 1030],
  [1010, 1330],
  [720, 1300],
] as const;

function bracketPath() {
  const k = 0.2;
  return SCREEN.map((p, i) => {
    const prev = SCREEN[(i + 3) % 4];
    const next = SCREEN[(i + 1) % 4];
    const a = [p[0] + (prev[0] - p[0]) * k, p[1] + (prev[1] - p[1]) * k];
    const b = [p[0] + (next[0] - p[0]) * k, p[1] + (next[1] - p[1]) * k];
    return `M${a[0]} ${a[1]} L${p[0]} ${p[1]} L${b[0]} ${b[1]}`;
  }).join(" ");
}

function ScanMarks({ reduce }: { reduce: boolean }) {
  return (
    <svg viewBox="0 0 1600 2397" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <motion.path
        d={bracketPath()}
        fill="none"
        stroke="var(--color-release)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: UI, delay: reduce ? 0 : 0.15 }}
      />
      <circle cx="1290" cy="1040" r="62" fill="var(--color-ink-900)" />
      <motion.path
        d="M1258 1042 l22 22 l42 -48"
        fill="none"
        stroke="var(--color-release)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.25, ease: UI, delay: reduce ? 0 : 0.55 }}
      />
    </svg>
  );
}

function Overlay({ i, reduce }: { i: number; reduce: boolean }) {
  switch (i) {
    case 0:
      return (
        <Chip className="top-4 left-4 w-[240px]">
          <StatusBadge status="Created" />
          <p className="mt-2 text-bone">Ankara two-piece, size M</p>
          <p>
            <span className="font-mono tabular text-bone">12.00 USDC</span> · link ready
          </p>
        </Chip>
      );
    case 1:
      return (
        <Chip className="top-[30%] left-4 w-[220px] lg:top-[42%]">
          <div className="flex items-center gap-2">
            <LockMark state="funded" size={20} label="Locked" />
            <span className="font-medium text-lock">Locked on NEAR</span>
          </div>
          <p className="mt-1.5 font-mono tabular text-bone">12.00 USDC</p>
        </Chip>
      );
    case 2:
      return (
        <>
          <ScanMarks reduce={reduce} />
          <Chip className="bottom-4 left-4 w-[220px]">
            <StatusBadge status="Delivered" />
            <p className="mt-2">Code accepted at the door.</p>
          </Chip>
        </>
      );
    default:
      return (
        <Chip className="right-4 bottom-4 w-[240px]">
          <StatusBadge status="Released" />
          <p className="mt-2">
            Seller paid <span className="font-mono tabular text-bone">12.00 USDC</span>
          </p>
          <p className="mt-0.5 text-[13px] text-faint">
            tx <span className="font-mono text-mute" translate="no">9fK2…mE4a</span>
          </p>
        </Chip>
      );
  }
}

function OverlayIn({ i, reduce }: { i: number; reduce: boolean }) {
  return (
    <motion.div
      key={i}
      className="absolute inset-0"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.25, ease: UI, delay: reduce ? 0 : 0.15 } }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15, ease: UI } }}
    >
      <Overlay i={i} reduce={reduce} />
    </motion.div>
  );
}

/** Desktop step block: becomes active when it crosses the middle of the viewport. */
function StepBlock({ i, active, onActive }: { i: number; active: number; onActive: (i: number) => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const inMiddle = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (inMiddle) onActive(i);
  }, [inMiddle, i, onActive]);
  const s = STEPS[i];
  const done = i < active;
  const current = i === active;
  return (
    <li ref={ref} className="relative flex min-h-[60vh] gap-5">
      {i < STEPS.length - 1 ? <span aria-hidden="true" className="absolute top-9 bottom-0 left-[13px] w-px bg-line" /> : null}
      <span
        aria-hidden="true"
        className={cn(
          "relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-sm transition-colors duration-200 motion-reduce:transition-none",
          current ? cn("border-2 bg-ink-950 text-bone", s.dot.ring) : done ? cn("border-transparent text-ink-950", s.dot.fill) : "border-line-strong bg-ink-950 text-faint"
        )}
      >
        {i + 1}
      </span>
      <div className="pt-0.5">
        <h3 className={cn("text-[20px] leading-tight transition-colors duration-200 motion-reduce:transition-none", current ? "text-bone" : "text-mute")}>
          {s.title}
          {current ? <span className="sr-only"> (shown in the picture)</span> : null}
        </h3>
        <p className="mt-2 max-w-[400px] text-mute">{s.detail}</p>
      </div>
    </li>
  );
}

/** Mobile: no sticky. Each photo keeps its own overlay, which enters once when the photo is in view. */
function MobileStep({ i, reduce }: { i: number; reduce: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const seen = useInView(ref, { amount: 0.5, once: true });
  const s = STEPS[i];
  return (
    <li ref={ref}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[12px] border border-line">
        <Image src={s.photo.src} alt={s.photo.alt} fill sizes="100vw" className={cn("object-cover", s.photo.pos)} />
        <AnimatePresence>{seen || reduce ? <OverlayIn i={i} reduce={reduce} /> : null}</AnimatePresence>
      </div>
      <h3 className="mt-4 text-[20px] leading-tight">
        <span className="mr-2 font-mono text-bone">{i + 1}</span>
        {s.title}
      </h3>
      <p className="mt-2 text-mute">{s.detail}</p>
    </li>
  );
}

/** "How a deal works": a sticky story on desktop. Scroll only decides which step is active; nothing loops. */
export default function DealStory() {
  const reduce = !!useReducedMotion();
  const [active, setActive] = useState(0);

  return (
    <section id="how" className="mx-auto mt-24 max-w-[1200px] scroll-mt-24 px-5 md:mt-32 md:px-8">
      <h2 className="text-[28px] leading-tight">How a deal works</h2>
      <p className="mt-3 max-w-[440px] text-mute">Four steps, and each one names who acts. The money only moves at step 4.</p>

      {/* Desktop: steps on the left, one sticky frame on the right. */}
      <div className="mt-12 hidden lg:grid lg:grid-cols-12 lg:gap-8">
        <ol className="lg:col-span-5">
          {STEPS.map((s, i) => (
            <StepBlock key={s.title} i={i} active={active} onActive={setActive} />
          ))}
        </ol>
        <div className="lg:col-span-7">
          <div className="sticky top-24 aspect-[4/5] max-h-[calc(100vh-8rem)] w-full overflow-hidden rounded-[12px] border border-line">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.photo.src}
                className="absolute inset-0"
                aria-hidden={i !== active}
                initial={false}
                animate={{ opacity: i === active ? 1 : 0, scale: i === active ? 1 : 1.03 }}
                transition={{
                  opacity: { duration: reduce ? 0 : 0.4, ease: UI },
                  scale: { duration: reduce ? 0 : 0.7, ease: ENTER },
                }}
              >
                <Image
                  src={s.photo.src}
                  alt={i === active ? s.photo.alt : ""}
                  fill
                  loading="eager"
                  sizes="(min-width: 1024px) 680px, 100vw"
                  className={cn("object-cover", s.photo.pos)}
                />
              </motion.div>
            ))}
            <AnimatePresence initial={false}>
              <OverlayIn key={active} i={active} reduce={reduce} />
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Mobile and tablet: a plain stack. */}
      <ol className="mt-10 space-y-12 lg:hidden">
        {STEPS.map((s, i) => (
          <MobileStep key={s.title} i={i} reduce={reduce} />
        ))}
      </ol>
    </section>
  );
}

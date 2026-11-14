"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import AmountDisplay from "@/components/AmountDisplay";
import LockMark from "@/components/LockMark";
import type { DealState } from "@/components/status";
import { cn } from "@/lib/utils";

const UI = [0.2, 0.8, 0.2, 1] as const;

/** The real deal sequence, with how long each state holds (ms). */
const STEPS: { status: string; lock: DealState; line: string; hold: number; dot: string }[] = [
  { status: "Created", lock: "created", line: "Waiting for the buyer", hold: 1600, dot: "bg-bone" },
  { status: "Funded", lock: "funded", line: "Locked until the rider scans", hold: 2400, dot: "bg-lock" },
  { status: "Delivered", lock: "funded", line: "Code scanned at the door", hold: 1600, dot: "bg-release" },
  { status: "Released", lock: "released", line: "Seller paid", hold: 4000, dot: "bg-release" },
];
const DOT_LABEL = ["Created", "Locked", "Delivered", "Released"];
const CYCLES = 2;
const START_DELAY = 1200;

/**
 * The hero's example deal. Plays Created → Locked → Delivered → Released twice, then rests on Released.
 * Pauses when out of view, when the tab is hidden, on hover or focus, and with its own pause button (WCAG 2.2.2).
 * Reduced motion: no cycle, the finished state only.
 */
export default function HeroDealDemo({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const [step, setStep] = useState(3);
  const [cycle, setCycle] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [fading, setFading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  // Start from Created after the hero entrance (about 1.2 s after load).
  useEffect(() => {
    if (reduce) return;
    setStep(0);
    const t = window.setTimeout(() => setStarted(true), START_DELAY);
    return () => window.clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const running = !reduce && started && !finished && inView && tabVisible && !hovered && !userPaused;

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => {
      if (step < 3) {
        setStep(step + 1);
        return;
      }
      if (cycle + 1 >= CYCLES) {
        setFinished(true);
        return;
      }
      // Reset: the whole card crossfades back to Created. Nothing slides.
      setFading(true);
      window.setTimeout(() => {
        setStep(0);
        setCycle(cycle + 1);
        setFading(false);
      }, 300);
    }, STEPS[step].hold);
    return () => window.clearTimeout(t);
  }, [running, step, cycle]);

  function togglePlay() {
    if (finished) {
      setFinished(false);
      setCycle(0);
      setStep(0);
      setUserPaused(false);
      return;
    }
    setUserPaused((p) => !p);
  }

  const s = STEPS[step];
  const playing = !finished && !userPaused;

  return (
    <div
      ref={ref}
      className={cn("rounded-[12px] border border-line bg-ink-900 p-5", className)}
      aria-label="Example deal going from created to released"
      role="group"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
      }}
    >
      <motion.div animate={{ opacity: fading ? 0 : 1 }} transition={{ duration: reduce ? 0 : 0.3, ease: UI }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-faint">Example deal</p>
          {!reduce ? (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause example" : "Play example"}
              className="-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-[6px] text-faint transition-colors duration-150 hover:bg-ink-800 hover:text-bone"
            >
              {playing ? <Pause aria-hidden="true" strokeWidth={1.5} className="size-4" /> : <Play aria-hidden="true" strokeWidth={1.5} className="size-4" />}
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[20px] leading-tight font-medium">Ankara two-piece, size M</p>
            <div className="mt-2 h-7">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={s.status}
                  className="inline-block"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: UI }}
                >
                  <StatusBadge status={s.status} />
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
          <LockMark state={s.lock} size={48} label={s.lock === "created" ? "Not locked yet" : s.lock === "released" ? "Released" : "Locked"} />
        </div>

        <AmountDisplay className="mt-5" amount={12} size="md" />

        {/* Mini timeline: four dots, filled up to the current step. */}
        <ol className="mt-4 grid grid-cols-4 gap-2" aria-label="Deal steps">
          {DOT_LABEL.map((label, i) => (
            <li key={label} className="min-w-0">
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1 rounded-full transition-colors duration-200 motion-reduce:transition-none",
                  i <= step ? STEPS[i].dot : "bg-line"
                )}
              />
              <span className={cn("mt-1.5 block truncate text-[12px]", i <= step ? "text-mute" : "text-faint")}>
                {label}
                {i === step ? <span className="sr-only"> (current)</span> : null}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-3 min-h-[48px] text-[15px] text-mute">
          {reduce ? (
            <p>Locked, scanned at the door, seller paid.</p>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={s.line}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: UI }}
              >
                {s.line}
              </motion.p>
            </AnimatePresence>
          )}
          {s.status === "Released" ? (
            <motion.p
              key={`tx-${cycle}`}
              className="mt-1 text-sm text-faint"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 1.1, duration: reduce ? 0 : 0.2, ease: UI }}
            >
              tx <span className="font-mono text-mute" translate="no">9fK2…mE4a</span> (example)
            </motion.p>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

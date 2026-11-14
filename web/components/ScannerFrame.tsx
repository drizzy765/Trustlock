"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Camera, CameraOff, ImageUp } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

type Phase = "idle" | "starting" | "scanning" | "denied" | "unavailable";

/**
 * Camera viewfinder for the buyer's delivery-code QR. On decode it hands the raw text to the page,
 * which fills the existing code field and submits through the existing handler.
 * The amber sweep is the only loop in the app, and runs only while the camera is on.
 */
export default function ScannerFrame({
  onDecode,
  success = false,
  failed = false,
  disabled = false,
}: {
  onDecode: (text: string) => void;
  success?: boolean;
  failed?: boolean;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<{ stop: () => void; destroy: () => void } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  function stop() {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setPhase((p) => (p === "scanning" || p === "starting" ? "idle" : p));
  }

  useEffect(() => () => stop(), []);

  useEffect(() => {
    if (success) stop();
  }, [success]);

  async function start() {
    if (!videoRef.current) return;
    setNote(null);
    setPhase("starting");
    try {
      const { default: QrScanner } = await import("qr-scanner");
      if (!(await QrScanner.hasCamera())) {
        setPhase("unavailable");
        setNote("No camera found. Paste the code or upload a photo of it instead.");
        return;
      }
      const scanner = new QrScanner(
        videoRef.current,
        (result) => {
          const text = result.data.trim();
          if (!text) return;
          try {
            navigator.vibrate?.(30);
          } catch {
            /* vibration not supported */
          }
          scanner.stop();
          setPhase("idle");
          onDecodeRef.current(text);
        },
        { preferredCamera: "environment", highlightScanRegion: false, highlightCodeOutline: false, returnDetailedScanResult: true }
      );
      scannerRef.current = scanner;
      await scanner.start();
      setPhase("scanning");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const denied = /denied|permission|notallowed/i.test(msg);
      setPhase(denied ? "denied" : "unavailable");
      setNote(denied ? "Camera access was blocked. Allow it in your browser, or paste the code instead." : "The camera didn’t start. Paste the code or upload a photo of it instead.");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setNote(null);
    try {
      const { default: QrScanner } = await import("qr-scanner");
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      onDecodeRef.current(result.data.trim());
    } catch {
      setNote("No QR code found in that photo. Try again closer, or paste the code.");
    }
  }

  const live = phase === "scanning";
  const tone = success ? "border-release" : failed ? "border-danger" : "border-bone";
  const inset = success ? 18 : 12;

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-[16px] border border-line bg-ink-900">
        <video ref={videoRef} muted playsInline className={cn("absolute inset-0 size-full object-cover", !live && "invisible")} />
        {!live && !success ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center text-mute">
            {phase === "denied" || phase === "unavailable" ? (
              <CameraOff aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
            ) : (
              <Camera aria-hidden="true" strokeWidth={1.5} className="size-8 text-faint" />
            )}
            <p className="text-[15px]">Point the camera at the buyer&rsquo;s delivery code.</p>
          </div>
        ) : null}
        {/* Four corner brackets. They close in 6px and turn green on success. */}
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <motion.span
            key={c}
            aria-hidden="true"
            className={cn(
              "absolute size-10 transition-colors duration-200",
              tone,
              c === "tl" && "border-t-[3px] border-l-[3px] rounded-tl-[12px]",
              c === "tr" && "border-t-[3px] border-r-[3px] rounded-tr-[12px]",
              c === "bl" && "border-b-[3px] border-l-[3px] rounded-bl-[12px]",
              c === "br" && "border-b-[3px] border-r-[3px] rounded-br-[12px]"
            )}
            initial={false}
            animate={{
              top: c.startsWith("t") ? inset : "auto",
              bottom: c.startsWith("b") ? inset : "auto",
              left: c.endsWith("l") ? inset : "auto",
              right: c.endsWith("r") ? inset : "auto",
            }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ))}
        {live ? (
          <span
            aria-hidden="true"
            className="tl-sweep absolute top-[12%] right-[10%] left-[10%] h-0.5 bg-lock"
            style={{ ["--sweep-distance" as string]: "260px" }}
          />
        ) : null}
        {success ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-release/12">
              <svg viewBox="0 0 24 24" className="size-12 text-release" aria-label="Code accepted" role="img">
                <motion.path
                  d="M5 12.5l4.2 4.2L19 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: reduce ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: reduce ? 0 : 0.18, duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
            </span>
          </div>
        ) : null}
      </div>

      <div className="mx-auto mt-4 flex max-w-[340px] flex-wrap gap-2">
        {live ? (
          <Button variant="secondary" onClick={stop} className="flex-1">
            <CameraOff aria-hidden="true" strokeWidth={1.5} />
            Stop camera
          </Button>
        ) : (
          <Button variant="secondary" onClick={start} loading={phase === "starting"} disabled={disabled || success} className="flex-1">
            {phase !== "starting" ? <Camera aria-hidden="true" strokeWidth={1.5} /> : null}
            {phase === "starting" ? "Starting camera…" : "Scan with camera"}
          </Button>
        )}
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={disabled || success}>
          <ImageUp aria-hidden="true" strokeWidth={1.5} />
          Upload photo
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload a photo of the delivery code"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {note ? (
        <p role="status" className="mx-auto mt-3 max-w-[340px] text-sm text-mute">
          {note}
        </p>
      ) : null}
      {success ? (
        <p className="sr-only" aria-live="polite">
          Code accepted
        </p>
      ) : null}
    </div>
  );
}

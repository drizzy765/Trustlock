"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import QRCode from "qrcode";
import ChainValue from "./ChainValue";

/**
 * The delivery code as a scannable QR. The payload is the exact hex secret text, because the
 * contract hashes the hex text (sha256 of the string). Nothing is re-encoded.
 * Bone background and ink modules scan best; error correction H leaves room for the mark.
 */
export default function QrCard({ secret }: { secret: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(secret, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: { dark: "#0B0C0B", light: "#F4F2EE" },
    })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [secret]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      className="rounded-[16px] border border-line bg-ink-900 p-5"
    >
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="relative size-[240px] shrink-0 overflow-hidden rounded-[16px] bg-bone">
          {svg ? (
            <div
              role="img"
              aria-label="Delivery code QR"
              className="size-full [&>svg]:size-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="size-full" aria-hidden="true" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/trustlock-mark.svg"
            alt=""
            width={44}
            height={44}
            className="absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-[8px] bg-bone p-1"
          />
        </div>
        <div className="min-w-0">
          <p className="text-[20px] font-medium">Show this to the rider. Only once.</p>
          <p className="mt-1 text-[15px] text-mute">
            The rider scans it at the door and the seller is paid. Anyone holding this code can complete the delivery, so keep it private until then.
          </p>
          <p className="mt-4 text-sm text-faint">Can&rsquo;t scan? Copy the code:</p>
          <ChainValue value={secret} label="delivery code" />
        </div>
      </div>
    </motion.div>
  );
}

"use client";

import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";

/** Motion follows the OS reduced-motion setting everywhere. Toasts are neutral ink. */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          classNames: {
            toast: "!bg-ink-900 !border !border-line !text-bone !rounded-[12px] !font-sans",
            description: "!text-mute",
            actionButton: "!bg-bone !text-ink-950",
          },
        }}
      />
    </MotionConfig>
  );
}

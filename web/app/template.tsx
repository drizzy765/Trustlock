"use client";

import { motion } from "motion/react";

/** Page change: a 150 ms opacity fade only. No rise, no exit. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

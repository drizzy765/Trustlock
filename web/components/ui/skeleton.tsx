import { cn } from "@/lib/utils";

/** Static ink-800 block. No shimmer. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-[6px] bg-ink-800", className)} />;
}

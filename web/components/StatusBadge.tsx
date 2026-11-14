import { CircleDashed, Lock, PackageCheck, Undo2, CircleAlert } from "lucide-react";
import { dealState, STATUS_WORD, type DealState } from "./status";
import { cn } from "@/lib/utils";

const STYLE: Record<DealState, string> = {
  created: "bg-faint/12 text-mute",
  funded: "bg-lock/12 text-lock",
  released: "bg-release/12 text-release",
  refunded: "bg-refund/12 text-refund",
  disputed: "bg-danger/12 text-danger",
};

const ICON = { created: CircleDashed, funded: Lock, released: PackageCheck, refunded: Undo2, disputed: CircleAlert };

/** Colour never works alone: every status has a word and an icon. Pill radius (one of two pill uses). */
export default function StatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const state = dealState(status);
  const Icon = ICON[state];
  return (
    <span
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap", STYLE[state], className)}
    >
      <Icon aria-hidden="true" strokeWidth={1.5} className="size-4" />
      {STATUS_WORD[status ?? ""] ?? status ?? "Unknown"}
    </span>
  );
}

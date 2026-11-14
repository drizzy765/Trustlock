import { formatUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Large tabular USDC figure with a suffix chip. avoid-ai-design-ignore: SD4m — amounts are chain data. */
export default function AmountDisplay({
  amount,
  size = "lg",
  className,
  local,
}: {
  amount: number;
  size?: "md" | "lg";
  className?: string;
  local?: string | null;
}) {
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("font-mono tabular font-medium tracking-tight text-bone", size === "lg" ? "text-[40px] leading-none md:text-[48px]" : "text-[20px]")}>
        {formatUsdc(amount)}
      </span>
      <span className="rounded-[6px] border border-line-strong px-1.5 py-0.5 text-sm text-mute">USDC</span>
      {local ? <span className="text-[15px] text-mute">≈ {local}</span> : null}
    </span>
  );
}

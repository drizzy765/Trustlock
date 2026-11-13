import type { Mode } from "@/lib/quote";

const COLORS: Record<Mode, string> = {
  demo: "#6b7280",
  dry: "#3b82f6",
  live: "#22c55e",
};

const TITLES: Record<Mode, string> = {
  demo: "Demo mode: no real funds move.",
  dry: "Dry mode: a real 1Click quote with dry: true. No deposit address, no transaction.",
  live: "Live: a real execute happened and produced this transaction hash.",
};

/** A read-only label. There is deliberately no way for a user to select `live`. */
export default function ModeBadge({ mode }: { mode: Mode }) {
  return (
    <span
      title={TITLES[mode]}
      style={{
        background: COLORS[mode],
        color: "#000",
        padding: "4px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: "bold",
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {mode}
    </span>
  );
}

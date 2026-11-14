import * as React from "react";
import { CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** One alert style. Danger uses the danger tint; info stays neutral. */
export function Alert({
  tone = "danger",
  title,
  children,
  className,
}: {
  tone?: "danger" | "info" | "lock";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? Info : CircleAlert;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-[12px] border px-4 py-3 text-[15px]",
        tone === "danger" && "border-danger/40 bg-danger/10 text-bone",
        tone === "lock" && "border-lock/40 bg-lock/10 text-bone",
        tone === "info" && "border-line bg-ink-900 text-mute",
        className
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.5}
        className={cn("mt-0.5 size-5 shrink-0", tone === "danger" ? "text-danger" : tone === "lock" ? "text-lock" : "text-faint")}
      />
      <div className="min-w-0">
        {title ? <p className="font-medium text-bone">{title}</p> : null}
        <div className={cn(title && "mt-1")}>{children}</div>
      </div>
    </div>
  );
}

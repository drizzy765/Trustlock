import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden="true" strokeWidth={1.5} className={cn("size-5 motion-safe:animate-spin", className)} />;
}

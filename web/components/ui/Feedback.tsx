import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { TONE, type Tone } from "./tone";

/** One-line muted message used in place of an empty list or chart. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("px-4 py-3 text-sm text-muted", className)}>{children}</p>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-surface-2", className)} />;
}

/** Horizontal 0–100% bar. */
export function Meter({ value, tone = "neutral", label }: { value: number; tone?: Tone; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
      className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn("h-full rounded-full", TONE[tone].dot)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Small explanatory text. */
export function Footnote({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted">{children}</p>;
}

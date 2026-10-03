import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { TONE, type Tone } from "./tone";

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", TONE[tone].soft, TONE[tone].text, className)}>
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", TONE[tone].dot)} aria-hidden />;
}

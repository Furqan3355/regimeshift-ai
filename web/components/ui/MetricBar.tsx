import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export interface Metric {
  label: string;
  value: ReactNode;
  /** Optional class for the value, e.g. a P&L colour. */
  valueClass?: string;
}

/** A single row of three key numbers (account summaries). */
export function MetricBar({ items }: { items: [Metric, Metric, Metric] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface">
      {items.map((m) => (
        <div key={m.label} className="min-w-0 px-3 py-2.5 sm:px-4">
          <p className="truncate text-xs text-muted">{m.label}</p>
          <p className={cn("mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base", m.valueClass ?? "text-ink")}>{m.value}</p>
        </div>
      ))}
    </div>
  );
}

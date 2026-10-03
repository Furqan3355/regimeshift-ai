"use client";

import { ChevronDown } from "lucide-react";

/** Native select: keyboard type-ahead, and the OS picker on phones. */
export function TickerSelect({ tickers, value, onChange }: { tickers: string[]; value: string; onChange: (t: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Ticker</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 cursor-pointer appearance-none rounded-md border border-line bg-surface pr-8 pl-2.5 text-sm font-semibold text-ink hover:border-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
        >
          {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      </span>
    </label>
  );
}

"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** Small switch between a few views. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer rounded px-3 py-1 text-sm transition-colors",
              on ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

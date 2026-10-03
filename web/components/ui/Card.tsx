import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("min-w-0 rounded-lg border border-line bg-surface", className)}>{children}</section>;
}

export function CardHeader({ title, meta, action }: { title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex min-h-10 items-center justify-between gap-3 border-b border-line px-4 py-2">
      <h2 className="text-sm font-medium text-ink">
        {title}
        {meta && <span className="ml-2 text-xs font-normal text-muted">{meta}</span>}
      </h2>
      {action}
    </header>
  );
}

/** A divided list inside a Card. */
export function CardList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}

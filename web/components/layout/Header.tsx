"use client";

import { cn } from "@/lib/format";

export interface NavItem<T extends string> {
  value: T;
  label: string;
}

export function Header<T extends string>({
  nav,
  active,
  onNavigate,
}: {
  nav: NavItem<T>[];
  active: T;
  onNavigate: (v: T) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-6 place-items-center rounded bg-ink text-[10px] font-bold text-bg" aria-hidden>RS</span>
          <span className="hidden sm:inline">RegimeShift</span>
        </p>
        <nav className="flex h-full gap-1">
          {nav.map((n) => {
            const on = n.value === active;
            return (
              <button
                key={n.value}
                type="button"
                onClick={() => onNavigate(n.value)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "-mb-px cursor-pointer border-b-2 px-2.5 text-sm transition-colors",
                  on ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {n.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

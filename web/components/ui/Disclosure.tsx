import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Native <details> accordion row. Stack several inside one Card. */
export function Disclosure({
  title,
  meta,
  defaultOpen,
  children,
}: {
  title: string;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group border-b border-line last:border-b-0" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium select-none hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {meta != null && <span className="ml-2 text-xs font-normal text-muted">{meta}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pt-1 pb-3">{children}</div>
    </details>
  );
}

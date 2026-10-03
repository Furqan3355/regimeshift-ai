import type { ReactNode } from "react";

/** Compact control row at the top of a page. `end` is pushed to the right on wide screens. */
export function Toolbar({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2 sm:px-4">
      {children}
      {end && <div className="w-full sm:ml-auto sm:w-auto">{end}</div>}
    </div>
  );
}

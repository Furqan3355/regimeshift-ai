import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /**
   * Narrow layout: "title" = bold top-left, "aside" = top-right,
   * "row" (default) = label/value line underneath.
   */
  stacked?: "title" | "aside" | "row";
}

/**
 * A real table when its container is wide enough, stacked rows when it is not.
 * Uses a container query, so it adapts to the column it sits in, not only the viewport.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: ReactNode;
}) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-muted">{empty}</p>;

  const title = columns.find((c) => c.stacked === "title") ?? columns[0];
  const aside = columns.find((c) => c.stacked === "aside");
  const rest = columns.filter((c) => c !== title && c !== aside);

  return (
    <div className="@container">
      <table className="hidden w-full text-sm @lg:table">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-2 font-normal", c.align === "right" ? "text-right" : "text-left")}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-surface-2/50">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-2 tabular-nums", c.align === "right" ? "text-right" : "text-left")}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line @lg:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-4 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{title.cell(r)}</span>
              {aside && <span className="tabular-nums">{aside.cell(r)}</span>}
            </div>
            {rest.length > 0 && (
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {rest.map((c) => (
                  <div key={c.key} className="flex justify-between gap-2">
                    <dt className="text-muted">{c.header}</dt>
                    <dd className="tabular-nums">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

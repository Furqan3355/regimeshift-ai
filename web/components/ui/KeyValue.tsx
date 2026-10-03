import type { ReactNode } from "react";

/** Definition list of label → value rows. */
export function KeyValue({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 text-sm">
          <dt className="shrink-0 text-muted">{k}</dt>
          <dd className="text-right text-ink tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

import { Card, CardHeader } from "@/components/ui/Card";
import { signedPct, usd } from "@/lib/format";

export interface PriceLevel {
  label: string;
  value: number | null | undefined;
}

/**
 * Compares price levels against the current on-chain price: value, % difference
 * and a bar centred on zero. Bars are scaled to the largest difference shown.
 */
export function PriceLevels({ current, levels, note }: { current: number; levels: PriceLevel[]; note?: string }) {
  const rows = levels
    .filter((l): l is { label: string; value: number } => l.value != null && l.value > 0)
    .map((l) => ({ ...l, diff: ((l.value - current) / current) * 100 }));
  const scale = Math.max(1, ...rows.map((r) => Math.abs(r.diff)));

  return (
    <Card>
      <CardHeader title="Price levels" meta={`vs on-chain ${usd(current)}`} />
      <ul className="space-y-2.5 px-4 pt-3 pb-3">
        {rows.map((r) => {
          const w = (Math.abs(r.diff) / scale) * 50;
          return (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-ink-2">{r.label}</span>
                <span className="shrink-0 tabular-nums">
                  {usd(r.value)} <span className="ml-1 inline-block w-14 text-right text-xs text-muted">{signedPct(r.diff, 1)}</span>
                </span>
              </div>
              <div className="relative mt-1 h-1.5 rounded-full bg-surface-2" aria-hidden>
                <div className="absolute inset-y-0 left-1/2 w-px bg-muted" />
                <div
                  className="absolute inset-y-0 rounded-full bg-ink-2"
                  style={r.diff >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {note && <p className="border-t border-line px-4 py-2 text-xs text-wait">{note}</p>}
    </Card>
  );
}

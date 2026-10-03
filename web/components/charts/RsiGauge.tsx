import { Card, CardHeader } from "@/components/ui/Card";
import { cn } from "@/lib/format";

const OVERSOLD = 30;
const OVERBOUGHT = 70;

/** Descriptive RSI band for display. RSI is not an input to the verdict. */
const zoneOf = (v: number) => (v < OVERSOLD ? "Oversold" : v > OVERBOUGHT ? "Overbought" : "Neutral");

/** Horizontal 0–100 RSI(14) gauge with oversold / neutral / overbought bands. */
export function RsiGauge({ rsi }: { rsi: number | string | null }) {
  const value = typeof rsi === "number" ? rsi : null;

  return (
    <Card>
      <CardHeader title="RSI (14)" meta={value != null ? zoneOf(value) : undefined} />
      <div className="px-4 pt-3 pb-3">
        <p className="text-2xl font-semibold tabular-nums">{value != null ? value.toFixed(1) : "n/a"}</p>
        <div className="relative mt-3 h-2.5" role="img" aria-label={value != null ? `RSI ${value.toFixed(1)}, ${zoneOf(value)}` : "RSI not available"}>
          <div className="flex h-full overflow-hidden rounded-full">
            <div className="bg-line" style={{ width: `${OVERSOLD}%` }} />
            <div className="bg-surface-2" style={{ width: `${OVERBOUGHT - OVERSOLD}%` }} />
            <div className="bg-line" style={{ width: `${100 - OVERBOUGHT}%` }} />
          </div>
          {value != null && (
            <div
              className="absolute -top-1 h-[18px] w-1 -translate-x-1/2 rounded-full bg-ink ring-2 ring-surface"
              style={{ left: `${Math.max(0, Math.min(100, value))}%` }}
            />
          )}
        </div>
        <div className="relative mt-1.5 h-4 text-[11px] text-muted tabular-nums">
          {[0, OVERSOLD, OVERBOUGHT, 100].map((n) => (
            <span
              key={n}
              className={cn("absolute", n === 0 ? "left-0" : n === 100 ? "right-0" : "-translate-x-1/2")}
              style={n !== 0 && n !== 100 ? { left: `${n}%` } : undefined}
            >
              {n}
            </span>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>Oversold</span>
          <span>Neutral</span>
          <span>Overbought</span>
        </div>
      </div>
    </Card>
  );
}

"use client";

import { Card } from "@/components/ui/Card";
import { Meter, Skeleton } from "@/components/ui/Feedback";
import { TONE } from "@/components/ui/tone";
import { cn, tidy, usd } from "@/lib/format";
import type { Verdict } from "@/lib/types";
import { WalletAction } from "./WalletAction";

const LABEL = { buy: "BUY", wait: "WAIT", skip: "SKIP" } as const;

/** One-line summary: the entry note for a buy, otherwise the deciding rule. */
const summaryOf = (r: Verdict) => tidy(r.entry ? r.entry.note : r.reasons[0] ?? "");

export function VerdictPanel({
  verdict: r,
  price,
  onPaperBuy,
  goToPaper,
}: {
  verdict: Verdict;
  /** Latest price for the ticker (falls back to the price the verdict used). */
  price: number;
  onPaperBuy: (ticker: string, usd: number) => void;
  goToPaper: () => void;
}) {
  const sizePct = Math.round(r.size * 100);

  return (
    <Card className={cn("border-l-4", TONE[r.verdict].edge)}>
      <div className="p-4">
        <p className="text-xs text-muted">{r.ticker} · verdict</p>
        <p className={cn("mt-0.5 text-lg font-semibold tracking-tight", TONE[r.verdict].text)}>
          {LABEL[r.verdict]}
          {r.caution && " WITH CAUTION"}
        </p>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted">Current</dt>
            <dd className="font-medium tabular-nums">{usd(price)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Suggested entry</dt>
            <dd className="font-medium tabular-nums">{r.entry ? usd(r.entry.price) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Position size</dt>
            <dd className="font-medium tabular-nums">{sizePct}%</dd>
          </div>
        </dl>
        <div className="mt-2">
          <Meter value={sizePct} tone={r.verdict} label="Position size, % of a normal position" />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink-2">{summaryOf(r)}</p>

        {r.verdict === "buy" && <WalletAction ticker={r.ticker} onPaperBuy={onPaperBuy} goToPaper={goToPaper} />}
      </div>
    </Card>
  );
}

export function VerdictSkeleton() {
  return (
    <Card>
      <div className="space-y-3 p-4" aria-busy>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </Card>
  );
}

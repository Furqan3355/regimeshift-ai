"use client";

import { useState } from "react";
import { PriceChart } from "@/components/charts/PriceChart";
import { PriceLevels } from "@/components/charts/PriceLevels";
import { ReturnsChart } from "@/components/charts/ReturnsChart";
import { RsiGauge } from "@/components/charts/RsiGauge";
import { LiveBadge } from "@/components/layout/LiveBadge";
import { Toolbar } from "@/components/layout/Toolbar";
import { Card } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useAdvice } from "@/hooks/useAdvice";
import type { Market } from "@/hooks/useMarket";
import { TICKERS } from "@/lib/demo";
import { usd } from "@/lib/format";
import { AdvisorDetails } from "./AdvisorDetails";
import { SignalList } from "./SignalList";
import { TickerSelect } from "./TickerSelect";
import { VerdictPanel, VerdictSkeleton } from "./VerdictPanel";

export function AdvisorView({
  market,
  onPaperBuy,
  goToPaper,
}: {
  market: Market;
  onPaperBuy: (ticker: string, usd: number) => void;
  goToPaper: () => void;
}) {
  const [ticker, setTicker] = useState(TICKERS[0]);
  const advice = useAdvice(ticker, market);
  const livePrice = market.live === null ? undefined : market.prices[ticker];
  const noHistory = market.live
    ? "No price history returned by the proxy for this ticker. (If the proxy was started before this update, restart it.)"
    : "Price history is only available in LIVE mode. Demo data has no candles.";

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Advisor</h1>
      <Toolbar end={<LiveBadge live={market.live} lastUpdate={market.lastUpdate} />}>
        <TickerSelect tickers={TICKERS} value={ticker} onChange={setTicker} />
        <p className="text-sm">
          <span className="text-muted">Price</span>{" "}
          <span className="font-semibold tabular-nums">{livePrice ? usd(livePrice) : "—"}</span>
        </p>
      </Toolbar>

      {advice.status === "loading" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <VerdictSkeleton />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      )}

      {advice.status === "nodata" && (
        <Card>
          <EmptyState>
            No usable live data for {ticker}: the API returned no price, or not enough candle history. Try another ticker.
          </EmptyState>
        </Card>
      )}

      {advice.status === "ready" && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4">
              <VerdictPanel verdict={advice.verdict} price={livePrice ?? advice.data.onp} onPaperBuy={onPaperBuy} goToPaper={goToPaper} />
              <SignalList verdict={advice.verdict} />
            </div>
            <div className="lg:col-span-2">
              <PriceChart history={advice.history} high={advice.data.ta.high} low={advice.data.ta.low} emptyText={noHistory} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <PriceLevels
              current={advice.data.onp}
              levels={[
                { label: "Reference price", value: advice.data.refp },
                { label: "20-day average", value: advice.data.ta.sma },
                { label: "Suggested entry", value: advice.verdict.entry?.price },
                { label: "20-day low", value: advice.data.ta.low },
                { label: "20-day high", value: advice.data.ta.high },
              ]}
              note={advice.verdict.anomalous ? "On-chain and reference prices differ by a round multiple (flagged as a data glitch)." : undefined}
            />
            <RsiGauge rsi={advice.data.ta.rsi} />
            <div className="md:col-span-2 lg:col-span-1">
              <ReturnsChart history={advice.history} volatility={advice.data.vol} emptyText={noHistory} />
            </div>
          </div>

          <AdvisorDetails data={advice.data} verdict={advice.verdict} />
        </>
      )}
    </div>
  );
}

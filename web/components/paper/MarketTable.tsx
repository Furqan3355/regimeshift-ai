"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { pnlText } from "@/components/ui/tone";
import { signedPct, usd } from "@/lib/format";

export const TRADE_USD = 50;

interface Row {
  ticker: string;
  price?: number;
  change: number;
  owned: boolean;
}

export function MarketTable({
  live,
  tickers,
  prices,
  startPrices,
  owned,
  cash,
  onBuy,
  onSell,
}: {
  live: boolean | null;
  tickers: string[];
  prices: Record<string, number>;
  startPrices: Record<string, number>;
  owned: (t: string) => boolean;
  cash: number;
  onBuy: (t: string) => void;
  onSell: (t: string) => void;
}) {
  const rows: Row[] = tickers.map((t) => {
    const px = prices[t];
    return { ticker: t, price: px, change: px && startPrices[t] ? ((px - startPrices[t]) / startPrices[t]) * 100 : 0, owned: owned(t) };
  });

  return (
    <Card>
      <CardHeader
        title={live ? "Market" : "Market (demo)"}
        meta={live ? "on-chain prices · change since page opened" : "simulated prices"}
      />
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.ticker}
        empty="No tickers."
        columns={[
          { key: "ticker", header: "Ticker", stacked: "title", cell: (r) => <span className="font-medium">{r.ticker}</span> },
          { key: "price", header: "Price", align: "right", cell: (r) => (r.price ? usd(r.price) : <span className="text-muted">n/a</span>) },
          { key: "change", header: "Change", align: "right", cell: (r) => (r.price ? <span className={pnlText(r.change)}>{signedPct(r.change)}</span> : "") },
          {
            key: "trade", header: "Trade", align: "right", stacked: "aside",
            cell: (r) => (
              <span className="inline-flex gap-1.5">
                <Button size="sm" onClick={() => onBuy(r.ticker)} disabled={!r.price || cash < TRADE_USD}>Buy ${TRADE_USD}</Button>
                <Button size="sm" variant="ghost" onClick={() => onSell(r.ticker)} disabled={!r.price || !r.owned}>Sell all</Button>
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}

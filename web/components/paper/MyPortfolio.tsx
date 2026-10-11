"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Footnote } from "@/components/ui/Feedback";
import { MetricBar } from "@/components/ui/MetricBar";
import { pnlText } from "@/components/ui/tone";
import type { Market } from "@/hooks/useMarket";
import type { PaperPortfolio } from "@/hooks/usePaperPortfolio";
import { TICKERS } from "@/lib/demo";
import { signedPct, signedUsd, usd } from "@/lib/format";
import { ActivityLog } from "./ActivityLog";
import { MarketTable, TRADE_USD } from "./MarketTable";

interface PositionRow {
  ticker: string;
  qty: number;
  cost: number;
  value: number;
  pnl: number;
}

export function MyPortfolio({ market, portfolio: p }: { market: Market; portfolio: PaperPortfolio }) {
  const positions: PositionRow[] = Object.entries(p.holdings)
    .filter(([, h]) => h.qty > 0)
    .map(([sym, h]) => {
      const value = h.qty * (market.prices[sym] ?? h.costBasis / h.qty);
      return { ticker: sym, qty: h.qty, cost: h.costBasis, value, pnl: value - h.costBasis };
    });

  return (
    <div className="space-y-4">
      <MetricBar
        items={[
          { label: "Cash", value: usd(p.cash) },
          { label: "Holdings value", value: usd(p.holdingsValue) },
          { label: "Unrealized P&L", value: signedUsd(p.unrealized), valueClass: pnlText(p.unrealized) },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MarketTable
            live={market.live}
            tickers={TICKERS}
            prices={market.prices}
            startPrices={market.startPrices}
            owned={(t) => (p.holdings[t]?.qty ?? 0) > 0}
            cash={p.cash}
            onBuy={(t) => p.buy(t, TRADE_USD)}
            onSell={p.sell}
          />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Positions" meta={positions.length || undefined} />
            <DataTable<PositionRow>
              rows={positions}
              rowKey={(r) => r.ticker}
              empty="No positions yet. Buy from the market list or the Advisor."
              columns={[
                { key: "ticker", header: "Ticker", stacked: "title", cell: (r) => r.ticker },
                { key: "qty", header: "Units", align: "right", cell: (r) => r.qty.toFixed(4) },
                { key: "cost", header: "Cost", align: "right", cell: (r) => usd(r.cost) },
                { key: "value", header: "Value", align: "right", cell: (r) => usd(r.value) },
                {
                  key: "pnl", header: "P&L", align: "right", stacked: "aside",
                  cell: (r) => <span className={pnlText(r.pnl)}>{signedUsd(r.pnl)} ({signedPct((r.pnl / r.cost) * 100, 1)})</span>,
                },
              ]}
            />
          </Card>
          <ActivityLog
            title="Trade history"
            items={p.log.slice(0, 15).map((l, i) => ({ key: `${i}-${l.t}`, text: l.text, time: l.t }))}
            empty="No trades yet."
          />
          <Button variant="ghost" size="sm" onClick={p.reset}>
            <RotateCcw /> Reset account to $10,000
          </Button>
        </div>
      </div>

      <Footnote>
        Saved in this browser only, and shared with the Advisor&apos;s PancakeSwap button. LIVE prices refresh every 10 s.
        DEMO prices random-walk.
      </Footnote>
    </div>
  );
}

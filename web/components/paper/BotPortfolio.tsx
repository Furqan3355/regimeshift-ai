"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState, Footnote, Skeleton } from "@/components/ui/Feedback";
import { MetricBar } from "@/components/ui/MetricBar";
import { pnlText, type Tone } from "@/components/ui/tone";
import type { BotFeed } from "@/hooks/useBot";
import { signedPct, signedUsd, stamp, tidy, usd } from "@/lib/format";
import type { BotLogEntry, BotPosition } from "@/lib/types";
import { ActivityLog } from "./ActivityLog";

const KIND_TONE: Record<BotLogEntry["kind"], Tone> = { buy: "buy", sell: "skip", skip: "neutral", error: "wait" };
const LEARN_AFTER = 20;

export function BotPortfolio({ feed, prices }: { feed: BotFeed; prices: Record<string, number> }) {
  if (feed.status === "loading") return <Skeleton className="h-16 w-full" />;
  if (feed.status === "unavailable") {
    return (
      <Card>
        <EmptyState>
          The bot is not available. It runs inside the local proxy (<code className="font-mono">node server.mjs</code>), so DEMO
          mode cannot show it.
        </EmptyState>
      </Card>
    );
  }

  const b = feed.snap;
  // The server snapshot values positions at entry price; mark them to the live price when we have one.
  const positions: BotPosition[] = b.positions.map((p) => {
    const price = prices[p.ticker] ?? p.price;
    return { ...p, price, pnlPct: ((price - p.entry) / p.entry) * 100 };
  });
  const equity = b.cash + positions.reduce((s, p) => s + p.qty * p.price, 0);
  const pnl = equity - b.startCash;

  return (
    <div className="space-y-4">
      <MetricBar
        items={[
          { label: "Bot equity", value: usd(equity) },
          { label: "Cash", value: usd(b.cash) },
          { label: `P&L vs ${usd(b.startCash, 0)}`, value: signedUsd(pnl), valueClass: pnlText(pnl) },
        ]}
      />
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>Last scan <span className="text-ink-2">{stamp(b.lastTick)}</span></span>
        <span>Scans <span className="text-ink-2 tabular-nums">{b.ticks}</span></span>
        <span>Closed trades <span className="text-ink-2 tabular-nums">{b.closedCount}</span></span>
        <span>Learning <span className="text-ink-2">{b.closedCount < LEARN_AFTER ? `not yet (${b.closedCount}/${LEARN_AFTER})` : "ready"}</span></span>
      </p>

      <div className="grid gap-4 lg:grid-cols-5">
        <ActivityLog
          className="lg:col-span-3"
          title="Why the bot acted"
          items={b.log.filter((l) => l.kind !== "skip").slice(0, 30).map((l, i) => ({
            key: `${l.t}-${i}`,
            text: tidy(l.text),
            time: stamp(l.t),
            badge: { label: l.kind, tone: KIND_TONE[l.kind] },
          }))}
          empty="No actions yet."
        />
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Bot positions" meta={positions.length || undefined} />
            <DataTable<BotPosition>
              rows={positions}
              rowKey={(r) => r.ticker}
              empty="No open positions. The bot only buys when every rule says buy."
              columns={[
                { key: "ticker", header: "Ticker", stacked: "title", cell: (r) => r.ticker },
                { key: "entry", header: "Entry", align: "right", cell: (r) => usd(r.entry) },
                { key: "now", header: "Now", align: "right", cell: (r) => usd(r.price) },
                { key: "pnl", header: "P&L", align: "right", stacked: "aside", cell: (r) => <span className={pnlText(r.pnlPct)}>{signedPct(r.pnlPct)}</span> },
              ]}
            />
          </Card>
          <ActivityLog
            title="Closed trades"
            items={b.closed.slice().reverse().slice(0, 15).map((c, i) => ({
              key: `${c.closedAt}-${i}`,
              text: <><span className="font-medium text-ink">{c.ticker}</span> <span className={pnlText(c.pnlPct)}>{signedPct(c.pnlPct)}</span> · {tidy(c.exitReason)}</>,
              time: stamp(c.closedAt),
            }))}
            empty="No closed trades yet."
          />
        </div>
      </div>

      <Footnote>
        The bot scans every 5 minutes on the server, even with this page closed. Real data, paper money, same verdict rules as the
        Advisor. Short-term P&amp;L is noise, not a track record.
      </Footnote>
    </div>
  );
}

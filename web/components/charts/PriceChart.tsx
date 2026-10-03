"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { usd } from "@/lib/format";
import { withMovingAverage } from "@/lib/series";
import type { PricePoint } from "@/lib/types";
import { ChartLegend } from "./ChartLegend";
import { AXIS, GRID, TOOLTIP, axisUsd, shortDate } from "./chartTheme";

/** Daily closes with a 20-day moving average and the 20-day high/low from /api/analysis. */
export function PriceChart({
  history,
  high,
  low,
  emptyText,
}: {
  history: PricePoint[] | null;
  high?: number;
  low?: number;
  emptyText: string;
}) {
  const rows = useMemo(() => (history ? withMovingAverage(history, 20) : []), [history]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Price"
        meta={history ? `${history.length} days` : undefined}
        action={history && (
          <ChartLegend items={[{ label: "Close", color: "var(--ink)" }, { label: "20-day avg", color: "var(--accent)", dashed: true }]} />
        )}
      />
      {history ? (
        <div className="h-64 flex-1 px-2 pt-3 pb-1 lg:h-auto lg:min-h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="t" tickFormatter={shortDate} minTickGap={28} {...AXIS} />
              <YAxis domain={["auto", "auto"]} tickFormatter={axisUsd} width={58} {...AXIS} />
              <Tooltip
                {...TOOLTIP}
                cursor={{ stroke: "var(--line)" }}
                labelFormatter={(t) => shortDate(Number(t))}
                formatter={(v, name) => [usd(Number(v)), name]}
              />
              {high != null && (
                <ReferenceLine y={high} ifOverflow="extendDomain" stroke="var(--muted)" strokeDasharray="2 3"
                  label={{ value: "20d high", position: "insideTopLeft", fontSize: 10, fill: "var(--muted)" }} />
              )}
              {low != null && (
                <ReferenceLine y={low} ifOverflow="extendDomain" stroke="var(--muted)" strokeDasharray="2 3"
                  label={{ value: "20d low", position: "insideBottomLeft", fontSize: 10, fill: "var(--muted)" }} />
              )}
              <Line dataKey="ma" name="20-day avg" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              <Line dataKey="close" name="Close" stroke="var(--ink)" strokeWidth={1.75} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState>{emptyText}</EmptyState>
      )}
    </Card>
  );
}

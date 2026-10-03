"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { signedPct } from "@/lib/format";
import { dailyReturns } from "@/lib/series";
import type { PricePoint } from "@/lib/types";
import { AXIS, GRID, TOOLTIP, shortDate } from "./chartTheme";

const VOL_WINDOW = 7; // the regime model's volatility = stdev of the last 7 daily returns

/** Daily % returns; the last 7 (the regime model's volatility window) are drawn solid. */
export function ReturnsChart({
  history,
  volatility,
  emptyText,
}: {
  history: PricePoint[] | null;
  /** 7-day volatility from /api/analysis (or demo data). */
  volatility: number;
  emptyText: string;
}) {
  const { rows, excluded } = useMemo(() => (history ? dailyReturns(history) : { rows: [], excluded: 0 }), [history]);

  return (
    <Card>
      <CardHeader title="Daily returns" meta={`7-day volatility ${volatility.toFixed(2)}%`} />
      {history ? (
        <>
          <div className="h-36 px-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="t" tickFormatter={shortDate} minTickGap={28} {...AXIS} />
                <YAxis tickFormatter={(n: number) => `${n}%`} width={40} {...AXIS} />
                <Tooltip
                  {...TOOLTIP}
                  cursor={{ fill: "var(--surface-2)" }}
                  labelFormatter={(t) => shortDate(Number(t))}
                  formatter={(v) => [signedPct(Number(v)), "Return"]}
                />
                <ReferenceLine y={0} stroke="var(--line)" />
                <Bar dataKey="ret" isAnimationActive={false}>
                  {rows.map((r, i) => (
                    <Cell
                      key={r.t}
                      fill={r.ret >= 0 ? "var(--buy)" : "var(--skip)"}
                      fillOpacity={i >= rows.length - VOL_WINDOW ? 0.9 : 0.35}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="px-4 pb-2.5 text-xs text-muted">
            Solid bars: last {VOL_WINDOW} days, used for volatility.
            {excluded > 0 && ` ${excluded} glitch day${excluded > 1 ? "s" : ""} (>50% move) hidden.`}
          </p>
        </>
      ) : (
        <EmptyState>{emptyText}</EmptyState>
      )}
    </Card>
  );
}

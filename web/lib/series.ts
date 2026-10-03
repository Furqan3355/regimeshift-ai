// Presentation-only transforms of real candle history for the charts.
// Nothing here feeds a trading decision; the verdict comes only from proxy/verdict.mjs.
import type { PricePoint } from "./types";

/** Same cut-off proxy/lib.mjs analyzeCloses() uses to drop candle gaps / scale glitches. */
const GLITCH_RETURN_PCT = 50;

export interface PriceRow extends PricePoint {
  /** Trailing simple moving average; null until enough days exist. */
  ma: number | null;
}

export function withMovingAverage(points: PricePoint[], window = 20): PriceRow[] {
  let sum = 0;
  return points.map((p, i) => {
    sum += p.close;
    if (i >= window) sum -= points[i - window].close;
    return { ...p, ma: i >= window - 1 ? sum / window : null };
  });
}

export interface ReturnRow {
  t: number;
  /** Daily return in percent. */
  ret: number;
}

/** Daily % returns, skipping glitch days exactly like the regime model's training data. */
export function dailyReturns(points: PricePoint[]): { rows: ReturnRow[]; excluded: number } {
  const rows: ReturnRow[] = [];
  let excluded = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].close;
    if (prev === 0) continue;
    const ret = ((points[i].close - prev) / prev) * 100;
    if (Math.abs(ret) > GLITCH_RETURN_PCT) excluded++;
    else rows.push({ t: points[i].t, ret });
  }
  return { rows, excluded };
}

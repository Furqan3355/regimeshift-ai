/**
 * technicalAnalysis.ts
 * ----------------------
 * REAL (not placeholder) technical analysis, computed LIVE on every request.
 * Unlike the GMM regime model (needs sklearn, so it's trained offline in
 * Python and only inference is ported to TS) or market news (needs a slow
 * external fetch, so it's cached via snapshotStore.ts), technical analysis
 * from candles is cheap, dependency-free math -- there's no reason to cache
 * it. It's always as fresh as the latest candle.
 */

import type { Candle } from "./rwaData.js";

export interface TechnicalAnalysis {
  trend: "uptrend" | "downtrend" | "sideways";
  rsi_14: number | null;
  rsi_signal: "overbought" | "oversold" | "neutral" | "insufficient_data";
  sma_20: number | null;
  recent_high: number;
  recent_low: number;
}

function sma(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  return Math.round((slice.reduce((a, b) => a + b, 0) / window) * 10000) / 10000;
}

/** Standard 14-period RSI (Wilder's smoothing) from a series of closes. */
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) avgGain += change; else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}

export function computeTechnicalAnalysis(candles: Candle[]): TechnicalAnalysis {
  const closes = candles.map((c) => c.close);
  const sma20 = sma(closes, 20);
  const currentClose = closes.at(-1) ?? null;
  const rsi14 = rsi(closes, 14);

  let trend: TechnicalAnalysis["trend"] = "sideways";
  if (sma20 !== null && currentClose !== null) {
    const diffPct = ((currentClose - sma20) / sma20) * 100;
    if (diffPct > 1) trend = "uptrend";
    else if (diffPct < -1) trend = "downtrend";
  }

  let rsiSignal: TechnicalAnalysis["rsi_signal"] = "insufficient_data";
  if (rsi14 !== null) {
    rsiSignal = rsi14 > 70 ? "overbought" : rsi14 < 30 ? "oversold" : "neutral";
  }

  const window = closes.slice(-20);
  return {
    trend,
    rsi_14: rsi14,
    rsi_signal: rsiSignal,
    sma_20: sma20,
    recent_high: window.length ? Math.max(...window) : NaN,
    recent_low: window.length ? Math.min(...window) : NaN,
  };
}
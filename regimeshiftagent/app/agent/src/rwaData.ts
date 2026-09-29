/**
 * rwaData.ts
 * -----------
 * TS port of the candle-fetching part of data_ingestion.py's DataIngestion
 * class. Only what's needed for live technical analysis -- token
 * list/parsing stays Python-side (used offline, in collect_training_data.py
 * and build_snapshots.py).
 */

import { BinanceConfig } from "./binanceConfig.js";

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

export class RwaDataError extends Error {}

export async function fetchCandles(
  cfg: BinanceConfig,
  binanceChainId: string,
  tokenContractAddress: string,
  bar = "1d",
  limit = 30,
): Promise<Candle[]> {
  const signed = cfg.signRequest("GET", "/api/v1/dex/market/candles", {
    binanceChainId,
    tokenContractAddress,
    bar,
    limit,
  });
  const resp = await fetch(signed.url, { method: "GET", headers: signed.headers });
  if (resp.status !== 200) {
    const text = await resp.text().catch(() => "");
    throw new RwaDataError(`Candle fetch failed: HTTP ${resp.status}: ${text}`);
  }
  const body = await resp.json();
  if (body.code !== 0) {
    throw new RwaDataError(`Candle fetch failed: code ${body.code}: ${body.msg}`);
  }
  // Raw candle = [open, high, low, close, volume, timestamp_ms, tradeCount]
  // (same layout data_ingestion.py's fetch_candles reads). Sort by timestamp so
  // downstream math never depends on the API's ordering.
  const raw = body.data as Array<Array<string | number>>;
  return raw
    .map((c) => ({
      open: Number(c[0]),
      high: Number(c[1]),
      low: Number(c[2]),
      close: Number(c[3]),
      timestamp: Number(c[5]),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
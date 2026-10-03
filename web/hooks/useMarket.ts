"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { TICKERS, demoPrices } from "@/lib/demo";
import type { PricesResponse, Quote } from "@/lib/types";

const PRICES_PATH = `/api/prices?tickers=${TICKERS.join(",")}`;
const LIVE_POLL_MS = 10_000;
const DEMO_TICK_MS = 2_000;

export interface Market {
  /** null while probing the proxy; true = real Binance data; false = DEMO. */
  live: boolean | null;
  /** Current price per ticker. In LIVE mode a ticker missing from the RWA list has no entry. */
  prices: Record<string, number>;
  /** First price seen this session, for the "change since you opened" column. */
  startPrices: Record<string, number>;
  /** Raw /api/prices rows (reference price, market status). LIVE only. */
  quotes: Record<string, Quote>;
  lastUpdate: number;
}

/** Auto-detects the local proxy; falls back to a random-walk DEMO market. */
export function useMarket(): Market {
  const [live, setLive] = useState<boolean | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>(demoPrices);
  const [startPrices, setStartPrices] = useState<Record<string, number>>(demoPrices);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [lastUpdate, setLastUpdate] = useState(0);
  const started = useRef(false);

  const apply = useCallback((j: PricesResponse) => {
    const next: Record<string, number> = {};
    for (const [sym, q] of Object.entries(j.prices)) if (q?.onp) next[sym] = q.onp;
    const first = !started.current;
    started.current = true;
    setQuotes(j.prices);
    setPrices(next);
    setStartPrices((prev) => {
      const s = first ? {} : { ...prev };
      for (const sym in next) if (!(sym in s)) s[sym] = next[sym];
      return s;
    });
    setLastUpdate(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<PricesResponse>(PRICES_PATH)
      .then((j) => {
        if (cancelled) return;
        if (j?.prices) { apply(j); setLive(true); } else setLive(false);
      })
      .catch(() => { if (!cancelled) setLive(false); });
    return () => { cancelled = true; };
  }, [apply]);

  useEffect(() => {
    if (live === null) return;
    if (live) {
      const id = setInterval(() => { api<PricesResponse>(PRICES_PATH).then(apply).catch(() => {}); }, LIVE_POLL_MS);
      return () => clearInterval(id);
    }
    const id = setInterval(() => {
      setPrices((prev) => {
        const next: Record<string, number> = {};
        for (const sym in prev) next[sym] = Math.max(0.01, prev[sym] * (1 + (Math.random() - 0.5) * 0.006));
        return next;
      });
    }, DEMO_TICK_MS);
    return () => clearInterval(id);
  }, [live, apply]);

  return { live, prices, startPrices, quotes, lastUpdate };
}

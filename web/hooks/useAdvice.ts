"use client";

import { useEffect, useRef, useState } from "react";
import { api, mapStatus } from "@/lib/api";
import { DEMO } from "@/lib/demo";
import { decide } from "@/lib/verdict";
import type { AnalysisResponse, NewsResponse, PricePoint, Quote, TickerData, Verdict } from "@/lib/types";
import type { Market } from "./useMarket";

const ANALYSIS_TTL_MS = 5 * 60_000; // the proxy caches for 5 min too

export type Advice =
  | { status: "loading" }
  | { status: "nodata" }
  | { status: "ready"; data: TickerData; verdict: Verdict; history: PricePoint[] | null };

interface Loaded {
  data: TickerData;
  /** Daily closes for charts. null in DEMO mode: demo data has no candle history. */
  history: PricePoint[] | null;
}

/** Gathers price + analysis + news for one ticker, then runs the shared decide(). */
export function useAdvice(ticker: string, market: Market): Advice {
  const [advice, setAdvice] = useState<Advice>({ status: "loading" });
  const analysisCache = useRef(new Map<string, { at: number; value: AnalysisResponse }>());
  const newsCache = useRef(new Map<string, NewsResponse>());
  const quotes = useRef<Record<string, Quote>>({});

  // Read quotes through a ref: a price refresh should not re-run the whole pipeline.
  useEffect(() => { quotes.current = market.quotes; });

  useEffect(() => {
    if (market.live === null) return;
    let cancelled = false;

    async function load(): Promise<Loaded | null> {
      if (!market.live) return { data: DEMO[ticker], history: null };
      const q = quotes.current[ticker];
      if (!q?.onp || !q.refp) return null;

      let a = analysisCache.current.get(ticker);
      if (!a || Date.now() - a.at > ANALYSIS_TTL_MS) {
        try {
          a = { at: Date.now(), value: await api<AnalysisResponse>(`/api/analysis?ticker=${ticker}`) };
          analysisCache.current.set(ticker, a);
        } catch { a = undefined; }
      }
      if (!a || a.value.ret == null || a.value.vol == null) return null;

      let n = newsCache.current.get(ticker);
      if (!n) {
        try { n = await api<NewsResponse>(`/api/news?ticker=${ticker}`); newsCache.current.set(ticker, n); }
        catch { n = { ticker, news: null }; }
      }

      const ta = a.value.ta;
      return {
        data: {
          ret: a.value.ret, vol: a.value.vol, onp: q.onp, refp: q.refp, mkt: mapStatus(q.marketStatus),
          ta: { trend: ta.trend, rsi: ta.rsi ?? "n/a", sma: ta.sma, low: ta.low, high: ta.high },
          news: n.news ?? "",
        },
        history: a.value.history?.length ? a.value.history : null,
      };
    }

    setAdvice({ status: "loading" });
    load().then((r) => {
      if (cancelled) return; // user picked another ticker while this was loading
      setAdvice(r ? { status: "ready", ...r, verdict: decide({ ticker, ...r.data }) } : { status: "nodata" });
    });
    return () => { cancelled = true; };
  }, [ticker, market.live]);

  return advice;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Holding, TradeLogEntry } from "@/lib/types";

export const START_CASH = 10_000;
// Same key and shape as the old proxy/public/index.html, so existing paper accounts carry over.
const STATE_KEY = "regimeshift_papertrade_v2";

interface PaperState {
  cash: number;
  holdings: Record<string, Holding>;
  log: TradeLogEntry[];
}

const fresh = (): PaperState => ({ cash: START_CASH, holdings: {}, log: [] });

function load(): PaperState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    return { cash: Number(s.cash) || 0, holdings: s.holdings || {}, log: s.log || [] };
  } catch {
    return fresh();
  }
}

export interface PaperPortfolio extends PaperState {
  holdingsValue: number;
  unrealized: number;
  buy: (sym: string, usd: number) => void;
  sell: (sym: string) => void;
  reset: () => void;
}

/** Manual paper account, kept in this browser only. */
export function usePaperPortfolio(prices: Record<string, number>): PaperPortfolio {
  const [state, setState] = useState<PaperState>(fresh);
  const [loaded, setLoaded] = useState(false);
  const priceRef = useRef(prices);
  useEffect(() => { priceRef.current = prices; });

  useEffect(() => { setState(load()); setLoaded(true); }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* storage blocked: keep in memory */ }
  }, [state, loaded]);

  const buy = useCallback((sym: string, usd: number) => {
    const px = priceRef.current[sym];
    if (!px) return;
    setState((s) => {
      if (s.cash < usd) return s;
      const pos = s.holdings[sym] ?? { qty: 0, costBasis: 0 };
      return {
        cash: s.cash - usd,
        holdings: { ...s.holdings, [sym]: { qty: pos.qty + usd / px, costBasis: pos.costBasis + usd } },
        log: [{ t: new Date().toLocaleTimeString(), text: `Bought $${usd} of ${sym} @ $${px.toFixed(2)}` }, ...s.log],
      };
    });
  }, []);

  const sell = useCallback((sym: string) => {
    const px = priceRef.current[sym];
    if (!px) return;
    setState((s) => {
      const pos = s.holdings[sym];
      if (!pos || pos.qty <= 0) return s;
      const proceeds = pos.qty * px;
      const { [sym]: _sold, ...rest } = s.holdings;
      return {
        cash: s.cash + proceeds,
        holdings: rest,
        log: [{ t: new Date().toLocaleTimeString(), text: `Sold all ${sym} for $${proceeds.toFixed(2)}` }, ...s.log],
      };
    });
  }, []);

  const reset = useCallback(() => setState(fresh()), []);

  let holdingsValue = 0, cost = 0;
  for (const [sym, p] of Object.entries(state.holdings)) {
    holdingsValue += p.qty * (prices[sym] ?? p.costBasis / p.qty);
    cost += p.costBasis;
  }

  return { ...state, holdingsValue, unrealized: holdingsValue - cost, buy, sell, reset };
}

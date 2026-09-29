/**
 * regimeShiftBridge.ts
 * ----------------------
 * The glue between the deterministic Phase 1-3 logic (regimeEngine.ts,
 * tradeExecutor.ts, binanceConfig.ts) and the agent's delivery step in
 * unifiedMain.ts.
 *
 * Design: the LLM NEVER computes the regime, the spread gate, or the trade
 * report -- all of that is fixed, deterministic code (same boundary rule
 * unifiedMain.ts already follows for signing: "money/decisions never in the
 * LLM"). The LLM's only job here is to turn the computed JSON into a
 * readable natural-language explanation for the buyer -- which is exactly
 * what buildRunWork()'s existing generateText() call is for.
 *
 * Expected buyer prompt shape (JSON string), e.g.:
 * {
 *   "ticker": "NVDA",
 *   "returnPct": 0.4,
 *   "volatilityPct": 0.9,
 *   "onChainPrice": 118.96,
 *   "referencePrice": 118.96,
 *   "marketStatus": "regular",
 *   "trade": {
 *     "binanceChainId": "56",
 *     "evmTx": { "from": "0x...", "to": "0x...", "value": "0", "data": "0x" },
 *     "expectedAmount": 100.0,
 *     "simulatedAmount": 99.92,
 *     "nativeTokenPriceUsd": 600.0
 *   }
 * }
 * "trade" is optional -- omit it to get a regime/entry read without running
 * the (network-calling, signed) dry-run simulation.
 */

import gmmParamsJson from "./gmm_params.json" with { type: "json" };
import {
  evaluateToken,
  isAnomalousSpread,
  computeSpreadPct,
  type GmmParams,
} from "./regimeEngine.js";
import { BinanceConfig } from "./binanceConfig.js";
import { TradeExecutor, type EvmTx } from "./tradeExecutor.js";
import { getSnapshot } from "./snapshotStore.js";
import { fetchCandles } from "./rwaData.js";
import { computeTechnicalAnalysis } from "./technicalAnalysis.js";

const GMM_PARAMS = gmmParamsJson as unknown as GmmParams;

export interface RegimeShiftRequest {
  ticker: string;
  returnPct: number;
  volatilityPct: number;
  onChainPrice: number;
  referencePrice: number;
  marketStatus: string;
  maxSpreadPct?: number;
  // Optional: if given, technical analysis is computed LIVE (cheap math,
  // no caching needed) from real candles for this token.
  binanceChainId?: string;
  tokenContractAddress?: string;
  trade?: {
    binanceChainId: string;
    evmTx: EvmTx;
    expectedAmount: number;
    simulatedAmount: number;
    nativeTokenPriceUsd: number;
  };
}

/** Parses the buyer's prompt text as a RegimeShiftRequest, or null if it doesn't match. */
export function parseRegimeShiftRequest(promptText: string): RegimeShiftRequest | null {
  let obj: unknown;
  try {
    obj = JSON.parse(promptText);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (
    typeof o.ticker !== "string" ||
    typeof o.returnPct !== "number" ||
    typeof o.volatilityPct !== "number" ||
    typeof o.onChainPrice !== "number" ||
    typeof o.referencePrice !== "number" ||
    typeof o.marketStatus !== "string"
  ) {
    return null;
  }
  return o as unknown as RegimeShiftRequest;
}

/**
 * Runs the FULL deterministic pipeline for one token: spread anomaly check
 * -> regime classification -> entry gating -> off-hours sizing, and
 * OPTIONALLY the trade dry-run report (gas + slippage) if `trade` is given.
 * Returns a plain JSON-able object -- no LLM involved anywhere in here.
 */
export async function runRegimeShiftPipeline(req: RegimeShiftRequest): Promise<Record<string, unknown>> {
  const spreadPct = computeSpreadPct(req.onChainPrice, req.referencePrice);
  const anomalous = isAnomalousSpread(req.onChainPrice, req.referencePrice);

  const evaluation = evaluateToken(
    GMM_PARAMS,
    [req.returnPct, req.volatilityPct],
    spreadPct,
    anomalous,
    req.marketStatus,
    req.maxSpreadPct ?? 1.0,
  );

  const result: Record<string, unknown> = {
    ticker: req.ticker,
    spread_pct: Math.round(spreadPct * 10000) / 10000,
    is_anomalous: anomalous,
    ...evaluation,
  };

  // Technical analysis: LIVE, not cached — cheap math from real candles.
  // The entry-price suggestion is only meaningful when the deterministic
  // gate above actually says should_trade — surfacing a price target next
  // to a "don't trade" verdict is contradictory and confusing, so trend/RSI
  // are always shown, but suggested_entry_price is stripped otherwise.
  if (req.binanceChainId && req.tokenContractAddress) {
    try {
      const cfg = new BinanceConfig();
      const candles = await fetchCandles(cfg, req.binanceChainId, req.tokenContractAddress);
      const ta = computeTechnicalAnalysis(candles);
      if (!evaluation.should_trade) {
        result.technical_analysis = {
          ...ta,
          suggested_entry_price: null,
          entry_note: "No entry price suggested — the deterministic gate rejected this trade (see entry_reason / market_status above).",
        };
      } else {
        result.technical_analysis = ta;
      }
    } catch (err) {
      result.technical_analysis_error = err instanceof Error ? err.message : String(err);
    }
  }

  // Market news: CACHED (expensive to fetch), with an explicit instruction
  // for the LLM to refresh it live when the cache is stale or missing —
  // the hybrid fix for "don't trust old news blindly, but don't pay the
  // live-fetch cost on every single request either."
  const snap = getSnapshot(req.ticker);
  if (snap) {
    result.market_news = snap.snapshot.market_news;
    result.snapshot_built_at = snap.snapshot.built_at;
    result.snapshot_stale = snap.stale;
    if (snap.stale) {
      result.news_instruction =
        "This cached news is stale — call the fetch_live_news tool for this ticker before answering.";
    }
  } else {
    result.snapshot_note = "No news snapshot exists for this ticker yet.";
    result.news_instruction =
      "No cached news exists — call the fetch_live_news tool for this ticker before answering.";
  }

  // Trade dry-run is optional and makes real signed network calls -- only
  // run it when the buyer's request actually includes trade parameters, and
  // only when the deterministic gate above says the trade is worth pricing.
  if (req.trade && evaluation.should_trade) {
    try {
      const cfg = new BinanceConfig(); // reads BINANCE_API_KEY / BINANCE_API_SECRET from env
      const executor = new TradeExecutor(cfg);
      const dryRun = await executor.buildDryRunReport(
        evaluation.regime,
        req.trade.binanceChainId,
        req.trade.evmTx,
        req.trade.expectedAmount,
        req.trade.simulatedAmount,
        req.trade.nativeTokenPriceUsd,
      );
      result.dry_run = dryRun;
    } catch (err) {
      // A failed dry-run should not crash the whole delivery -- surface it
      // as data so the LLM (or the buyer, reading raw JSON) can see why.
      result.dry_run_error = err instanceof Error ? err.message : String(err);
    }
  } else if (req.trade && !evaluation.should_trade) {
    result.dry_run_skipped_reason = "Deterministic gate rejected this entry (see entry_reason / market_status)";
  }

  return result;
}
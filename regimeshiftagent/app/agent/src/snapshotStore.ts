/**
 * snapshotStore.ts
 * -----------------
 * Reads snapshots.json (built by Python's build_snapshots.py, run once a
 * day offline) and exposes it to the live agent. The live agent NEVER
 * computes technical analysis or fetches news itself -- it only reads
 * whatever was last recorded, same "compute once, serve many" pattern as
 * gmm_params.json.
 *
 * Copy snapshots.json into this same src/ folder (like gmm_params.json)
 * and re-copy it whenever you re-run build_snapshots.py.
 */

import snapshotsJson from "./snapshots.json" with { type: "json" };

export interface TechnicalAnalysis {
  trend: string;
  rsi_14: number | null;
  rsi_signal: string;
  sma_20: number | null;
  recent_high: number | null;
  recent_low: number | null;
  _placeholder?: boolean;
}

export interface MarketNews {
  summary: string;
  sentiment: string;
  source_note: string;
  _placeholder?: boolean;
}

export interface Snapshot {
  ticker: string;
  built_at: string; // ISO 8601 UTC
  technical_analysis: TechnicalAnalysis;
  market_news: MarketNews;
}

const SNAPSHOTS = snapshotsJson as unknown as Record<string, Snapshot>;
const STALE_AFTER_HOURS = 6; // shortened from 24 — news moves faster than daily-candle TA did

export function snapshotAgeHours(snapshot: Snapshot): number {
  const builtMs = Date.parse(snapshot.built_at);
  return (Date.now() - builtMs) / (1000 * 60 * 60);
}

export function isStale(snapshot: Snapshot, maxAgeHours = STALE_AFTER_HOURS): boolean {
  return snapshotAgeHours(snapshot) > maxAgeHours;
}

/**
 * Returns the ticker's snapshot plus a freshness flag, or null if no
 * snapshot has ever been built for it. Callers should surface staleness to
 * the buyer rather than silently trusting old data (same philosophy as the
 * spread-anomaly gate: don't trust suspicious/stale data quietly).
 */
export function getSnapshot(ticker: string): { snapshot: Snapshot; stale: boolean } | null {
  const snap = SNAPSHOTS[ticker];
  if (!snap) return null;
  return { snapshot: snap, stale: isStale(snap) };
}
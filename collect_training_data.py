"""
collect_training_data.py
--------------------------
Collects REAL [return_pct, volatility_pct] samples across many tokens, using
your already-tested Phase 1 code (data_ingestion.py), to train the GMM
regime classifier on real market data instead of the synthetic placeholder.

For each selected ticker:
  1. Pull its raw RWA token entry (has binanceChainId + tokenContractAddress)
  2. Fetch recent daily candles for that token's chain/contract
  3. Compute a rolling volatility (stdev of daily returns, %) over a window
  4. For each day, pair that day's return_pct with the current window's
     volatility_pct -> one training sample

Output: real_features.json, a flat list of [return_pct, volatility_pct]
pairs, ready to be loaded by export_gmm_params.py's load_training_features().

Usage:
    export BINANCE_API_KEY="..."
    export BINANCE_API_SECRET="..."
    python collect_training_data.py --tab-id 4 --limit-candles 60 --window 7 --out real_features.json

Tip on ticker variety: for a meaningful 3-cluster fit (Risk-On / Defensive /
Crisis) you want tokens/periods spanning calm AND choppy behavior, not just
mega-cap tech. Mixing in a few historically higher-volatility names (e.g.
leveraged ETFs like SOXS/SQQQ, small-cap miners like HIVE/MARA alongside
large defensive names) gives the GMM real separation to find, instead of
one big blob.
"""

import argparse
import json
import statistics
import sys
import time

import requests

from config import BinanceConfig
from data_ingestion import DataIngestion, DataIngestionError


def rolling_volatility(returns: list, window: int, end_idx: int) -> float:
    """Stdev (%) of the `window` returns ending at end_idx (inclusive)."""
    start_idx = max(0, end_idx - window + 1)
    chunk = returns[start_idx:end_idx + 1]
    if len(chunk) < 2:
        return None
    return round(statistics.stdev(chunk), 4)


def collect_for_ticker(ingestion: DataIngestion, chain_id: str, contract_address: str,
                        limit_candles: int, window: int, max_abs_return_pct: float) -> tuple:
    """
    Returns (samples, n_outliers_dropped) for one token.

    max_abs_return_pct: any single-day |return_pct| beyond this is treated as
    a data glitch (candle gap, stock-split-like scale jump -- the same class
    of issue Phase 1 found in the RWA spread data) rather than a real market
    move, and DROPPED before it can poison the rolling volatility or the
    GMM fit. Real single-day equity/ETF moves essentially never exceed this
    (even historic crash days are typically single-digit-to-teens %).
    """
    candles = ingestion.fetch_candles(
        binance_chain_id=chain_id,
        token_contract_address=contract_address,
        bar="1d",
        limit=limit_candles,
    )
    closes = [c["close"] for c in candles]
    if len(closes) < window + 2:
        return [], 0  # not enough history for even one rolling window

    raw_returns = [
        round((closes[i] - closes[i - 1]) / closes[i - 1] * 100, 4)
        for i in range(1, len(closes))
        if closes[i - 1] != 0
    ]

    # Drop glitch days, but KEEP the sequence otherwise contiguous for the
    # rolling-volatility calc (a dropped day just isn't a window member).
    daily_returns = [r for r in raw_returns if abs(r) <= max_abs_return_pct]
    n_outliers = len(raw_returns) - len(daily_returns)

    samples = []
    for i in range(window - 1, len(daily_returns)):
        vol = rolling_volatility(daily_returns, window, i)
        if vol is None:
            continue
        samples.append([daily_returns[i], vol])
    return samples, n_outliers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tab-id", type=int, default=4, help="RWA sector tab (4=AI Chips)")
    parser.add_argument("--platform-id", default="ondo")
    parser.add_argument("--limit-candles", type=int, default=60, help="days of history per token")
    parser.add_argument("--window", type=int, default=7, help="rolling volatility window, days")
    parser.add_argument("--max-tokens", type=int, default=30, help="cap how many tokens to pull candles for (rate-limit friendly)")
    parser.add_argument("--max-abs-return-pct", type=float, default=50.0,
                         help="drop any single-day |return_pct| beyond this as a data glitch (candle gap / scale jump), not a real move")
    parser.add_argument("--out", default="real_features.json")
    args = parser.parse_args()

    cfg = BinanceConfig()
    session = requests.Session()
    ingestion = DataIngestion(cfg, session)

    print(f"Fetching RWA token list (tab_id={args.tab_id})...")
    raw_tokens = ingestion.fetch_rwa_tokens(platform_id=args.platform_id, tab_id=args.tab_id)
    print(f"  got {len(raw_tokens)} tokens")

    all_features = []
    used_tickers = []
    skipped = []
    total_outliers = 0

    for token in raw_tokens[: args.max_tokens]:
        ticker = token.get("underlyingTicker", "?")
        chain_id = token.get("binanceChainId")
        contract = token.get("tokenContractAddress")
        if not chain_id or not contract:
            skipped.append((ticker, "missing chain_id/contract"))
            continue
        try:
            samples, n_outliers = collect_for_ticker(
                ingestion, chain_id, contract, args.limit_candles, args.window, args.max_abs_return_pct
            )
            total_outliers += n_outliers
            if not samples:
                skipped.append((ticker, "not enough candle history"))
                continue
            all_features.extend(samples)
            used_tickers.append(ticker)
            outlier_note = f" ({n_outliers} outlier day(s) dropped)" if n_outliers else ""
            print(f"  {ticker}: +{len(samples)} samples{outlier_note}")
        except DataIngestionError as e:
            skipped.append((ticker, str(e)))
            print(f"  {ticker}: SKIPPED ({e})")
        time.sleep(0.2)  # be polite to the API, avoid rate limits

    print(f"\nTotal samples collected: {len(all_features)} from {len(used_tickers)} tickers")
    if total_outliers:
        print(f"Dropped {total_outliers} outlier day(s) total (|return_pct| > {args.max_abs_return_pct}%, "
              f"likely candle gaps / data glitches, same class of issue as the Phase 1 spread anomalies)")
    if skipped:
        print(f"Skipped {len(skipped)} tokens (see below)")
        for t, reason in skipped[:10]:
            print(f"  - {t}: {reason}")

    if len(all_features) < 6:
        print("\nWARNING: fewer than 6 samples total -- GMM needs at least n_regimes*2=6 "
              "to fit at all, and far more (dozens+) for a meaningful fit. "
              "Try a larger --tab-id universe, more --max-tokens, or more --limit-candles.")

    with open(args.out, "w") as f:
        json.dump({"features": all_features, "tickers_used": used_tickers}, f, indent=2)
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
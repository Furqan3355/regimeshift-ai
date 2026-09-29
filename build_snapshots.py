"""
build_snapshots.py
---------------------
Run this ONCE PER DAY (manually now, or via Windows Task Scheduler / cron
later) to refresh the TA + news snapshot for each ticker you care about.
Live buyer requests never call this directly -- they just read whatever
snapshots.json already has (see regimeShiftBridge.ts / snapshotStore.ts on
the TS side).

Usage:
    python build_snapshots.py --tickers NVDA AAPL TSLA MSFT
"""

import argparse

import requests

from config import BinanceConfig
from data_ingestion import DataIngestion, DataIngestionError
from technical_analysis import compute_technical_analysis
from market_news import fetch_market_news_summary
from snapshot_store import load_snapshots, save_snapshots, build_snapshot, DEFAULT_SNAPSHOT_PATH


def find_token_raw(ingestion: DataIngestion, ticker: str, platform_id: str, tab_id: int) -> dict | None:
    """Looks up one ticker's raw RWA token entry (for its chain_id/contract)."""
    raw_tokens = ingestion.fetch_rwa_tokens(platform_id=platform_id, tab_id=tab_id)
    for token in raw_tokens:
        if token.get("underlyingTicker") == ticker:
            return token
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tickers", nargs="+", required=True, help="e.g. --tickers NVDA AAPL TSLA")
    parser.add_argument("--tab-id", type=int, default=4)
    parser.add_argument("--platform-id", default="ondo")
    parser.add_argument("--limit-candles", type=int, default=30)
    parser.add_argument("--out", default=DEFAULT_SNAPSHOT_PATH)
    args = parser.parse_args()

    cfg = BinanceConfig()
    session = requests.Session()
    ingestion = DataIngestion(cfg, session)

    snapshots = load_snapshots(args.out)

    for ticker in args.tickers:
        print(f"Building snapshot for {ticker}...")
        raw = find_token_raw(ingestion, ticker, args.platform_id, args.tab_id)
        if raw is None:
            print(f"  SKIPPED: {ticker} not found in tab_id={args.tab_id}")
            continue

        try:
            candles = ingestion.fetch_candles(
                binance_chain_id=raw["binanceChainId"],
                token_contract_address=raw["tokenContractAddress"],
                bar="1d",
                limit=args.limit_candles,
            )
        except DataIngestionError as e:
            print(f"  SKIPPED: candle fetch failed ({e})")
            continue

        ta = compute_technical_analysis(candles)
        news = fetch_market_news_summary(ticker)
        snapshots[ticker] = build_snapshot(ticker, ta, news)
        print(f"  done (TA + news placeholders recorded)")

    save_snapshots(snapshots, args.out)
    print(f"\nWrote {len(snapshots)} snapshot(s) to {args.out}")


if __name__ == "__main__":
    main()
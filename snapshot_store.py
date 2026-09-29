"""
snapshot_store.py
-------------------
The "record once, don't recompute every request" layer the user asked for.

WHY THIS EXISTS: technical analysis (moving averages, RSI) and market news
summaries don't meaningfully change minute-to-minute -- they're based on
daily candles and daily news cycles. Computing them fresh on every buyer
request would be slow, wasteful, and (for the LLM-summarized news part)
could give a slightly different answer every time it's asked, which is bad
for a supposedly-fixed daily read.

Instead: a snapshot is built ONCE per ticker (via build_snapshots.py, run
manually or on a schedule -- e.g. once a day), saved to snapshots.json with a
timestamp, and every live buyer request just READS that saved snapshot
instead of recomputing it. This is the same "compute once, serve many times"
pattern as gmm_params.json (GMM is trained once, the live agent only does
inference).

Snapshot schema (per ticker):
{
  "ticker": "NVDA",
  "built_at": "2026-09-27T10:15:00Z",
  "technical_analysis": {
    "trend": "uptrend" | "downtrend" | "sideways",
    "rsi_14": 62.3,
    "rsi_signal": "neutral" | "overbought" | "oversold",
    "sma_20": 118.4,
    "recent_high": 121.0,
    "recent_low": 112.3
  },
  "market_news": {
    "summary": "...",           # 2-3 sentence plain-English summary
    "sentiment": "positive" | "neutral" | "negative",
    "source_note": "..."        # where this came from, for transparency
  }
}

STATUS: technical_analysis.compute_technical_analysis() and
market_news.fetch_market_news_summary() are separate modules you plug in
next -- this file only defines the STORE (save/load/freshness), so the
snapshot pipeline runs end-to-end today with placeholder data, and swapping
in the real TA/news logic later requires zero changes here.
"""

import json
import os
from datetime import datetime, timezone

DEFAULT_SNAPSHOT_PATH = "snapshots.json"
STALE_AFTER_HOURS = 24  # a snapshot older than this is flagged stale, not silently trusted


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_snapshots(path: str = DEFAULT_SNAPSHOT_PATH) -> dict:
    """Returns {ticker: snapshot_dict}. Empty dict if the file doesn't exist yet."""
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def save_snapshots(snapshots: dict, path: str = DEFAULT_SNAPSHOT_PATH) -> None:
    with open(path, "w") as f:
        json.dump(snapshots, f, indent=2)


def build_snapshot(ticker: str, technical_analysis: dict, market_news: dict) -> dict:
    """Assembles one ticker's snapshot record with a fresh timestamp."""
    return {
        "ticker": ticker,
        "built_at": utc_now_iso(),
        "technical_analysis": technical_analysis,
        "market_news": market_news,
    }


def snapshot_age_hours(snapshot: dict) -> float:
    built = datetime.strptime(snapshot["built_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - built).total_seconds() / 3600.0


def is_stale(snapshot: dict, max_age_hours: float = STALE_AFTER_HOURS) -> bool:
    return snapshot_age_hours(snapshot) > max_age_hours
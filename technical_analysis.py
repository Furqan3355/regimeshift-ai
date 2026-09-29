"""
technical_analysis.py
------------------------
PLACEHOLDER MODULE -- plug real indicator math into compute_technical_analysis()
next. Kept separate from snapshot_store.py so this can be built out
independently (moving averages, RSI, etc.) without touching the caching
architecture at all.

When you're ready to implement this for real, it'll use candles from
data_ingestion.DataIngestion.fetch_candles() (already built, Phase 1) --
same candle data collect_training_data.py already pulls.
"""


def compute_technical_analysis(candles: list) -> dict:
    """
    PLACEHOLDER. candles: list of {"close": float, ...} dicts, same shape
    fetch_candles() returns, oldest-first.

    Real implementation (not yet written) should compute:
      - trend: compare current close to SMA(20) -> "uptrend"/"downtrend"/"sideways"
      - rsi_14: standard 14-period RSI from daily closes
      - rsi_signal: "overbought" (RSI>70) / "oversold" (RSI<30) / "neutral"
      - sma_20: the 20-day simple moving average itself
      - recent_high / recent_low: max/min close over the same window
    """
    return {
        "trend": "not_implemented",
        "rsi_14": None,
        "rsi_signal": "not_implemented",
        "sma_20": None,
        "recent_high": None,
        "recent_low": None,
        "_placeholder": True,
    }
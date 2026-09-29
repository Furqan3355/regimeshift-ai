"""
market_news.py
-----------------
REAL implementation using Finnhub's free company-news endpoint
(https://finnhub.io/docs/api/company-news). Free tier: 60 req/min, ~1 year
of history, North American tickers only (fine -- this project's universe is
US-listed tokenized equities).

Deliberately does NOT try to compute a sentiment score ourselves -- Finnhub's
own sentiment endpoint is a paid feature, and hand-rolling sentiment
scoring is unreliable. Instead this returns the raw recent headlines, and
the delivery LLM (in unifiedMain.ts's buildRunWork) reads them and
characterizes the tone itself as part of its plain-English explanation --
no extra paid dependency needed.

Requires: FINNHUB_API_KEY environment variable (free signup at finnhub.io).
"""

import os
from datetime import datetime, timedelta

import requests

FINNHUB_BASE = "https://finnhub.io/api/v1"


def fetch_market_news_summary(ticker: str, days_back: int = 7, max_headlines: int = 5) -> dict:
    api_key = os.environ.get("FINNHUB_API_KEY")
    if not api_key:
        return {
            "summary": "FINNHUB_API_KEY not set -- news unavailable.",
            "sentiment": "unavailable",
            "source_note": "Set FINNHUB_API_KEY (free signup at finnhub.io) to enable this.",
        }

    to_date = datetime.utcnow().date()
    from_date = to_date - timedelta(days=days_back)

    resp = requests.get(
        f"{FINNHUB_BASE}/company-news",
        params={
            "symbol": ticker,
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "token": api_key,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        return {
            "summary": f"News fetch failed (HTTP {resp.status_code}).",
            "sentiment": "unavailable",
            "source_note": f"Finnhub company-news, {resp.status_code} error",
        }

    articles = resp.json()
    if not articles:
        return {
            "summary": f"No recent news found for {ticker} in the last {days_back} days.",
            "sentiment": "no_data",
            "source_note": f"Finnhub company-news, {from_date} to {to_date}",
        }

    headlines = [a["headline"] for a in articles[:max_headlines] if a.get("headline")]
    summary = " | ".join(headlines)

    return {
        "summary": summary,
        # Deliberately not scored here -- the delivery LLM reads these
        # headlines and characterizes tone itself, see module docstring.
        "sentiment": "unscored — LLM reads headlines directly",
        "source_note": f"Finnhub company-news, {len(articles)} article(s) found, {from_date} to {to_date}",
    }
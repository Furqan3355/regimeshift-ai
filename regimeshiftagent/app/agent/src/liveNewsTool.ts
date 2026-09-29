/**
 * liveNewsTool.ts
 * -----------------
 * The "wait for fresh news if the cache is stale" piece. This is a
 * Vercel-AI-SDK tool the LLM can call DURING delivery (buildRunWork's
 * generateText call), but only when it's actually needed:
 *
 *   - Cached news fresh (< STALE_AFTER_HOURS old)  -> LLM uses the cached
 *     summary from the pipeline result directly. Fast, no extra call.
 *   - Cached news stale or missing                 -> the pipeline result
 *     includes an explicit instruction telling the LLM to call
 *     `fetch_live_news` before answering, so a buyer never silently gets
 *     news that might already be outdated by a big headline.
 *
 * This keeps the common case cheap (cache hit) while still guaranteeing
 * freshness on the rare case that matters (cache miss/stale) -- exactly the
 * tradeoff requested: don't blindly trust a stale snapshot, but don't pay
 * the cost of a live fetch on every single request either.
 *
 * STATUS: fetchLiveNews() itself is still a PLACEHOLDER (same as
 * market_news.py's fetch_market_news_summary()) -- wire in a real news
 * source here. The tool-calling plumbing around it is real and ready.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * REAL implementation using Finnhub's free company-news endpoint. Requires
 * FINNHUB_API_KEY in the agent's environment/secrets (same free signup used
 * by market_news.py's offline snapshot builder -- one key, two call sites).
 * No HMAC signing needed here, Finnhub just takes the key as a query param.
 */
async function fetchLiveNews(ticker: string): Promise<{ summary: string; sentiment: string }> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return { summary: "FINNHUB_API_KEY not set — live news unavailable.", sentiment: "unavailable" };
  }

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${fmt(from)}&to=${fmt(to)}&token=${apiKey}`;
  const resp = await fetch(url);
  if (resp.status !== 200) {
    return { summary: `Live news fetch failed (HTTP ${resp.status}).`, sentiment: "unavailable" };
  }
  const articles = (await resp.json()) as Array<{ headline?: string }>;
  if (!articles.length) {
    return { summary: `No recent news found for ${ticker} in the last 7 days.`, sentiment: "no_data" };
  }
  const headlines = articles.slice(0, 5).map((a) => a.headline).filter(Boolean);
  return {
    summary: headlines.join(" | "),
    sentiment: "unscored — read the headlines and characterize the tone yourself",
  };
}

export const LIVE_NEWS_TOOL = {
  fetch_live_news: tool({
    description:
      "Fetches a FRESH news summary for a ticker right now, bypassing the cache. " +
      "Only call this when the pipeline result's market_news is marked snapshot_stale=true " +
      "or snapshot_note says no snapshot exists yet. If the cached news is already fresh, " +
      "do NOT call this tool -- just use the cached market_news from the pipeline result.",
    inputSchema: z.object({
      ticker: z.string().describe("The ticker to fetch fresh news for, e.g. NVDA"),
    }),
    execute: async ({ ticker }: { ticker: string }) => fetchLiveNews(ticker),
  }),
};
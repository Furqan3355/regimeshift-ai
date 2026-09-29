/**
 * lib.mjs — core of the local live-data proxy.
 *
 * WHY THIS EXISTS: the dashboard is a browser page, and a browser page must
 * never hold BINANCE_API_SECRET (anyone can View Source). So the page talks
 * to THIS small server instead; the server signs the Binance requests and
 * returns only derived, public market data. The secret never leaves this
 * process.
 *
 * Zero dependencies (Node 18+: global fetch + built-in crypto).
 */

import { createHmac } from "node:crypto";

const BASE = "https://web3.binance.com/build";
const PREFIX = "/build"; // required in BOTH the URL and the signed path

// ---------- signing (same scheme as config.py / binanceConfig.ts) ----------
export function signRequest(apiKey, apiSecret, method, path, params, body = "", now = new Date()) {
  const qs =
    params && Object.keys(params).length
      ? "?" + Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")
      : "";
  const timestamp = now.toISOString(); // ISO 8601 with milliseconds
  const preHash = timestamp + method.toUpperCase() + PREFIX + path + qs + body;
  const signature = createHmac("sha256", apiSecret).update(preHash, "utf8").digest("base64");
  return {
    url: BASE + path + qs,
    headers: { "X-OC-APIKEY": apiKey, "X-OC-TIMESTAMP": timestamp, "X-OC-SIGN": signature, "Content-Type": "application/json" },
  };
}

// ---------- math (mirrors data_ingestion.py / collect_training_data.py) ----------
const stdev = (xs) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); // sample stdev, like statistics.stdev
};
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const ch = closes.slice(1).map((c, i) => c - closes[i]);
  let g = 0, l = 0;
  for (let i = 0; i < period; i++) (ch[i] > 0 ? (g += ch[i]) : (l -= ch[i]));
  g /= period; l /= period;
  for (let i = period; i < ch.length; i++) {
    g = (g * (period - 1) + Math.max(ch[i], 0)) / period;
    l = (l * (period - 1) + Math.max(-ch[i], 0)) / period;
  }
  return l === 0 ? 100 : round(100 - 100 / (1 + g / l), 2);
}

/**
 * closes: ascending by time. Returns the two GMM features EXACTLY as they were
 * built for training (last daily return %, stdev of the last 7 daily returns %,
 * after dropping >50% glitch days) plus the technical-analysis fields.
 */
export function analyzeCloses(closes) {
  const raw = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1] !== 0) raw.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
  const rets = raw.filter((r) => Math.abs(r) <= 50);
  if (rets.length < 8) return { error: "not enough candle history" };

  const sma20 = closes.length >= 20 ? round(closes.slice(-20).reduce((a, b) => a + b, 0) / 20) : null;
  const last = closes.at(-1);
  let trend = "sideways";
  if (sma20) { const d = ((last - sma20) / sma20) * 100; trend = d > 1 ? "uptrend" : d < -1 ? "downtrend" : "sideways"; }
  const win = closes.slice(-20);
  return {
    ret: round(rets.at(-1)),
    vol: round(stdev(rets.slice(-7))),
    outliersDropped: raw.length - rets.length,
    lastClose: last,
    ta: { trend, rsi: rsi(closes), sma: sma20, low: Math.min(...win), high: Math.max(...win) },
  };
}

// ---------- handlers ----------
export function createHandlers({ env, fetchImpl = fetch, now = () => Date.now() }) {
  const cache = new Map();
  const cached = async (key, ttlMs, fn) => {
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await fn();
    cache.set(key, { at: now(), value });
    return value;
  };

  async function upstream(path, params) {
    const s = signRequest(env.BINANCE_API_KEY, env.BINANCE_API_SECRET, "GET", path, params);
    const resp = await fetchImpl(s.url, { headers: s.headers });
    if (resp.status !== 200) throw new Error(`Binance HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const body = await resp.json();
    if (Number(body.code) !== 0) throw new Error(`Binance error ${body.code}: ${body.msg}`);
    return body.data;
  }

  // One signed call returns on-chain price + reference price + market status for every token.
  const tokenMap = () =>
    cached("tokens", 10_000, async () => {
      const list = await upstream("/api/v1/dex/market/rwa/tokens", { platformId: "ondo", tabId: 4 });
      const m = {};
      for (const t of list) m[t.underlyingTicker] = t;
      return m;
    });

  return {
    async prices(tickers) {
      const m = await tokenMap();
      const prices = {};
      for (const tk of tickers) {
        const t = m[tk];
        if (!t) { prices[tk] = { error: "ticker not in RWA list" }; continue; }
        const onp = Number(t.tokenPrice), refp = Number(t.referencePrice);
        prices[tk] = {
          onp, refp,
          spreadPct: round(((onp - refp) / refp) * 100),
          marketStatus: t.statusInfo?.marketStatus ?? "unknown",
        };
      }
      return { fetchedAt: now(), prices };
    },

    async analysis(ticker) {
      const m = await tokenMap();
      const t = m[ticker];
      if (!t) throw new Error("ticker not in RWA list");
      return cached(`an:${ticker}`, 5 * 60_000, async () => {
        const raw = await upstream("/api/v1/dex/market/candles", {
          binanceChainId: t.binanceChainId, tokenContractAddress: t.tokenContractAddress, bar: "1d", limit: 30,
        });
        // [open, high, low, close, volume, timestamp_ms, tradeCount] — sort by time so ordering never matters
        const closes = raw.slice().sort((a, b) => Number(a[5]) - Number(b[5])).map((c) => Number(c[3]));
        return { ticker, ...analyzeCloses(closes) };
      });
    },

    async news(ticker) {
      const key = env.FINNHUB_API_KEY;
      if (!key) return { ticker, news: null, note: "FINNHUB_API_KEY not set on the proxy" };
      return cached(`news:${ticker}`, 10 * 60_000, async () => {
        const to = new Date(now()), from = new Date(now() - 7 * 86400_000);
        const f = (d) => d.toISOString().slice(0, 10);
        const r = await fetchImpl(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${f(from)}&to=${f(to)}&token=${key}`);
        if (r.status !== 200) return { ticker, news: null, note: `Finnhub HTTP ${r.status}` };
        const arts = await r.json();
        const heads = arts.slice(0, 5).map((a) => a.headline).filter(Boolean);
        return { ticker, news: heads.length ? heads.join(" | ") : null, note: heads.length ? undefined : "no recent headlines" };
      });
    },
  };
}

/**
 * Public Ondo tokenized-stock prices from CoinGecko.
 * Used when the Binance RWA API refuses this host. No API key.
 * onp and refp are the same CoinGecko print, so the spread check stays quiet.
 */

export const ONDO_IDS = {
  NVDA: "nvidia-ondo-tokenized-stock",
  AAPL: "apple-ondo-tokenized-stock",
  MSFT: "microsoft-ondo-tokenized-stock",
  GOOGL: "alphabet-class-a-ondo-tokenized-stock",
  AMZN: "amazon-ondo-tokenized-stock",
  META: "meta-platforms-ondo-tokenized-stock",
  TSLA: "tesla-ondo-tokenized-stock",
  AMD: "amd-ondo-tokenized-stock",
  COIN: "coinbase-ondo-tokenized-stock",
  MARA: "mara-holdings-ondo-tokenized-stock",
  SOXL: "direxion-daily-semi-bull-3x-etf-ondo-tokenized",
  TQQQ: "proshares-ultrapro-qqq-ondo-tokenized",
  PYPL: "paypal-ondo-tokenized-stock",
  ABNB: "airbnb-ondo-tokenized-stock",
  NFLX: "netflix-ondo-tokenized-stock",
};

/** US cash-session label so the advisor still waits when New York is closed. */
export function marketStatus(nowMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  return "offhours";
}

/** Last price of each UTC day, ascending. CoinGecko's 30-day chart is hourly. */
export function dailyCloses(points) {
  const byDay = new Map();
  for (const pair of points || []) {
    const ts = Number(pair[0]);
    const px = Number(pair[1]);
    if (!Number.isFinite(ts) || !Number.isFinite(px) || px <= 0) continue;
    byDay.set(new Date(ts).toISOString().slice(0, 10), { t: ts, close: px });
  }
  return [...byDay.values()];
}

async function getJson(fetchImpl, url) {
  const resp = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (resp.status !== 200) throw new Error(`CoinGecko HTTP ${resp.status}`);
  return resp.json();
}

export async function fetchCoinGeckoPrices(tickers, { fetchImpl, now }) {
  const ids = [...new Set(tickers.map((t) => ONDO_IDS[t]).filter(Boolean))];
  const body = ids.length
    ? await getJson(fetchImpl, `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${ids.join(",")}`)
    : {};
  const mkt = marketStatus(now());
  const prices = {};
  for (const tk of tickers) {
    const usd = Number(body[ONDO_IDS[tk]]?.usd);
    if (!ONDO_IDS[tk] || !Number.isFinite(usd) || usd <= 0) {
      prices[tk] = { error: "ticker not on CoinGecko" };
      continue;
    }
    prices[tk] = { onp: usd, refp: usd, spreadPct: 0, marketStatus: mkt };
  }
  return { fetchedAt: now(), source: "coingecko", prices };
}

export async function fetchCoinGeckoSeries(ticker, { fetchImpl }) {
  const id = ONDO_IDS[ticker];
  if (!id) throw new Error("ticker not on CoinGecko");
  const body = await getJson(
    fetchImpl,
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=30`,
  );
  const history = dailyCloses(body.prices);
  return { history, closes: history.map((d) => d.close) };
}

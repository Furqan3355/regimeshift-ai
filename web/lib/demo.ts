import type { TickerData } from "./types";

/**
 * Illustrative numbers used when the local proxy is not reachable (DEMO mode).
 * NFLX deliberately has a 10x on-chain price to show the glitch detector.
 */
export const DEMO: Record<string, TickerData> = {
  NVDA: { ret: 0.3, vol: 1.9, onp: 118.96, refp: 118.96, mkt: "regular", ta: { trend: "uptrend", rsi: 58, sma: 117.8, low: 114.2 }, news: "Nvidia data-center demand remains strong into next quarter | Analysts raise price targets on AI chip orders" },
  AAPL: { ret: 0.1, vol: 1.4, onp: 232.1, refp: 232.1, mkt: "regular", ta: { trend: "sideways", rsi: 51, sma: 231.4, low: 226.8 }, news: "Apple services revenue steady, hardware growth modest | No major catalysts this week" },
  MSFT: { ret: 0.05, vol: 1.2, onp: 441.3, refp: 441.3, mkt: "closed", ta: { trend: "sideways", rsi: 50, sma: 440.9, low: 433.1 }, news: "Quiet news cycle for Microsoft this week" },
  GOOGL: { ret: 0.2, vol: 1.6, onp: 172.4, refp: 172.4, mkt: "regular", ta: { trend: "uptrend", rsi: 56, sma: 170.1, low: 165.9 }, news: "Google Cloud growth beats expectations | Search ad revenue stable" },
  AMZN: { ret: -0.1, vol: 1.8, onp: 214.3, refp: 213.8, mkt: "regular", ta: { trend: "sideways", rsi: 49, sma: 215.0, low: 207.6 }, news: "AWS margins in focus ahead of earnings" },
  META: { ret: 0.4, vol: 2.1, onp: 612.5, refp: 612.5, mkt: "regular", ta: { trend: "uptrend", rsi: 61, sma: 601.2, low: 585.4 }, news: "Meta ad pricing firms up | AI infrastructure spend under scrutiny" },
  TSLA: { ret: -0.6, vol: 4.3, onp: 248.55, refp: 246.9, mkt: "regular", ta: { trend: "downtrend", rsi: 38, sma: 252.1, low: 241.3 }, news: "Tesla delivery numbers below estimates | Price cuts reported in key markets" },
  AMD: { ret: 0.5, vol: 2.7, onp: 161.2, refp: 161.2, mkt: "regular", ta: { trend: "uptrend", rsi: 60, sma: 157.4, low: 150.1 }, news: "AMD data-center chip roadmap well received" },
  COIN: { ret: 1.2, vol: 6.8, onp: 305.4, refp: 304.1, mkt: "regular", ta: { trend: "uptrend", rsi: 63, sma: 288.9, low: 271.2 }, news: "Coinbase trading volumes climb with crypto rally" },
  MARA: { ret: 1.8, vol: 9.5, onp: 12.52, refp: 12.5, mkt: "offhours", ta: { trend: "uptrend", rsi: 64, sma: 11.9, low: 10.85 }, news: "Bitcoin miners rally as BTC price recovers" },
  SOXL: { ret: -2.1, vol: 11.8, onp: 31.2, refp: 31.4, mkt: "regular", ta: { trend: "downtrend", rsi: 29, sma: 33.6, low: 29.8 }, news: "Semiconductor sector under pressure amid export-rule uncertainty" },
  TQQQ: { ret: 0.9, vol: 5.4, onp: 88.4, refp: 88.4, mkt: "regular", ta: { trend: "uptrend", rsi: 59, sma: 85.1, low: 80.3 }, news: "Tech-heavy rally lifts leveraged Nasdaq funds" },
  PYPL: { ret: 0.1, vol: 1.9, onp: 78.2, refp: 78.2, mkt: "closed", ta: { trend: "sideways", rsi: 48, sma: 78.6, low: 74.9 }, news: "PayPal checkout volumes flat this quarter" },
  ABNB: { ret: -0.4, vol: 2.6, onp: 132.1, refp: 131.5, mkt: "regular", ta: { trend: "downtrend", rsi: 42, sma: 135.8, low: 127.3 }, news: "Airbnb booking growth slows in key markets" },
  NFLX: { ret: 0.2, vol: 2.0, onp: 7116.5, refp: 711.65, mkt: "regular", ta: { trend: "sideways", rsi: 53, sma: 708.2, low: 695.4 }, news: "Netflix subscriber growth in line with expectations" },
};

/** Same watchlist as proxy/bot.mjs WATCHLIST. */
export const TICKERS = Object.keys(DEMO);

export const demoPrices = (): Record<string, number> =>
  Object.fromEntries(TICKERS.map((t) => [t, DEMO[t].onp]));

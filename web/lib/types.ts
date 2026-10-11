export type MarketStatus = "regular" | "offhours" | "closed";
export type VerdictKind = "buy" | "wait" | "skip";
export type Regime = "Risk-On" | "Defensive" | "Crisis";
export type NewsLevel = "clear" | "caution" | "serious";

export interface Technicals {
  trend: string;
  rsi: number | string | null;
  sma: number | null;
  low: number;
  high?: number;
}

/** Everything decide() needs for one ticker (same shape as the old dashboard's getD()). */
export interface TickerData {
  ret: number;
  vol: number;
  onp: number;
  refp: number;
  mkt: MarketStatus;
  ta: Technicals;
  /** Headlines joined by " | ". Empty when there are none. */
  news: string;
}

export interface NewsCheck {
  level: NewsLevel;
  trigger: string | null;
  headline: string | null;
}

export interface Trigger {
  level: VerdictKind;
  code: string;
  text: string;
}

/** Return value of proxy/verdict.mjs decide(). */
export interface Verdict {
  ticker: string;
  verdict: VerdictKind;
  size: number;
  caution: boolean;
  regime: Regime;
  conf: number;
  spreadPct: number;
  anomalous: boolean;
  market: MarketStatus;
  marketLabel: string;
  news: NewsCheck;
  triggers: Trigger[];
  reasons: string[];
  entry: { price: number; note: string } | null;
}

/** One row of /api/prices. */
export interface Quote {
  onp?: number;
  refp?: number;
  spreadPct?: number;
  marketStatus?: string;
  error?: string;
}

export interface PricesResponse {
  fetchedAt: number;
  source?: "binance" | "coingecko";
  prices: Record<string, Quote>;
}

/** One daily close from /api/analysis history (timestamp in ms). */
export interface PricePoint {
  t: number;
  close: number;
}

export interface AnalysisResponse {
  ticker: string;
  history?: PricePoint[];
  ret?: number;
  vol?: number;
  error?: string;
  ta: { trend: string; rsi: number | null; sma: number | null; low: number; high: number };
}

export interface NewsResponse {
  ticker: string;
  news: string | null;
  note?: string;
}

export interface Holding {
  qty: number;
  costBasis: number;
}

export interface TradeLogEntry {
  t: string;
  text: string;
}

export interface BotPosition {
  ticker: string;
  qty: number;
  entry: number;
  price: number;
  pnlPct: number;
  openedAt: number;
}

export interface BotClosedTrade {
  ticker: string;
  entry: number;
  exit: number;
  qty: number;
  pnlPct: number;
  pnlUsd: number;
  openedAt: number;
  closedAt: number;
  exitReason: string;
}

export interface BotLogEntry {
  t: number;
  kind: "buy" | "sell" | "skip" | "error";
  ticker: string;
  text: string;
}

/** Return value of /api/bot (bot.mjs snapshot()). */
export interface BotSnapshot {
  cash: number;
  equity: number;
  startCash: number;
  positions: BotPosition[];
  closedCount: number;
  closed: BotClosedTrade[];
  log: BotLogEntry[];
  lastTick: number | null;
  ticks: number;
}

/**
 * bot.mjs — autonomous PAPER trading bot (server-side). v1: scan -> decide() -> buy/sell -> reasoned log.
 * Rules: data is real, trades are virtual. No LLM. Same decide() as the dashboard, so the bot
 * can never be more aggressive than the Advisor.
 */
import fs from "node:fs/promises";
import { decide } from "./verdict.mjs";

export const WATCHLIST = ["NVDA","AAPL","MSFT","GOOGL","AMZN","META","TSLA","AMD","COIN","MARA","SOXL","TQQQ","PYPL","ABNB","NFLX"];

export const DEFAULTS = {
  startCash: 10_000,
  baseBuyUsd: 50,      // each buy = baseBuyUsd x verdict size
  stopLossPct: -5,
  takeProfitPct: 8,
  maxPositions: 5,
  exitOnWait: false,   // "wait" (e.g. market closed overnight) = hold; only "skip" forces an exit
  cooldownMs: 60 * 60_000, // no re-buy of a ticker for 1h after selling it (stops sell-then-rebuy churn)
  maxLog: 300,
};

// same mapping as the dashboard: anything unknown = closed (safe default)
export function mapStatus(s) {
  s = (s || "").toLowerCase();
  if (s === "regular" || s === "open") return "regular";
  if (["premarket", "postmarket", "overnight", "offhours", "extended"].includes(s)) return "offhours";
  return "closed";
}

const r2 = (x) => Math.round(x * 100) / 100;

export function freshState(cfg = DEFAULTS) {
  return { cash: cfg.startCash, positions: {}, closed: [], log: [], lastTick: null, ticks: 0 };
}

export function createBot({ handlers, statePath = null, cfg: over = {}, now = () => Date.now(), tickers = WATCHLIST }) {
  const cfg = { ...DEFAULTS, ...over };
  let state = freshState(cfg);

  const log = (kind, ticker, text, extra = {}) => {
    state.log.unshift({ t: now(), kind, ticker, text, ...extra });
    if (state.log.length > cfg.maxLog) state.log.length = cfg.maxLog;
  };

  async function load() {
    if (!statePath) return;
    try { state = { ...freshState(cfg), ...JSON.parse(await fs.readFile(statePath, "utf8")) }; } catch { /* first run */ }
  }
  async function save() {
    if (!statePath) return;
    const tmp = statePath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(state, null, 1));
    await fs.rename(tmp, statePath);
  }

  const equity = (prices) =>
    state.cash + Object.entries(state.positions).reduce((s, [tk, p]) => s + p.qty * (prices[tk]?.onp ?? p.entry), 0);

  function sell(tk, price, why) {
    const p = state.positions[tk];
    const proceeds = p.qty * price;
    state.cash += proceeds;
    const pnlPct = r2(((price - p.entry) / p.entry) * 100);
    state.closed.push({ ticker: tk, entry: p.entry, exit: price, qty: p.qty, pnlPct, pnlUsd: r2(proceeds - p.qty * p.entry),
      openedAt: p.openedAt, closedAt: now(), exitReason: why, features: p.features });
    delete state.positions[tk];
    log("sell", tk, `${tk} becha @ $${price} (${pnlPct >= 0 ? "+" : ""}${pnlPct}%): ${why}`);
  }

  async function tick() {
    const { prices } = await handlers.prices(tickers);
    const decisions = {};

    for (const tk of tickers) {
      const px = prices[tk];
      if (!px || px.error || !(px.onp > 0)) { log("skip", tk, `${tk}: price unavailable`); continue; }
      try {
        const [an, nw] = await Promise.all([handlers.analysis(tk), handlers.news(tk)]);
        if (an.error) { log("skip", tk, `${tk}: ${an.error}`); continue; }
        decisions[tk] = {
          d: decide({ ticker: tk, ret: an.ret, vol: an.vol, onp: px.onp, refp: px.refp, mkt: mapStatus(px.marketStatus), ta: an.ta, news: nw.news }),
          px, an,
        };
      } catch (e) { log("error", tk, `${tk}: ${String(e.message || e).slice(0, 120)}`); }
    }

    // 1) exits first
    for (const [tk, p] of Object.entries(state.positions)) {
      const x = decisions[tk]; if (!x) continue;
      const price = x.px.onp, pnl = ((price - p.entry) / p.entry) * 100;
      if (x.d.anomalous) continue; // never trade on a glitched price
      if (pnl <= cfg.stopLossPct) sell(tk, price, `stop-loss (${r2(pnl)}% <= ${cfg.stopLossPct}%)`);
      else if (pnl >= cfg.takeProfitPct) sell(tk, price, `take-profit (${r2(pnl)}% >= ${cfg.takeProfitPct}%)`);
      else if (x.d.verdict === "skip") sell(tk, price, `verdict skip: ${x.d.reasons[0]}`);
      else if (x.d.verdict === "wait" && cfg.exitOnWait) sell(tk, price, `verdict wait: ${x.d.reasons[0]}`);
    }

    // 2) entries
    for (const tk of tickers) {
      const x = decisions[tk]; if (!x || state.positions[tk]) continue;
      const lastSell = state.closed.findLast((c) => c.ticker === tk);
      if (lastSell && now() - lastSell.closedAt < cfg.cooldownMs) continue;
      const { d, px, an } = x;
      if (d.verdict !== "buy") continue;
      if (Object.keys(state.positions).length >= cfg.maxPositions) { log("skip", tk, `${tk}: buy verdict but max ${cfg.maxPositions} positions reached`); continue; }
      const usd = r2(cfg.baseBuyUsd * d.size);
      if (usd <= 0 || usd > state.cash) { log("skip", tk, `${tk}: not enough cash for $${usd}`); continue; }
      const qty = usd / px.onp;
      state.cash -= usd;
      state.positions[tk] = {
        qty, entry: px.onp, openedAt: now(),
        features: { regime: d.regime, conf: d.conf, spreadPct: d.spreadPct, rsi: an.ta?.rsi ?? null,
          extPct: an.ta?.sma ? r2(((px.onp - an.ta.sma) / an.ta.sma) * 100) : null, newsLevel: d.news.level, size: d.size },
      };
      log("buy", tk, `${tk} liya $${usd} @ $${px.onp}: ${d.reasons.join("; ")}`);
    }

    state.lastTick = now(); state.ticks++;
    state.lastEquity = r2(equity(prices));
    await save();
    return snapshot(prices);
  }

  function snapshot(prices = {}) {
    const positions = Object.entries(state.positions).map(([tk, p]) => {
      const price = prices[tk]?.onp ?? p.entry;
      return { ticker: tk, qty: p.qty, entry: p.entry, price, pnlPct: r2(((price - p.entry) / p.entry) * 100), openedAt: p.openedAt };
    });
    return { cash: r2(state.cash), equity: r2(equity(prices)), startCash: cfg.startCash, positions,
      closedCount: state.closed.length, closed: state.closed.slice(-50), log: state.log.slice(0, 100),
      lastTick: state.lastTick, ticks: state.ticks, cfg };
  }

  let timer = null;
  function start(intervalMs = 5 * 60_000) {
    const run = () => tick().catch((e) => { log("error", "-", `tick failed: ${String(e.message || e).slice(0, 150)}`); });
    load().then(() => { run(); timer = setInterval(run, intervalMs); });
  }
  const stop = () => timer && clearInterval(timer);

  return { tick, load, save, start, stop, snapshot: () => snapshot(), get state() { return state; } };
}

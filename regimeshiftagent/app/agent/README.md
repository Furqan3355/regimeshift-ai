# RegimeShift AI

**A market-regime advisor for tokenized stocks on BNB Chain.** It looks at how turbulent the market is right now, checks whether the on-chain token price matches its reference price, reads technicals and news headlines, and returns one plain verdict: **buy, wait or skip**, with a position size and the reasons.

Built for **BNB Hack, Tokenized Stocks Edition (Main Track)**.

> **The one rule that shapes the whole project: the LLM never makes the decision.** Regime, spread check, news check, sizing and the trade dry-run are fixed, tested code. The LLM only explains the already-computed result in plain English. Every extra signal can only make the verdict *more cautious*, never more aggressive.

- Demo video: `[TODO: link]`
- Agent on BNB Agent Studio: `[TODO: agent link / ERC-8004 agent id]`
- Real on-chain demo swap (small, manual): `[TODO: BscScan tx hash]`
- DX report: `[TODO: link]`

---

## What it does

For a tokenized stock (Ondo tokens on BNB Chain), RegimeShift produces:

1. **Regime**: `Risk-On`, `Defensive` or `Crisis`, from a Gaussian Mixture Model over (daily return %, 7-day rolling volatility %).
2. **Price sanity**: on-chain price vs reference price. A spread wider than 1% means *wait*; a suspiciously round price ratio (2x, 4x, 5x, 10x, 15x) is treated as a data glitch and means *skip*.
3. **Market hours**: regular hours full size, outside regular hours 30% size, closed or unknown status means *wait* with size 0.
4. **Technicals**: trend, RSI, 20-day average, and an entry-price suggestion that avoids chasing a run-up.
5. **News check**: transparent keyword rules over recent headlines.
6. **Trade dry-run**: before any trade, the Binance Transaction API dry-run reports gas and slippage.

### How the verdict is built

Signals stack. The **most severe trigger wins**; size is the base size times every caution factor.

| Signal | Effect |
|---|---|
| Price glitch (round-multiple price ratio, 2% tolerance) | skip |
| Market closed / unknown status | wait, size 0 |
| Spread wider than 1% | wait |
| Regime **Crisis** | skip |
| Regime **Defensive** | size x0.5, caution label |
| News **serious** (fraud, investigation, lawsuit, halt, plunge, recall, delist, guidance cut, ...) | skip, names the triggering headline |
| News **caution** (miss, below estimates, slows, pressure, downgrade, warns, scrutiny, ...) | size x0.5 |
| Outside regular hours | size 30% |

Example: Defensive regime plus a cautious headline gives a 25% position. Positive headlines never upgrade a wait or skip to a buy.

---

## The regime model

- **Model:** 3-component Gaussian Mixture over `[return_pct, volatility_pct]`. Clusters are labelled after fitting by their volatility: lowest is Risk-On, middle is Defensive, highest is Crisis.
- **Training data:** daily candles from the Binance Web3 RWA endpoints, `python collect_training_data.py --max-tokens 150 --limit-candles 100`. This produced **10,104 rolling-window samples from 147 tickers** (stocks and ETFs; 3 tokens skipped for too little history). 286 single-day moves above 50% were dropped as candle gaps or scale glitches.
- **Candle ordering:** the training script sorts candles by timestamp explicitly before computing returns (it previously relied on the API's order).

Fitted regimes (from `gmm_params.json`):

| Regime | Weight | Avg. daily volatility |
|---|---|---|
| Risk-On | 55.6% | 2.1% |
| Defensive | 37.1% | 5.3% |
| Crisis | 7.3% | 13.2% |

Diagnostics (`python evaluate_gmm.py`): train/test log-likelihood gap **0.036** (no overfitting signal), silhouette **0.31** (moderate separation), all three clusters well populated. See *Limitations* for what these numbers do and do not mean.

---

## Architecture

```
Binance Web3 API (RWA prices, candles, Transaction API)
        |
        +--> Python: data_ingestion, ml_engine (GMM), technical_analysis,
        |            market_news, trade_executor, training + evaluation scripts
        |
        +--> proxy/ (Node)  -- server-side, keys never reach the browser
        |       lib.mjs        signed Binance calls + caching (analysis 5 min, news 10 min)
        |       verdict.mjs    THE decision logic (browser + Node, no imports, no LLM)
        |       bot.mjs        autonomous paper-trading bot
        |       public/index.html   dashboard: Advisor + Paper Trading tabs
        |
        +--> regimeshiftagent/ (TypeScript, BNB Agent Studio)
                regimeEngine.ts + verdictRules.ts   same regime + verdict rules
                regimeShiftBridge.ts                deterministic pipeline, then LLM explains
                unifiedMain.ts                      x402 / ERC-8183 seller agent
```

**One decision, two runtimes.** The dashboard (`proxy/verdict.mjs`) and the paid agent (`verdictRules.ts` plus `regimeEngine.ts`) implement the same rules. `regimeshiftagent/app/agent/parity_check.ts` runs both on 20,000 random inputs and requires identical verdicts and sizes (current result: 0 mismatches). The GMM constants in `verdict.mjs` are checked against `gmm_params.json` by a test, so retraining cannot silently leave them out of sync.

### Dashboard

- **Advisor tab:** pick a ticker, get the verdict, size, reasons, and which rule triggered.
- **Paper Trading tab:** *My portfolio* (manual paper account) and *Bot portfolio* (autonomous, below). Prices are the real on-chain token prices, refreshed every 10 s.
- **LIVE vs DEMO badge:** LIVE uses real Binance data through the local proxy. DEMO (used on a static published page) uses illustrative simulated numbers and is labelled as such.

### Autonomous paper-trading bot

Runs **server-side** every 5 minutes, even with the browser closed. Real data, virtual money.

- Virtual $10,000 account, separate from the manual portfolio.
- Scans the 15-ticker watchlist, calls the same `decide()` as the Advisor.
- Buys `$50 x verdict size` on a buy verdict (max 5 open positions).
- Sells on stop-loss (-5%), take-profit (+8%), or a `skip` verdict. A `wait` verdict (for example, market closed overnight) holds the position.
- 1-hour cooldown before re-buying a ticker it just sold.
- Never trades on a price flagged as a glitch.
- **Every action is logged with its reason** ("NVDA bought: Risk-On 98%, spread 0.0%, news clear"). Each trade also stores its features (regime, spread, RSI, extension over the 20-day average, news level) and its outcome.
- State survives restarts (`proxy/bot_state.json`, git-ignored).

### Agent (BNB Agent Studio)

A seller agent on `bsc-testnet` using the ERC-8183 / x402 rails. A structured request (ticker, return, volatility, on-chain and reference price, market status, optional trade) goes through the deterministic pipeline first; the LLM then explains the JSON result and is told to treat the `verdict` as final.

---

## Run it locally

Requirements: Python 3.11+, Node 22+, and (for the agent) the `bag` CLI.

```powershell
# 1. Keys go in a git-ignored .env at the repo root (never commit it)
#    BINANCE_API_KEY=...
#    BINANCE_API_SECRET=...
#    FINNHUB_API_KEY=...        (optional, enables news headlines)

# 2. Dashboard + bot
cd proxy
node server.mjs                 # http://localhost:8787   (BOT=off disables the bot)
node --test test_verdict.mjs test_bot.mjs

# 3. Python tests
cd ..
python -m pytest tests/ -v

# 4. Retrain the regime model (after any data change)
python collect_training_data.py --max-tokens 150 --limit-candles 100
python export_gmm_params.py
python evaluate_gmm.py
cd proxy ; node sync_gmm.mjs ; node --test test_verdict.mjs test_bot.mjs   # sync constants, re-verify
copy ..\gmm_params.json ..\regimeshiftagent\app\agent\src\gmm_params.json

# 5. Agent
cd regimeshiftagent
bag doctor
bag dev                                             # http://localhost:9000
cd app\agent
npx tsx parity_check.ts                             # agent vs dashboard, 20,000 cases
npx tsx try_pipeline.ts                             # see the verdicts for sample inputs
python ..\..\..\build_snapshots.py --tickers NVDA AAPL   # refresh cached news snapshots (run from repo root)
```

Useful endpoints on the local server: `/api/prices`, `/api/analysis?ticker=NVDA`, `/api/news?ticker=NVDA`, `/api/bot`.

---

## Testing

| Suite | What it covers | Command |
|---|---|---|
| `proxy/test_verdict.mjs` | every rule, stacking, severity order, GMM-constant drift | `node --test` |
| `proxy/test_bot.mjs` | buys/sells, sizing, stop-loss/take-profit, cooldown, glitches, persistence | `node --test` |
| `tests/` | Python data ingestion, GMM, trade executor | `python -m pytest tests/` |
| `parity_check.ts` | agent verdict equals dashboard verdict on 20,000 random inputs | `npx tsx` |

Regime test inputs are derived from the current model (`test_points.mjs`), so retraining never breaks them by hand-picked numbers.

---

## Security

- API keys live only in a git-ignored `.env` (and the agent's own `.studio` secrets); nothing is hard-coded and browsers never see them, because all Binance calls go through the local proxy.
- The LLM cannot sign, trade, or change a verdict. Signing and money movement are fixed code.
- A price whose ratio to the reference looks like a scale mistake is refused rather than traded.

---

## Limitations (please read)

We would rather state these than have you find them.

- **No performance claim.** The bot is paper trading. A few days of virtual P&L is noise, not a track record, and we make no claim about profit or accuracy.
- **The regime model is unsupervised.** There is no ground-truth regime label for any historical day, so there is no "accuracy". The diagnostics measure generalization gap, cluster separation and balance only.
- **Regimes overlap.** Silhouette is about 0.31 (moderate). BIC prefers 5 components over our chosen 3; three is a deliberate product choice (Risk-On / Defensive / Crisis), not the statistically cleanest fit.
- **"Crisis" means crisis *in this window*.** The Crisis cluster is the most turbulent 7% of about 100 days across 147 tickers, not a historical crash like 2008 or March 2020.
- **Overlapping samples.** Rolling 7-day volatility windows overlap, so the 10,104 samples are not 10,104 independent observations.
- **Mixed universe.** Training includes ETFs alongside single stocks, so "volatility" levels differ a lot across tickers.
- **News rules are crude.** Keyword lists, not sentiment analysis. They are intentionally transparent and can only add caution, but they will miss nuance and can false-alarm on a word in an unrelated context.
- **Agent news comes from cached snapshots.** `snapshots.json` is built by `build_snapshots.py` and is treated as stale after 6 hours (rules still apply to stale news, only in the cautious direction). If a ticker has no snapshot the response says "news unverified". News fetched live by the LLM tool is not passed through the keyword rules, because the LLM does not decide.
- **Small known difference:** for pre-market and post-market the agent sizes at 50%, the dashboard at 30%. Verdicts are otherwise identical (verified by the parity check).
- **Real trading is a small manual demo only.** The autonomous bot is paper trading. The one real swap on BNB Chain is a small, manual transaction (see the tx hash above).
- **Live data coverage.** A ticker missing from the Binance RWA list simply gets "price unavailable" and is skipped by the bot.

## Roadmap

- **Bounded self-learning for the bot** (not implemented yet): after at least 20 closed trades, adjust a few knobs (RSI ceiling, maximum extension over the 20-day average, size multiplier) in the *more cautious* direction only, log every change with its evidence, and warm up on historical candles. Statistics only; the LLM stays out of it.
- Tie the manual Paper Trading "Buy" button to the verdict engine.
- Replace keyword news rules with a scored source, keeping the "can only add caution" guarantee.

---

*Last updated 30 Sep 2026.*
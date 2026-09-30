/**
 * verdictRules.ts
 * -----------------
 * Layers the SAME extra rules the dashboard uses (proxy/verdict.mjs) on top of the
 * existing deterministic gate in regimeEngine.ts, so the paid agent and the dashboard
 * never disagree:
 *
 *   - Regime Crisis    -> skip
 *   - Regime Defensive -> size x0.5 (caution)
 *   - News serious     -> skip (names the headline)
 *   - News caution     -> size x0.5
 *
 * GOLDEN RULE (same as the dashboard): every rule can only make the verdict MORE
 * cautious. Nothing here can turn a wait/skip into a buy. No LLM involved.
 * Severity: buy (0) < wait (1) < skip (2); the most severe trigger wins; size is the
 * base size times every caution factor.
 *
 * Keep NEWS_SERIOUS / NEWS_CAUTION identical to proxy/verdict.mjs (parity_check.ts tests this).
 */

import type { TokenEvaluation } from "./regimeEngine.js";

export type Verdict = "buy" | "wait" | "skip";
export type NewsLevel = "clear" | "caution" | "serious";

export interface NewsCheck {
  level: NewsLevel;
  trigger: string | null;
  headline: string | null;
}

export interface VerdictTrigger {
  level: Verdict;
  code: string;
  text: string;
}

export interface FinalVerdict {
  verdict: Verdict;
  should_trade: boolean;
  position_size_multiplier: number;
  caution: boolean;
  news_check: NewsCheck;
  triggers: VerdictTrigger[];
  reasons: string[];
}

export const NEWS_SERIOUS = [
  "fraud", "investigation", "probe", "lawsuit", "sues", "sued", "bankruptcy", "recall", "delist", "halt",
  "guidance cut", "cuts guidance", "cuts forecast", "resign", "plunge", "subpoena", "sec charges", "accounting irregular",
  "default", "class action",
];
export const NEWS_CAUTION = [
  "miss", "below estimates", "below expectations", "slows", "slowdown", "pressure", "concern", "delay",
  "uncertainty", "downgrade", "warns", "scrutiny", "weak demand", "layoffs",
];

// word-start match, so "miss" also hits "misses" but not "dismiss"
const wordRe = (k: string) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
const SERIOUS_RE: Array<[string, RegExp]> = NEWS_SERIOUS.map((k) => [k, wordRe(k)]);
const CAUTION_RE: Array<[string, RegExp]> = NEWS_CAUTION.map((k) => [k, wordRe(k)]);

/** news: headlines separated by " | " (or an array). */
export function classifyNews(news: string | string[] | null | undefined): NewsCheck {
  const heads = Array.isArray(news)
    ? news
    : String(news || "").split("|").map((s) => s.trim()).filter(Boolean);
  let caution: NewsCheck | null = null;
  for (const h of heads) {
    for (const [k, re] of SERIOUS_RE) if (re.test(h)) return { level: "serious", trigger: k, headline: h };
    if (!caution) for (const [k, re] of CAUTION_RE) if (re.test(h)) caution = { level: "caution", trigger: k, headline: h };
  }
  return caution ?? { level: "clear", trigger: null, headline: null };
}

const LEVEL: Record<Verdict, number> = { buy: 0, wait: 1, skip: 2 };
const VERDICT_OF: Verdict[] = ["buy", "wait", "skip"];

/**
 * ev: the existing gate result (regime, spread gate, market-hours size).
 * newsText: cached/live headlines, or null when no news is available.
 */
export function applyVerdictRules(
  ev: TokenEvaluation,
  isAnomalous: boolean,
  newsText: string | null | undefined,
): FinalVerdict {
  const news = classifyNews(newsText);
  const triggers: VerdictTrigger[] = [];
  const add = (level: Verdict, code: string, text: string) => triggers.push({ level, code, text });

  let size = ev.position_size_multiplier;
  let caution = false;

  if (isAnomalous) add("skip", "price_glitch", ev.entry_reason);
  if (ev.position_size_multiplier === 0) add("wait", "market_closed", "Market is closed or status unknown; no position size is considered safe");
  else if (ev.position_size_multiplier < 1) caution = true; // outside regular hours
  if (!isAnomalous && !ev.entry_efficient) add("wait", "wide_spread", ev.entry_reason);
  if (ev.regime === "Crisis") add("skip", "regime_crisis", `Regime is Crisis (${Math.round(ev.confidence * 100)}% confident): no new positions in a turbulent market`);
  if (ev.regime === "Defensive") { size *= 0.5; caution = true; }
  if (news.level === "serious") add("skip", "news_serious", `Serious headline ("${news.trigger}"): ${news.headline}`);
  if (news.level === "caution") { size *= 0.5; caution = true; }

  const top = triggers.reduce((m, t) => Math.max(m, LEVEL[t.level]), 0);
  const verdict = VERDICT_OF[top];
  if (verdict !== "buy") size = 0;

  const reasons = triggers.filter((t) => LEVEL[t.level] === top).map((t) => t.text);
  if (verdict === "buy") {
    reasons.push(
      ev.regime === "Defensive"
        ? `Regime is Defensive (${Math.round(ev.confidence * 100)}% confident): size halved`
        : `Regime is ${ev.regime} (${Math.round(ev.confidence * 100)}% confident)`,
    );
    reasons.push(ev.entry_reason);
    if (news.level === "caution") reasons.push(`Cautious headline ("${news.trigger}"): size halved. ${news.headline}`);
    else if (!newsText || !String(newsText).trim()) reasons.push("News not checked: no news available for this ticker");
    else reasons.push("News check: clear");
    reasons.push(`Suggested size: ${Math.round(size * 100)}% of a normal position`);
  }

  return {
    verdict,
    should_trade: verdict === "buy" && size > 0,
    position_size_multiplier: Math.round(size * 1000) / 1000,
    caution: verdict === "buy" && caution,
    news_check: news,
    triggers,
    reasons,
  };
}
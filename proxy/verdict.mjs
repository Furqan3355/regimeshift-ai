/**
 * verdict.mjs — the ONE place where the buy / wait / skip decision is made.
 *
 * Used by: the dashboard (browser, via import), the autonomous bot (Node),
 * and the tests. No imports, no I/O, no LLM: same input -> same output.
 *
 * GOLDEN RULE: every extra signal (regime, news, market hours) can only make
 * the verdict MORE cautious, never more aggressive. Nothing here can turn a
 * "wait" or "skip" into a "buy".
 *
 * Severity: buy (0) < wait (1) < skip (2). The final verdict is the most
 * severe trigger that fired; position size is base size x every caution factor.
 */

// ---- GMM regime model (same numbers as gmm_params.json; test_verdict.mjs fails if they drift) ----
export const GMM = {
  weights: [0.37072504298230236,0.5559146122511448,0.07336034476655275],
  means: [[-0.17204458903938802,5.283978707964145],[-0.06320173838180565,2.0867927221514626],[-0.09737675890790438,13.232643579877303]],
  covariances: [[[27.182494766296095,-0.5519409697544778],[-0.5519409697544778,3.665709438058838]],[[3.183057484363123,-0.018752326433325375],[-0.018752326433325382,0.9359261116977905]],[[244.43657953761377,-9.747862604446174],[-9.747862604446174,23.220617859856773]]],
  labels: ["Defensive","Risk-On","Crisis"],
};

const inv2 = (m) => { const [[a, b], [c, d]] = m, det = a * d - b * c; return { inv: [[d / det, -b / det], [-c / det, a / det]], det }; };
function logMvn(x, mean, cov) {
  const { inv, det } = inv2(cov), dx = [x[0] - mean[0], x[1] - mean[1]];
  const q = dx[0] * (inv[0][0] * dx[0] + inv[0][1] * dx[1]) + dx[1] * (inv[1][0] * dx[0] + inv[1][1] * dx[1]);
  return -0.5 * (2 * Math.log(2 * Math.PI) + Math.log(det) + q);
}
export function predictRegime(ret, vol) {
  const lw = GMM.weights.map((w, i) => Math.log(w) + logMvn([ret, vol], GMM.means[i], GMM.covariances[i]));
  const mx = Math.max(...lw), s = lw.reduce((a, l) => a + Math.exp(l - mx), 0), ln = mx + Math.log(s);
  const p = lw.map((l) => Math.exp(l - ln));
  let best = 0; p.forEach((v, i) => { if (v > p[best]) best = i; });
  return { regime: GMM.labels[best], conf: Math.round(p[best] * 10000) / 10000 };
}

// ---- price-scale glitch detector (spread-aware gating) ----
const SUSPICIOUS = [2, 4, 5, 10, 15], TOL = 0.02;
export function isAnomalous(onp, refp) {
  const r = onp / refp;
  for (const s of SUSPICIOUS) for (const c of [s, 1 / s]) if (Math.abs(r - c) / c <= TOL) return true;
  return false;
}
export const MAX_SPREAD_PCT = 1.0;

// ---- off-hours awareness ----
export const OFFHOURS = {
  regular: { m: 1, label: "market open" },
  offhours: { m: 0.3, label: "outside regular hours" },
  closed: { m: 0, label: "market closed" },
};

// ---- news check: transparent keyword lists (deliberately crude; see README "Limitations") ----
// MATCHING RULES (keep identical to regimeshiftagent/app/agent/src/verdictRules.ts):
//  - whole words / phrases only, case-insensitive. A keyword may carry ONE plain suffix (s, es, ed, d):
//    "halt" matches "halts"/"halted", "miss estimates" does not match "mission" or "missile".
//  - phrases are used where a bare word is ambiguous ("under pressure", not "pressure";
//    "default on", not "default"; "sued"/"sues" only halve the size because the company may be the one suing).
//  - news === null/undefined means the headlines could not be fetched: level "unavailable"
//    (never "clear"); it does not change size or verdict, but the reason says it was not verified.
export const NEWS_SERIOUS = [
  "fraud", "fraudulent", "investigation", "probe", "lawsuit", "class action", "bankruptcy", "bankruptcies",
  "recall", "delist", "halt", "guidance cut", "cuts guidance", "cuts forecast", "resign", "plunge",
  "subpoena", "sec charges", "accounting irregularity", "accounting irregularities",
  "default on", "defaults on", "defaulted on", "debt default",
];
export const NEWS_CAUTION = [
  "sues", "sued",
  "earnings miss", "revenue miss", "miss estimates", "misses estimates", "missed estimates",
  "miss expectations", "misses expectations", "missed expectations", "below estimates", "below expectations",
  "slows", "slowdown", "under pressure", "margin pressure", "pricing pressure", "pressure on",
  "concern over", "concerns over", "concerns about", "raises concerns", "raised concerns",
  "delay", "uncertainty", "downgrade", "warns", "scrutiny", "weak demand", "layoffs",
];
const escRe = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (k) => new RegExp(`\\b${escRe(k)}(?:s|es|ed|d)?\\b`, "i");
const SERIOUS_RE = NEWS_SERIOUS.map((k) => [k, wordRe(k)]);
const CAUTION_RE = NEWS_CAUTION.map((k) => [k, wordRe(k)]);

/**
 * news: string of headlines separated by " | " (or an array), "" when none were found,
 * null/undefined when the news source could not be reached. Returns {level, trigger, headline}
 * with level = clear | caution | serious | unavailable.
 */
export function classifyNews(news) {
  if (news === null || news === undefined) return { level: "unavailable", trigger: null, headline: null };
  const heads = Array.isArray(news) ? news : String(news).split("|").map((s) => s.trim()).filter(Boolean);
  let caution = null;
  for (const h of heads) {
    for (const [k, re] of SERIOUS_RE) if (re.test(h)) return { level: "serious", trigger: k, headline: h };
    if (!caution) for (const [k, re] of CAUTION_RE) if (re.test(h)) caution = { level: "caution", trigger: k, headline: h };
  }
  return caution || { level: "clear", trigger: null, headline: null };
}

// ---- entry price suggestion (same idea as before: don't chase a run-up) ----
export function entrySuggestion(d) {
  if (!d.ta || !d.ta.sma) return { price: d.onp, note: "No 20-day average available; using the current on-chain price." };
  const extPct = ((d.onp - d.ta.sma) / d.ta.sma) * 100;
  if (extPct <= 2) return { price: d.onp, note: `Price is already near its 20-day average ($${d.ta.sma}), a reasonable entry, not a chase.` };
  return { price: d.ta.sma, note: `Price has run ${extPct.toFixed(1)}% above its 20-day average; waiting for a pullback toward ~$${d.ta.sma} (or the recent low, $${d.ta.low}) avoids buying the top.` };
}

const LEVEL = { buy: 0, wait: 1, skip: 2 };
const VERDICT_OF = ["buy", "wait", "skip"];

/**
 * d = { ticker, ret, vol, onp, refp, mkt: 'regular'|'offhours'|'closed', ta:{trend,rsi,sma,low}, news }
 * Returns a plain object; every field the UI / bot / logs need.
 */
export function decide(d) {
  const spreadPct = Math.round(((d.onp - d.refp) / d.refp) * 10000) / 100;
  const anomalous = isAnomalous(d.onp, d.refp);
  const reg = predictRegime(d.ret, d.vol);
  const hrs = OFFHOURS[d.mkt] || OFFHOURS.closed; // unknown status -> safest default
  const news = classifyNews(d.news);

  const triggers = []; // {level, code, text}
  const add = (level, code, text) => triggers.push({ level: LEVEL[level], code, text });
  let size = hrs.m;
  let caution = false;

  if (anomalous) add("skip", "price_glitch", `On-chain $${d.onp} vs reference $${d.refp} differ by a suspiciously round multiple: a data glitch, not a market move`);
  if (hrs.m === 0) add("wait", "market_closed", "Market is closed; no position size is considered safe");
  else if (d.mkt === "offhours") { caution = true; }
  if (!anomalous && Math.abs(spreadPct) > MAX_SPREAD_PCT) add("wait", "wide_spread", `Spread ${spreadPct}% is wider than the +/-${MAX_SPREAD_PCT}% comfort limit`);
  if (reg.regime === "Crisis") add("skip", "regime_crisis", `Regime is Crisis (${Math.round(reg.conf * 100)}% confident): no new positions in a turbulent market`);
  if (reg.regime === "Defensive") { size *= 0.5; caution = true; }
  if (news.level === "serious") add("skip", "news_serious", `Serious headline ("${news.trigger}"): ${news.headline}`);
  if (news.level === "caution") { size *= 0.5; caution = true; }

  const top = triggers.reduce((m, t) => Math.max(m, t.level), 0);
  const verdict = VERDICT_OF[top];
  if (verdict !== "buy") size = 0;

  const reasons = triggers.filter((t) => t.level === top).map((t) => t.text);
  const out = {
    ticker: d.ticker, verdict, size: Math.round(size * 1000) / 1000, caution: verdict === "buy" && caution,
    regime: reg.regime, conf: reg.conf, spreadPct, anomalous, market: d.mkt, marketLabel: hrs.label,
    news, triggers: triggers.map((t) => ({ level: VERDICT_OF[t.level], code: t.code, text: t.text })),
    reasons, entry: null,
  };
  if (verdict === "buy") {
    out.entry = entrySuggestion(d);
    if (reg.regime === "Defensive") out.reasons.push(`Regime is Defensive (${Math.round(reg.conf * 100)}% confident): size halved`);
    else out.reasons.push(`Regime is ${reg.regime} (${Math.round(reg.conf * 100)}% confident)`);
    out.reasons.push(`Spread ${spreadPct}% (within +/-${MAX_SPREAD_PCT}%)`);
    if (d.mkt === "offhours") out.reasons.push("Outside regular hours: size cut to 30%");
    if (news.level === "caution") out.reasons.push(`Cautious headline ("${news.trigger}"): size halved. ${news.headline}`);
    else if (news.level === "unavailable") out.reasons.push("News check: unavailable (headlines could not be fetched, so this was NOT verified)");
    else out.reasons.push("News check: clear");
    out.reasons.push(`Suggested size: ${Math.round(out.size * 100)}% of a normal position`);
  }
  return out;
}

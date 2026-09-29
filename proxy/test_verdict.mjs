// Run: node --test test_verdict.mjs   (or: node test_verdict.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { decide, classifyNews, isAnomalous, predictRegime, GMM } from "./verdict.mjs";

// A clean, calm baseline that should be a plain BUY.
const base = (o = {}) => ({
  ticker: "NVDA", ret: 0.3, vol: 1.9, onp: 118.96, refp: 118.96, mkt: "regular",
  ta: { trend: "uptrend", rsi: 58, sma: 117.8, low: 114.2 }, news: "Nvidia demand remains strong", ...o,
});

test("baseline: calm + clean + open + clear news -> buy at full size", () => {
  const r = decide(base());
  assert.equal(r.verdict, "buy"); assert.equal(r.size, 1); assert.equal(r.regime, "Risk-On"); assert.equal(r.caution, false);
  assert.ok(r.entry && r.entry.price > 0);
});

test("REGIME: Crisis -> skip even though price, spread and market are all fine", () => {
  const r = decide(base({ ret: -2.1, vol: 12.5 }));
  assert.equal(r.regime, "Crisis"); assert.equal(r.verdict, "skip"); assert.equal(r.size, 0); assert.equal(r.entry, null);
  assert.ok(r.triggers.some((t) => t.code === "regime_crisis"));
});

test("REGIME: Defensive -> still buy, but size 50% + caution label", () => {
  const r = decide(base({ ret: -0.2, vol: 5.0 }));
  assert.equal(r.regime, "Defensive"); assert.equal(r.verdict, "buy"); assert.equal(r.size, 0.5); assert.equal(r.caution, true);
});

test("price glitch (10x) -> skip", () => {
  const r = decide(base({ onp: 7116.5, refp: 711.65 }));
  assert.equal(r.verdict, "skip"); assert.equal(r.anomalous, true);
});

test("market closed -> wait, size 0", () => {
  const r = decide(base({ mkt: "closed" })); assert.equal(r.verdict, "wait"); assert.equal(r.size, 0);
});

test("unknown market status is treated as closed (safe default)", () => {
  assert.equal(decide(base({ mkt: "???" })).verdict, "wait");
});

test("off-hours -> buy at 30% with caution", () => {
  const r = decide(base({ mkt: "offhours" })); assert.equal(r.verdict, "buy"); assert.equal(r.size, 0.3); assert.equal(r.caution, true);
});

test("wide spread (>1%) -> wait", () => {
  const r = decide(base({ onp: 121.5 })); assert.equal(r.verdict, "wait"); assert.ok(r.triggers.some((t) => t.code === "wide_spread"));
});

test("NEWS: serious headline downgrades a clean buy to skip and names the headline", () => {
  const r = decide(base({ news: "Nvidia strong demand | SEC opens investigation into Nvidia accounting" }));
  assert.equal(r.verdict, "skip"); assert.equal(r.news.level, "serious"); assert.equal(r.news.trigger, "investigation");
  assert.match(r.reasons.join(" "), /investigation/i);
});

test("NEWS: caution headline halves size, verdict stays buy", () => {
  const r = decide(base({ news: "Tesla deliveries below estimates" }));
  assert.equal(r.verdict, "buy"); assert.equal(r.size, 0.5); assert.equal(r.news.level, "caution"); assert.equal(r.caution, true);
});

test("NEWS: positive headlines NEVER upgrade a wait/skip to buy", () => {
  const great = "Record profit | Analysts raise targets | Massive beat";
  assert.equal(decide(base({ news: great, mkt: "closed" })).verdict, "wait");
  assert.equal(decide(base({ news: great, ret: -2, vol: 12.5 })).verdict, "skip");
  assert.equal(decide(base({ news: great, onp: 7116.5, refp: 711.65 })).verdict, "skip");
});

test("stacking: Defensive + caution news -> 25% size", () => {
  const r = decide(base({ ret: -0.2, vol: 5.0, news: "Growth slows in key markets" })); assert.equal(r.size, 0.25);
});

test("most severe trigger wins (closed + crisis -> skip, both listed)", () => {
  const r = decide(base({ mkt: "closed", ret: -2, vol: 12.5 }));
  assert.equal(r.verdict, "skip"); assert.ok(r.triggers.length >= 2);
});

test("classifyNews: clear / empty / word-boundary safety", () => {
  assert.equal(classifyNews("").level, "clear"); assert.equal(classifyNews(null).level, "clear");
  assert.equal(classifyNews("Company hits new high").level, "clear");
  assert.equal(classifyNews("Price cuts boost sales").level, "clear"); // bare "cut" is deliberately NOT a keyword
  assert.equal(classifyNews("Company halts trading after outage").level, "serious"); // "halt" matches "halts"
  assert.equal(classifyNews("Shift in strategy").level, "clear"); // "shift" must not trip "hi..." style false positives
});

test("isAnomalous: 2x/10x/0.1x flagged, normal 3% gap not", () => {
  assert.equal(isAnomalous(200, 100), true); assert.equal(isAnomalous(0.3341, 3.2854), true); assert.equal(isAnomalous(103, 100), false);
});

test("GMM constants in verdict.mjs match gmm_params.json (catches drift after retraining)", () => {
  const p = JSON.parse(fs.readFileSync(new URL("../gmm_params.json", import.meta.url), "utf8"));
  assert.deepEqual(GMM.weights, p.weights); assert.deepEqual(GMM.means, p.means); assert.deepEqual(GMM.covariances, p.covariances);
  assert.equal(predictRegime(0.3, 0.8).regime, "Risk-On");
});

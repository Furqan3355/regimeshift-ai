import test from "node:test";
import assert from "node:assert/strict";
import { dailyCloses, marketStatus } from "./coingecko.mjs";
import { createHandlers } from "./lib.mjs";

const json = (body, status = 200) => ({
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test("market status follows the New York cash session", () => {
  assert.equal(marketStatus(Date.parse("2026-10-10T15:00:00Z")), "closed");
  assert.equal(marketStatus(Date.parse("2026-10-12T14:30:00Z")), "regular");
  assert.equal(marketStatus(Date.parse("2026-10-12T22:00:00Z")), "offhours");
});

test("daily closes keep the last price of each UTC day", () => {
  const rows = dailyCloses([
    [Date.parse("2026-10-01T15:00:00Z"), 10],
    [Date.parse("2026-10-01T20:00:00Z"), 12],
    [Date.parse("2026-10-02T15:00:00Z"), 11],
  ]);
  assert.deepEqual(rows.map((r) => r.close), [12, 11]);
});

test("Binance compliance block falls back to CoinGecko", async () => {
  const calls = [];
  const h = createHandlers({
    env: { BINANCE_API_KEY: "k", BINANCE_API_SECRET: "s" },
    now: () => Date.parse("2026-10-12T14:30:00Z"),
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("binance")) return json({ code: 40304, msg: "Service not available due to compliance restriction" });
      return json({ "nvidia-ondo-tokenized-stock": { usd: 230.5 } });
    },
  });
  const out = await h.prices(["NVDA"]);
  assert.equal(out.source, "coingecko");
  assert.equal(out.prices.NVDA.onp, 230.5);
  assert.equal(out.prices.NVDA.refp, 230.5);
  assert.equal(out.prices.NVDA.marketStatus, "regular");
  assert.ok(calls.some((u) => u.includes("coingecko")));
});

test("a successful Binance quote is kept", async () => {
  const h = createHandlers({
    env: { BINANCE_API_KEY: "k", BINANCE_API_SECRET: "s" },
    now: () => 1,
    fetchImpl: async (url) => {
      if (String(url).includes("coingecko")) throw new Error("CoinGecko should not be called");
      return json({
        code: 0,
        data: [{ underlyingTicker: "NVDA", tokenPrice: "100", referencePrice: "101", statusInfo: { marketStatus: "regular" } }],
      });
    },
  });
  const out = await h.prices(["NVDA"]);
  assert.equal(out.source, "binance");
  assert.equal(out.prices.NVDA.onp, 100);
  assert.equal(out.prices.NVDA.refp, 101);
});

test("CoinGecko history feeds analysis when Binance is blocked", async () => {
  const start = Date.parse("2026-09-01T00:00:00Z");
  const points = Array.from({ length: 40 }, (_, i) => [start + i * 86400_000, 100 + i]);
  const h = createHandlers({
    env: { BINANCE_API_KEY: "k", BINANCE_API_SECRET: "s" },
    now: () => Date.parse("2026-10-12T14:30:00Z"),
    fetchImpl: async (url) => {
      if (String(url).includes("binance")) return json({ code: 40304, msg: "blocked" });
      return json({ prices: points });
    },
  });
  const out = await h.analysis("NVDA");
  assert.equal(out.source, "coingecko");
  assert.equal(out.history.length, 40);
  assert.equal(typeof out.ta.sma, "number");
  assert.equal(typeof out.ta.rsi, "number");
  assert.equal(typeof out.ret, "number");
});

test("news returns article links and still joins headlines for the verdict", async () => {
  const h = createHandlers({
    env: { FINNHUB_API_KEY: "k" },
    now: () => Date.parse("2026-10-11T12:00:00Z"),
    fetchImpl: async () => json([
      { headline: "  TSMC reports  ", url: "https://news.example/tsmc" },
      { headline: "Skip me", url: "javascript:alert(1)" },
      { headline: "", url: "https://news.example/empty" },
      { headline: "No url story", url: "" },
      { headline: "Third", url: "http://news.example/third" },
      { headline: "Sixth is dropped", url: "https://news.example/sixth" },
    ]),
  });
  const out = await h.news("NVDA");
  assert.equal(out.news, "TSMC reports | Skip me | No url story | Third");
  assert.deepEqual(out.articles, [
    { headline: "TSMC reports", url: "https://news.example/tsmc" },
    { headline: "Skip me", url: null },
    { headline: "No url story", url: null },
    { headline: "Third", url: "http://news.example/third" },
  ]);
});

test("news without a Finnhub key does not invent links", async () => {
  const h = createHandlers({ env: {}, now: () => 0, fetchImpl: async () => { throw new Error("should not fetch"); } });
  const out = await h.news("NVDA");
  assert.equal(out.news, null);
  assert.equal(out.articles, undefined);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createBot, mapStatus } from "./bot.mjs";

const calm = { ret: 0.3, vol: 1.9, ta: { trend: "uptrend", rsi: 58, sma: 117.8, low: 114 } };
function mk({ price = 118, status = "regular", news = null, an = calm, tickers = ["NVDA"], cfg = {} } = {}) {
  const env = { price, status, news, an };
  const handlers = {
    prices: async () => ({ prices: Object.fromEntries(tickers.map((t) => [t, { onp: env.price, refp: env.price, marketStatus: env.status }])) }),
    analysis: async () => env.an,
    news: async () => ({ news: env.news }),
  };
  return { env, bot: createBot({ handlers, tickers, cfg }) };
}

test("mapStatus: unknown -> closed", () => {
  assert.equal(mapStatus("open"), "regular");
  assert.equal(mapStatus("postMarket"), "offhours");
  assert.equal(mapStatus("weird"), "closed");
});
test("buys $50 x size on a clean buy and logs the reason", async () => {
  const { bot } = mk(); const s = await bot.tick();
  assert.equal(s.positions.length, 1); assert.equal(s.cash, 9950);
  assert.match(s.log[0].text, /NVDA liya \$50/);
});
test("does not buy when market closed, crisis or serious news", async () => {
  for (const o of [{ status: "closed" }, { an: { ...calm, ret: -20, vol: 15 } }, { news: "SEC investigation into fraud" }]) {
    const { bot } = mk(o); const s = await bot.tick(); assert.equal(s.positions.length, 0);
  }
});
test("caution news halves the buy to $25", async () => {
  const { bot } = mk({ news: "Sales miss estimates" }); const s = await bot.tick(); assert.equal(s.cash, 9975);
});
test("no double buy on the second tick", async () => {
  const { bot } = mk(); await bot.tick(); const s = await bot.tick(); assert.equal(s.positions.length, 1);
});
test("stop-loss and take-profit sell, with outcome + features saved", async () => {
  let t = mk(); await t.bot.tick(); t.env.price = 118 * 0.94; let s = await t.bot.tick();
  assert.equal(s.positions.length, 0); assert.match(s.closed[0].exitReason, /stop-loss/); assert.equal(s.closed[0].features.regime, "Risk-On");
  t = mk(); await t.bot.tick(); t.env.price = 118 * 1.09; s = await t.bot.tick();
  assert.match(s.closed[0].exitReason, /take-profit/);
});
test("serious news on a held position forces a sell; 'wait' (closed market) holds", async () => {
  let t = mk(); await t.bot.tick(); t.env.status = "closed"; let s = await t.bot.tick(); assert.equal(s.positions.length, 1);
  t.env.status = "regular"; t.env.news = "Company halts trading, fraud probe"; s = await t.bot.tick(); assert.equal(s.positions.length, 0);
});
test("max positions respected", async () => {
  const { bot } = mk({ tickers: ["A","B","C"], cfg: { maxPositions: 2 } }); const s = await bot.tick(); assert.equal(s.positions.length, 2);
});
test("glitched price is never traded", async () => {
  const t = mk({ tickers: ["X"] });
  t.bot = createBot({ tickers: ["X"], handlers: {
    prices: async () => ({ prices: { X: { onp: 1180, refp: 118, marketStatus: "regular" } } }), analysis: async () => calm, news: async () => ({ news: null }) } });
  assert.equal((await t.bot.tick()).positions.length, 0);
});
test("state persists to disk and reloads", async () => {
  const fs = await import("node:fs/promises"); const p = (await import("node:os")).tmpdir() + "/bot_state_test.json"; await fs.rm(p, { force: true });
  const a = mk(); const h = { prices: async () => ({ prices: { NVDA: { onp: 118, refp: 118, marketStatus: "regular" } } }), analysis: async () => calm, news: async () => ({ news: null }) };
  const b1 = createBot({ handlers: h, tickers: ["NVDA"], statePath: p }); await b1.tick();
  const b2 = createBot({ handlers: h, tickers: ["NVDA"], statePath: p }); await b2.load();
  assert.equal(Object.keys(b2.state.positions).length, 1); assert.equal(b2.state.cash, 9950);
});

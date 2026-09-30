/**
 * server.mjs — run with:   node server.mjs
 * Then open:               http://localhost:8787
 *
 * Needs these keys, either in D:\task1\.env (recommended) or as terminal env vars:
 *   BINANCE_API_KEY, BINANCE_API_SECRET   (required)
 *   FINNHUB_API_KEY                       (optional — enables the news headlines)
 *
 * Serves the dashboard AND the /api/* routes from one origin, so the page can
 * fetch live data with plain relative URLs (no CORS setup, no secrets in the browser).
 * Binds to 127.0.0.1 by default = only your own laptop can reach it.
 */

import http from "node:http";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Load D:\task1\.env (git-ignored) so keys are not typed every time. Real env vars still win.
try { process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url))); } catch { /* no .env: use terminal env vars */ }
import { createHandlers } from "./lib.mjs";
import { createBot } from "./bot.mjs";

const env = process.env;
if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
  console.error('Missing BINANCE_API_KEY / BINANCE_API_SECRET. In PowerShell:\n  $env:BINANCE_API_KEY="..."\n  $env:BINANCE_API_SECRET="..."');
  process.exit(1);
}

const h = createHandlers({ env });
// Autonomous paper bot: runs server-side, keeps going with the browser closed. BOT=off disables it.
const bot = createBot({ handlers: h, statePath: fileURLToPath(new URL("./bot_state.json", import.meta.url)) });
if (env.BOT !== "off") bot.start(Number(env.BOT_INTERVAL_MS || 5 * 60_000));
const PORT = Number(env.PORT || 8787);
const HOST = env.HOST || "127.0.0.1";

const parseTickers = (s) =>
  (s || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9.]{1,10}$/.test(x)).slice(0, 40);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, body, type = "application/json") => {
    res.writeHead(code, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  };
  try {
    if (url.pathname === "/api/prices") return send(200, await h.prices(parseTickers(url.searchParams.get("tickers"))));
    if (url.pathname === "/api/analysis") return send(200, await h.analysis(parseTickers(url.searchParams.get("ticker"))[0]));
    if (url.pathname === "/api/news") return send(200, await h.news(parseTickers(url.searchParams.get("ticker"))[0]));
    if (url.pathname === "/api/bot") return send(200, bot.snapshot());
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(200, await fs.readFile(new URL("./public/index.html", import.meta.url), "utf8"), "text/html; charset=utf-8");
    }
    if (url.pathname === "/verdict.mjs") {
      return send(200, await fs.readFile(new URL("./verdict.mjs", import.meta.url), "utf8"), "text/javascript; charset=utf-8");
    }
    send(404, { error: "not found" });
  } catch (e) {
    send(502, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => console.log(`RegimeShift live proxy → http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`));

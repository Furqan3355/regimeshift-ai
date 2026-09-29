/**
 * server.mjs — run with:   node server.mjs
 * Then open:               http://localhost:8787
 *
 * Needs env vars (set in the SAME terminal first):
 *   BINANCE_API_KEY, BINANCE_API_SECRET   (required)
 *   FINNHUB_API_KEY                       (optional — enables the news headlines)
 *
 * Serves the dashboard AND the /api/* routes from one origin, so the page can
 * fetch live data with plain relative URLs (no CORS setup, no secrets in the browser).
 * Binds to 127.0.0.1 by default = only your own laptop can reach it.
 */

import http from "node:http";
import fs from "node:fs/promises";
import { createHandlers } from "./lib.mjs";

const env = process.env;
if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
  console.error('Missing BINANCE_API_KEY / BINANCE_API_SECRET. In PowerShell:\n  $env:BINANCE_API_KEY="..."\n  $env:BINANCE_API_SECRET="..."');
  process.exit(1);
}

const h = createHandlers({ env });
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
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(200, await fs.readFile(new URL("./public/index.html", import.meta.url), "utf8"), "text/html; charset=utf-8");
    }
    send(404, { error: "not found" });
  } catch (e) {
    send(502, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => console.log(`RegimeShift live proxy → http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`));

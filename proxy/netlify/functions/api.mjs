import { createHandlers } from "../../lib.mjs";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "cache-control": "no-store",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers });

const parseTickers = (s) =>
  (s || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9.]{1,10}$/.test(x)).slice(0, 40);

function apiPath(req) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("path");
  const raw = fromQuery || url.pathname;
  const at = raw.indexOf("/api/");
  return at >= 0 ? raw.slice(at) : raw;
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const url = new URL(req.url);
  const path = apiPath(req);
  if (path === "/api/health") {
    return json(200, {
      ok: true,
      path,
      binance: Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET),
      news: Boolean(process.env.FINNHUB_API_KEY),
    });
  }

  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    return json(503, { error: "BINANCE_API_KEY / BINANCE_API_SECRET are not set on the proxy" });
  }

  const h = createHandlers({ env: process.env });
  try {
    if (path === "/api/prices") return json(200, await h.prices(parseTickers(url.searchParams.get("tickers"))));
    if (path === "/api/analysis") return json(200, await h.analysis(parseTickers(url.searchParams.get("ticker"))[0]));
    if (path === "/api/news") return json(200, await h.news(parseTickers(url.searchParams.get("ticker"))[0]));
    if (path === "/api/bot") return json(503, { error: "The paper bot stays on the long-running proxy process" });
    return json(404, { error: "not found" });
  } catch (e) {
    return json(502, { error: String(e.message || e) });
  }
};

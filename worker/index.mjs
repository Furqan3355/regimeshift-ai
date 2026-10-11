import { createHandlers } from "../proxy/lib.mjs";

const parseTickers = (s) =>
  (s || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9.]{1,10}$/.test(x)).slice(0, 40);

let handlers;

export default {
  async fetch(req, env) {
    handlers ??= createHandlers({ env });
    const url = new URL(req.url);
    const send = (code, body) =>
      new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    if (env.PROXY_SECRET && req.headers.get("x-proxy-secret") !== env.PROXY_SECRET) return send(401, { error: "unauthorized" });
    try {
      if (url.pathname === "/api/prices") return send(200, await handlers.prices(parseTickers(url.searchParams.get("tickers"))));
      if (url.pathname === "/api/analysis") return send(200, await handlers.analysis(parseTickers(url.searchParams.get("ticker"))[0]));
      if (url.pathname === "/api/news") return send(200, await handlers.news(parseTickers(url.searchParams.get("ticker"))[0]));
      if (url.pathname === "/api/bot") return send(503, { error: "bot runs on BNB Agent Studio, not on this worker" });
      return send(404, { error: "not found" });
    } catch (e) {
      console.error(e);
      return send(502, { error: "upstream error" });
    }
  },
};

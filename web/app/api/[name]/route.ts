import { createHandlers } from "../../../../proxy/lib.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parseTickers = (s: string | null) =>
  (s || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z0-9.]{1,10}$/.test(x)).slice(0, 40);

const handlers = createHandlers({ env: process.env as Record<string, string | undefined> });

const json = (code: number, body: unknown) =>
  new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const q = new URL(req.url).searchParams;
  try {
    if (name === "prices") return json(200, await handlers.prices(parseTickers(q.get("tickers"))));
    if (name === "analysis") return json(200, await handlers.analysis(parseTickers(q.get("ticker"))[0]));
    if (name === "news") return json(200, await handlers.news(parseTickers(q.get("ticker"))[0]));
    if (name === "bot") return json(503, { error: "bot runs on BNB Agent Studio" });
    return json(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return json(502, { error: "upstream error" });
  }
}

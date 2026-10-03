import type { MarketStatus } from "./types";

/** Fetch JSON from the local proxy (rewritten to proxy/server.mjs by next.config.ts). */
export async function api<T>(path: string): Promise<T> {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

/** Same mapping as proxy/bot.mjs: anything unknown is treated as closed (the safe default). */
export function mapStatus(s?: string): MarketStatus {
  const v = (s || "").toLowerCase();
  if (v === "regular" || v === "open") return "regular";
  if (["premarket", "postmarket", "overnight", "offhours", "extended"].includes(v)) return "offhours";
  return "closed";
}

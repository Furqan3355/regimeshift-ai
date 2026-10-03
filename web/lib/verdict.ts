// The buy / wait / skip rules live ONLY in proxy/verdict.mjs, shared with the
// paper bot and its tests. This file just adds types; never re-implement rules here.
import { decide as decideJs, OFFHOURS as OFFHOURS_JS } from "../../proxy/verdict.mjs";
import type { MarketStatus, TickerData, Verdict } from "./types";

export const decide = decideJs as (d: TickerData & { ticker: string }) => Verdict;

/** Position-size multiplier per market status (read-only, for labels). */
export const OFFHOURS = OFFHOURS_JS as Record<MarketStatus, { m: number; label: string }>;

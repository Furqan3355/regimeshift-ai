// Run:  npx tsx try_pipeline.ts     (from regimeshiftagent\app\agent)
// Runs the deterministic pipeline directly (no LLM, no network) so you can SEE the verdict rules working.
import { runRegimeShiftPipeline } from "./src/regimeShiftBridge.js";

const base = { ticker: "NVDA", returnPct: 0.15, volatilityPct: 1.1, onChainPrice: 230.05, referencePrice: 230.02, marketStatus: "regular" };
const cases: Array<[string, Record<string, unknown>]> = [
  ["calm market -> expect buy, full size", {}],
  ["Defensive volatility -> expect buy, half size", { returnPct: -0.2, volatilityPct: 5.3 }],
  ["Crisis -> expect skip", { returnPct: -25, volatilityPct: 16 }],
  ["market closed -> expect wait", { marketStatus: "closed" }],
  ["price glitch 10x -> expect skip", { onChainPrice: 2300.5 }],
];
for (const [label, patch] of cases) {
  const r = (await runRegimeShiftPipeline({ ...base, ...patch } as any)) as Record<string, any>;
  console.log(`\n=== ${label}`);
  console.log({ regime: r.regime, verdict: r.verdict, should_trade: r.should_trade, size: r.position_size_multiplier, news: r.news_check?.source });
  console.log("reasons:", r.verdict_reasons);
}
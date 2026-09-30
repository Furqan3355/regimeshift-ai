// Run:  npx tsx parity_check.ts      (from regimeshiftagent\app\agent)
// Proves the agent's verdict (verdictRules.ts) gives the SAME answer as the dashboard's decide() (proxy/verdict.mjs).
import gmmParamsJson from "./src/gmm_params.json" with { type: "json" };
import { evaluateToken, isAnomalousSpread, computeSpreadPct, type GmmParams } from "./src/regimeEngine.js";
import { applyVerdictRules } from "./src/verdictRules.js";
// @ts-ignore - plain JS module shared with the dashboard
import { decide, NEWS_SERIOUS, NEWS_CAUTION } from "../../../proxy/verdict.mjs";
import * as V from "./src/verdictRules.js";

const P = gmmParamsJson as unknown as GmmParams;
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const NEWS = [null, "Nvidia demand remains strong", "Sales miss estimates | Stock steady", "SEC investigation into fraud", "Growth slows in key markets", "Company halts trading", "Record profit, upgrade"];
const MKT = ["regular", "offhours", "closed", "weird"];
const PRICES: Array<[number, number]> = [[118.96, 118.96], [119.9, 118.96], [123, 118.96], [1189.6, 118.96], [59.48, 118.96], [118.0, 118.96]];

let n = 0, bad = 0;
for (let i = 0; i < 20000; i++) {
  const ret = (rnd() - 0.6) * 30, vol = 0.3 + rnd() * 20;
  const [onp, refp] = pick(PRICES), mkt = pick(MKT), news = pick(NEWS);
  const d = decide({ ticker: "T", ret, vol, onp, refp, mkt, ta: { trend: "up", rsi: 55, sma: 117.8, low: 114 }, news });
  const spread = computeSpreadPct(onp, refp), anom = isAnomalousSpread(onp, refp);
  const ev = evaluateToken(P, [ret, vol], spread, anom, mkt, 1.0);
  const f = applyVerdictRules(ev, anom, news);
  n++;
  if (d.verdict !== f.verdict || Math.abs(d.size - f.position_size_multiplier) > 1e-9 || d.regime !== ev.regime) {
    bad++; if (bad <= 5) console.log("MISMATCH", { ret, vol, onp, refp, mkt, news, dash: [d.verdict, d.size, d.regime], agent: [f.verdict, f.position_size_multiplier, ev.regime] });
  }
}
const sameLists = JSON.stringify(NEWS_SERIOUS) === JSON.stringify(V.NEWS_SERIOUS) && JSON.stringify(NEWS_CAUTION) === JSON.stringify(V.NEWS_CAUTION);
console.log(`${n} random cases, ${bad} mismatches. News keyword lists identical: ${sameLists}`);
process.exit(bad === 0 && sameLists ? 0 : 1);
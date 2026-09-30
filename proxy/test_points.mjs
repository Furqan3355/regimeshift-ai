// Picks a test input (ret, vol) that the CURRENT model confidently puts in a given regime,
// so tests keep working after every retrain (no hand-picked numbers to re-edit).
import { predictRegime } from "./verdict.mjs";

export function pointFor(label) {
  let best = null;
  for (let ret = -30; ret <= 10; ret += 0.5) {
    for (let vol = 0.5; vol <= 25; vol += 0.5) {
      const p = predictRegime(ret, vol);
      if (p.regime === label && (!best || p.conf > best.conf)) best = { ret, vol, conf: p.conf };
    }
  }
  if (!best) throw new Error(`no test point found for regime ${label}`);
  return { ret: best.ret, vol: best.vol };
}

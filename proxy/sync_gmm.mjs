// Usage (from proxy\):  node sync_gmm.mjs
// Copies weights/means/covariances/labels from ../gmm_params.json into the GMM block of verdict.mjs.
import fs from "node:fs";
const p = JSON.parse(fs.readFileSync(new URL("../gmm_params.json", import.meta.url), "utf8"));
const labels = p.weights.map((_, i) => p.cluster_to_regime[String(i)]);
const block = `export const GMM = {
  weights: ${JSON.stringify(p.weights)},
  means: ${JSON.stringify(p.means)},
  covariances: ${JSON.stringify(p.covariances)},
  labels: ${JSON.stringify(labels)},
};`;
const f = new URL("./verdict.mjs", import.meta.url);
const src = fs.readFileSync(f, "utf8");
const out = src.replace(/export const GMM = \{[\s\S]*?\n\};/, block);
if (out === src) console.log("verdict.mjs already matches gmm_params.json");
else { fs.writeFileSync(f, out); console.log("verdict.mjs GMM updated. Labels:", labels.join(", ")); }

// Summary of what each regime means in the current model (for README + sanity check)
console.log("\nRegime summary (weight, mean return %, mean volatility %):");
labels.forEach((l, i) => console.log(`  ${l.padEnd(10)} w=${p.weights[i].toFixed(3)}  ret=${p.means[i][0].toFixed(2)}  vol=${p.means[i][1].toFixed(2)}  (sd ret ${Math.sqrt(p.covariances[i][0][0]).toFixed(2)}, sd vol ${Math.sqrt(p.covariances[i][1][1]).toFixed(2)})`));

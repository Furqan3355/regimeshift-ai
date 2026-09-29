/**
 * regimeEngine.ts
 * ----------------
 * TypeScript port of ml_engine.py's PREDICT-side logic, for use inside the
 * BNB Agent Studio Node.js agent (AgentCore's managed Node.js runtime has no
 * Python interpreter, so all inference must be pure TS/JS).
 *
 * The GMM is NOT trained here -- training still happens in Python
 * (export/export_gmm_params.py), which fits sklearn's GaussianMixture and
 * dumps its fitted weights/means/covariances to gmm_params.json. This file
 * loads that JSON and re-implements sklearn's predict_proba() math
 * (multivariate Gaussian PDF + Bayes mixing) by hand, so predictions here
 * match the original Python model's predict_proba() to numerical precision.
 *
 * Mirrors, 1:1:
 *   - RegimeClassifier.predict()          -> predictRegime()
 *   - is_efficient_entry()                -> isEfficientEntry()
 *   - get_off_hours_adjustment()          -> getOffHoursAdjustment()
 *   - evaluate_token()                    -> evaluateToken()
 *   - data_ingestion.compute_spread()'s   -> isAnomalousSpread()
 *     anomaly check (SUSPICIOUS_RATIOS / RATIO_TOLERANCE)
 */

// ---------- Types ----------

export interface GmmParams {
  n_components: number;
  weights: number[];          // (3,)
  means: number[][];          // (3, 2)
  covariances: number[][][];  // (3, 2, 2) full covariance matrices
  cluster_to_regime: Record<string, string>; // {"0": "Risk-On", ...}
  feature_names: string[];
  regime_order: string[];
}

export interface RegimePrediction {
  regime: string;
  confidence: number;
  raw_probabilities: Record<string, number>;
}

export interface EntryEfficiency {
  efficient: boolean;
  reason: string;
}

export interface OffHoursAdjustment {
  position_size_multiplier: number;
  slippage_tolerance_pct: number | null;
}

export interface TokenEvaluation {
  regime: string;
  confidence: number;
  entry_efficient: boolean;
  entry_reason: string;
  market_status: string;
  position_size_multiplier: number;
  slippage_tolerance_pct: number | null;
  should_trade: boolean;
}

// ---------- GMM math (mirrors sklearn GaussianMixture.predict_proba) ----------

/** 2x2 matrix inverse and determinant -- our covariances are always 2x2
 *  (feature_matrix is [return_pct, volatility_pct]). If you ever add a 3rd
 *  feature, generalize this to full Gaussian elimination. */
function inv2x2(m: number[][]): { inv: number[][]; det: number } {
  const [[a, b], [c, d]] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-300) {
    throw new Error("Singular covariance matrix -- cannot invert");
  }
  const inv = [
    [d / det, -b / det],
    [-c / det, a / det],
  ];
  return { inv, det };
}

/** log N(x | mean, cov) for a 2D multivariate Gaussian. */
function logMultivariateNormalPdf(
  x: number[],
  mean: number[],
  cov: number[][],
): number {
  const k = x.length;
  const { inv, det } = inv2x2(cov);
  const diff = [x[0] - mean[0], x[1] - mean[1]];
  // diff^T * inv * diff
  const quad =
    diff[0] * (inv[0][0] * diff[0] + inv[0][1] * diff[1]) +
    diff[1] * (inv[1][0] * diff[0] + inv[1][1] * diff[1]);
  const logDet = Math.log(det);
  return -0.5 * (k * Math.log(2 * Math.PI) + logDet + quad);
}

/**
 * Re-implements sklearn's GaussianMixture.predict_proba(): computes each
 * component's weighted log-likelihood, then normalizes via log-sum-exp to
 * get posterior responsibilities (the cluster probabilities).
 */
function gmmPredictProba(params: GmmParams, featureVector: number[]): number[] {
  const logWeighted = params.weights.map((w, i) =>
    Math.log(w) +
    logMultivariateNormalPdf(featureVector, params.means[i], params.covariances[i]),
  );
  const maxLog = Math.max(...logWeighted);
  const expSum = logWeighted.reduce((s, lw) => s + Math.exp(lw - maxLog), 0);
  const logNorm = maxLog + Math.log(expSum);
  return logWeighted.map((lw) => Math.exp(lw - logNorm));
}

/** Mirrors RegimeClassifier.predict(). */
export function predictRegime(
  params: GmmParams,
  featureVector: number[],
): RegimePrediction {
  const probabilities = gmmPredictProba(params, featureVector);
  let bestCluster = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if (probabilities[i] > probabilities[bestCluster]) bestCluster = i;
  }
  const regime = params.cluster_to_regime[String(bestCluster)] ?? `Regime-${bestCluster}`;
  const confidence = Math.round(probabilities[bestCluster] * 10000) / 10000;

  const raw_probabilities: Record<string, number> = {};
  probabilities.forEach((p, i) => {
    const name = params.cluster_to_regime[String(i)] ?? `Regime-${i}`;
    raw_probabilities[name] = Math.round(p * 10000) / 10000;
  });

  return { regime, confidence, raw_probabilities };
}

// ---------- Spread anomaly check (mirrors data_ingestion.compute_spread) ----------

const SUSPICIOUS_RATIOS = [2, 4, 5, 10, 15];
const RATIO_TOLERANCE = 0.02; // 2% -- matches config.py comment: 1% missed SOXS (0.1017 vs 0.1)

/** Mirrors the is_anomalous flag inside data_ingestion.compute_spread(). */
export function isAnomalousSpread(onChainPrice: number, referencePrice: number): boolean {
  if (referencePrice === 0) {
    throw new Error("reference_price cannot be zero when computing spread");
  }
  const ratio = onChainPrice / referencePrice;
  for (const suspicious of SUSPICIOUS_RATIOS) {
    for (const candidate of [suspicious, 1 / suspicious]) {
      if (Math.abs(ratio - candidate) / candidate <= RATIO_TOLERANCE) {
        return true;
      }
    }
  }
  return false;
}

/** Mirrors data_ingestion.compute_spread()'s spread_pct calculation. */
export function computeSpreadPct(onChainPrice: number, referencePrice: number): number {
  if (referencePrice === 0) {
    throw new Error("reference_price cannot be zero when computing spread");
  }
  return ((onChainPrice - referencePrice) / referencePrice) * 100;
}

// ---------- Originality signal 1: spread-aware entry gating ----------

/** Mirrors is_efficient_entry(). */
export function isEfficientEntry(
  spreadPct: number,
  isAnomalous: boolean,
  maxSpreadPct = 1.0,
): EntryEfficiency {
  if (isAnomalous) {
    return {
      efficient: false,
      reason: "Spread flagged as anomalous (likely data/scale mismatch, not real market signal)",
    };
  }
  if (Math.abs(spreadPct) <= maxSpreadPct) {
    return { efficient: true, reason: `Spread ${spreadPct}% within ${maxSpreadPct}% threshold` };
  }
  return {
    efficient: false,
    reason: `Spread ${spreadPct}% exceeds ${maxSpreadPct}% threshold -- entry cost too high`,
  };
}

// ---------- Originality signal 2: off-hours awareness ----------

/** Mirrors OFF_HOURS_ADJUSTMENTS. */
const OFF_HOURS_ADJUSTMENTS: Record<string, OffHoursAdjustment> = {
  regular:    { position_size_multiplier: 1.0, slippage_tolerance_pct: 0.5 },
  premarket:  { position_size_multiplier: 0.5, slippage_tolerance_pct: 1.0 },
  postmarket: { position_size_multiplier: 0.5, slippage_tolerance_pct: 1.0 },
  offhours:   { position_size_multiplier: 0.3, slippage_tolerance_pct: 1.5 },
  overnight:  { position_size_multiplier: 0.3, slippage_tolerance_pct: 1.5 },
  closed:     { position_size_multiplier: 0.0, slippage_tolerance_pct: null },
  pause:      { position_size_multiplier: 0.0, slippage_tolerance_pct: null },
};

/** Mirrors get_off_hours_adjustment(). Unknown statuses -> safest default. */
export function getOffHoursAdjustment(marketStatus: string): OffHoursAdjustment {
  return (
    OFF_HOURS_ADJUSTMENTS[marketStatus] ?? {
      position_size_multiplier: 0.0,
      slippage_tolerance_pct: null,
    }
  );
}

// ---------- Combined: mirrors evaluate_token() ----------

export function evaluateToken(
  params: GmmParams,
  featureVector: number[],
  spreadPct: number,
  isAnomalous: boolean,
  marketStatus: string,
  maxSpreadPct = 1.0,
): TokenEvaluation {
  const regimeResult = predictRegime(params, featureVector);
  const entryResult = isEfficientEntry(spreadPct, isAnomalous, maxSpreadPct);
  const hoursResult = getOffHoursAdjustment(marketStatus);

  const shouldTrade = entryResult.efficient && hoursResult.position_size_multiplier > 0;

  return {
    regime: regimeResult.regime,
    confidence: regimeResult.confidence,
    entry_efficient: entryResult.efficient,
    entry_reason: entryResult.reason,
    market_status: marketStatus,
    position_size_multiplier: hoursResult.position_size_multiplier,
    slippage_tolerance_pct: hoursResult.slippage_tolerance_pct,
    should_trade: shouldTrade,
  };
}
"""
export_gmm_params.py
---------------------
Trains the SAME GaussianMixture model as ml_engine.RegimeClassifier, then
dumps its fitted parameters (means, covariances, weights, cluster->regime
label mapping) to a JSON file. This file is consumed by the TypeScript
inference module (regimeEngine.ts) inside the BNB Agent Studio agent, so the
deployed Node.js runtime never needs a Python interpreter -- ONLY training
happens in Python, prediction happens in TS using the exported parameters.

Usage:
    python export_gmm_params.py --out gmm_params.json

Replace `load_training_features()` below with your REAL historical
[return_pct, volatility_pct] samples (e.g. pulled via data_ingestion.py +
fetch_candles / calculate_volatility across your token universe). A small
synthetic placeholder is included so this script runs standalone for now.
"""

import argparse
import json
import sys
import os

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml_engine import RegimeClassifier  # noqa: E402


def load_training_features(real_data_path: str = "real_features.json") -> np.ndarray:
    """
    Prefers REAL [return_pct, volatility_pct] samples collected by
    collect_training_data.py (run that first: it pulls live candles across
    many tokens via your tested Phase 1 code and writes real_features.json).

    Falls back to a small SYNTHETIC placeholder (3 separated blobs) only when
    real_features.json isn't found yet -- so this script still runs
    standalone before you've collected real data, but clearly warns that the
    resulting model is not fit for real trading decisions.
    """
    if os.path.exists(real_data_path):
        with open(real_data_path) as f:
            payload = json.load(f)
        features = np.array(payload["features"], dtype=float)
        print(f"Loaded {len(features)} REAL samples from {real_data_path} "
              f"(tickers: {', '.join(payload.get('tickers_used', []))})")
        return features

    print(f"WARNING: {real_data_path} not found -- using SYNTHETIC placeholder data. "
          f"Run collect_training_data.py first for a model fit for real trading. "
          f"This synthetic model is for pipeline testing only.")
    rng = np.random.default_rng(42)
    risk_on = rng.normal(loc=[0.3, 0.8], scale=[0.2, 0.3], size=(40, 2))
    defensive = rng.normal(loc=[0.0, 2.0], scale=[0.3, 0.4], size=(40, 2))
    crisis = rng.normal(loc=[-1.5, 5.0], scale=[0.5, 1.0], size=(40, 2))
    return np.vstack([risk_on, defensive, crisis])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="gmm_params.json")
    args = parser.parse_args()

    features = load_training_features()

    clf = RegimeClassifier(n_regimes=3, random_state=42)
    clf.fit(features)

    gmm = clf.model
    cluster_to_regime = clf._cluster_to_regime  # {cluster_idx: "Risk-On"/...}

    params = {
        "n_components": int(gmm.n_components),
        "weights": gmm.weights_.tolist(),               # shape (3,)
        "means": gmm.means_.tolist(),                    # shape (3, 2)
        "covariances": gmm.covariances_.tolist(),         # shape (3, 2, 2) full covariance
        "cluster_to_regime": {str(k): v for k, v in cluster_to_regime.items()},
        "feature_names": ["return_pct", "volatility_pct"],
        "regime_order": RegimeClassifier.REGIME_NAMES,
    }

    with open(args.out, "w") as f:
        json.dump(params, f, indent=2)

    print(f"Wrote {args.out}")
    print(json.dumps({"cluster_to_regime": params["cluster_to_regime"]}, indent=2))

    # sanity check: compare a few predictions to sklearn directly
    test_points = [[0.3, 0.8], [0.0, 2.0], [-1.5, 5.0]]
    for pt in test_points:
        result = clf.predict(pt)
        print(f"  {pt} -> {result['regime']} (confidence={result['confidence']})")


if __name__ == "__main__":
    main()
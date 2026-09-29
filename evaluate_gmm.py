"""
evaluate_gmm.py
-----------------
Evaluates the RegimeClassifier GMM for over/underfitting, since it's an
UNSUPERVISED model (no ground-truth "this day was Risk-On" labels exist, so
accuracy/precision/recall don't apply here -- those need labeled data).

What this checks instead:
  1. Train/test log-likelihood gap -> overfitting signal
     (fit on 80%, score on held-out 20%; a big gap = the model memorized
     the training set's noise instead of learning the real structure)
  2. BIC/AIC across n_components = 2..6 -> is 3 the right number of regimes?
     (lower BIC/AIC is better; if BIC keeps dropping past 3, your 3 hardcoded
     regimes may be splitting/merging real structure)
  3. Silhouette score -> are the 3 clusters well-separated, or mushed together?
     (range -1..1; near 0 or negative = clusters overlap heavily = the labels
     "Risk-On/Defensive/Crisis" are not really distinguishable in this data)
  4. Cluster balance -> does any regime get a tiny/degenerate share of the data?
     (a cluster with <2% weight, like the garbage-data run you just had,
     means that "regime" isn't really being learned -- it's fitting outliers)

Usage:
    python evaluate_gmm.py --data real_features.json
"""

import argparse
import json

import numpy as np
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score
from sklearn.model_selection import train_test_split


def load_features(path: str) -> np.ndarray:
    with open(path) as f:
        payload = json.load(f)
    return np.array(payload["features"], dtype=float)


def check_train_test_gap(features: np.ndarray, n_components: int, random_state: int = 42):
    train, test = train_test_split(features, test_size=0.2, random_state=random_state)

    gmm = GaussianMixture(n_components=n_components, random_state=random_state)
    gmm.fit(train)

    train_ll = gmm.score(train)  # mean log-likelihood per sample
    test_ll = gmm.score(test)
    gap = train_ll - test_ll

    print(f"\n[1] Train/test log-likelihood (n_components={n_components}):")
    print(f"    train: {train_ll:.4f}   test: {test_ll:.4f}   gap: {gap:.4f}")
    if gap > 0.5:
        print("    -> WARNING: sizeable gap, possible overfitting. Consider more data,")
        print("       fewer components, or regularization (reg_covar param).")
    elif test_ll < train_ll - 0.05 and abs(gap) <= 0.5:
        print("    -> gap is small, looks like normal generalization (not overfit).")
    else:
        print("    -> test score close to or above train score: no overfitting signal.")
    return gap


def check_bic_aic(features: np.ndarray, max_components: int = 6, random_state: int = 42):
    print(f"\n[2] BIC/AIC across n_components = 2..{max_components} (lower = better fit-vs-complexity tradeoff):")
    results = []
    for k in range(2, max_components + 1):
        gmm = GaussianMixture(n_components=k, random_state=random_state)
        gmm.fit(features)
        bic = gmm.bic(features)
        aic = gmm.aic(features)
        results.append((k, bic, aic))
        marker = " <- you're using this" if k == 3 else ""
        print(f"    k={k}: BIC={bic:.1f}  AIC={aic:.1f}{marker}")

    best_bic_k = min(results, key=lambda r: r[1])[0]
    if best_bic_k != 3:
        print(f"    -> NOTE: BIC prefers k={best_bic_k} components, not 3. This doesn't mean")
        print(f"       3 is wrong (Risk-On/Defensive/Crisis is a deliberate business choice,")
        print(f"       not a pure statistical one) but it's worth knowing k=3 isn't the")
        print(f"       statistically 'cleanest' fit for this data.")
    else:
        print(f"    -> BIC agrees: k=3 is the best statistical fit too.")


def check_silhouette(features: np.ndarray, n_components: int, random_state: int = 42):
    gmm = GaussianMixture(n_components=n_components, random_state=random_state)
    labels = gmm.fit_predict(features)
    score = silhouette_score(features, labels)
    print(f"\n[3] Silhouette score (cluster separation quality): {score:.4f}")
    if score < 0.15:
        print("    -> LOW: clusters overlap heavily. Regime boundaries are fuzzy in this")
        print("       feature space -- consider adding features beyond [return, volatility]")
        print("       (e.g. volume, correlation-to-index) for cleaner separation.")
    elif score < 0.4:
        print("    -> MODERATE: some real separation, some overlap. Usable but not crisp.")
    else:
        print("    -> GOOD: clusters are well-separated.")
    return labels, score


def check_cluster_balance(features: np.ndarray, n_components: int, random_state: int = 42):
    gmm = GaussianMixture(n_components=n_components, random_state=random_state)
    labels = gmm.fit_predict(features)
    print(f"\n[4] Cluster balance (n={len(features)} samples):")
    degenerate = False
    for k in range(n_components):
        count = int((labels == k).sum())
        pct = count / len(features) * 100
        flag = "  <- WARNING: tiny cluster, likely fitting outliers/noise" if pct < 2 else ""
        print(f"    cluster {k}: {count} samples ({pct:.1f}%){flag}")
        if pct < 2:
            degenerate = True
    if degenerate:
        print("    -> Fix: re-check for outliers (see collect_training_data.py's")
        print("       --max-abs-return-pct filter) or collect more data for the rare regime.")
    else:
        print("    -> No degenerate clusters -- all 3 regimes have meaningful representation.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="real_features.json")
    parser.add_argument("--n-components", type=int, default=3)
    args = parser.parse_args()

    features = load_features(args.data)
    print(f"Loaded {len(features)} samples from {args.data}")

    check_train_test_gap(features, args.n_components)
    check_bic_aic(features)
    check_silhouette(features, args.n_components)
    check_cluster_balance(features, args.n_components)

    print("\n" + "=" * 60)
    print("Summary: this is exploratory diagnostics for an UNSUPERVISED model.")
    print("There's no 'accuracy' because there's no ground-truth regime label")
    print("for any historical day. These 4 checks are the standard substitute:")
    print("generalization gap, model-complexity fit, cluster separation, and")
    print("cluster balance. Re-run after any data or n_components change.")
    print("=" * 60)


if __name__ == "__main__":
    main()
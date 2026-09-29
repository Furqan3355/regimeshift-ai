"""
ml_engine.py
------------
Phase 2: Regime classification (GMM) + two originality signals:
  1. Spread-aware entry gating (uses Phase 1's spread_pct / is_anomalous)
  2. Off-hours awareness (uses Phase 1's market_status)

Design note: the GMM is fit on historical feature vectors (returns +
volatility) and labels its own 3 clusters after fitting, by looking at
which cluster has the highest mean volatility (-> Crisis), lowest (-> Risk-On),
and the remaining one (-> Defensive). This avoids hardcoding cluster index
0/1/2 to a regime name, since sklearn's cluster ordering is arbitrary and can
change between fits.
"""

import numpy as np
from sklearn.mixture import GaussianMixture


class MLEngineError(Exception):
    """Raised when the model isn't fit yet, or input data is invalid."""
    pass


class RegimeClassifier:
    REGIME_NAMES = ["Risk-On", "Defensive", "Crisis"]

    def __init__(self, n_regimes: int = 3, random_state: int = 42):
        self.n_regimes = n_regimes
        self.model = GaussianMixture(n_components=n_regimes, random_state=random_state)
        self._is_fit = False
        self._cluster_to_regime = None  # maps GMM's raw cluster index -> regime name

    def fit(self, feature_matrix: np.ndarray) -> None:
        """
        feature_matrix: shape (n_samples, n_features), e.g. columns
        [daily_return_pct, volatility_pct]. At least n_regimes*2 samples needed
        for a stable fit.
        """
        feature_matrix = np.asarray(feature_matrix, dtype=float)
        if feature_matrix.ndim != 2:
            raise MLEngineError("feature_matrix must be 2D: (n_samples, n_features)")
        if feature_matrix.shape[0] < self.n_regimes * 2:
            raise MLEngineError(
                f"Need at least {self.n_regimes * 2} samples to fit {self.n_regimes} regimes, "
                f"got {feature_matrix.shape[0]}"
            )

        self.model.fit(feature_matrix)
        self._is_fit = True
        self._label_clusters(feature_matrix)

    def _label_clusters(self, feature_matrix: np.ndarray) -> None:
        """
        Assigns a human-readable regime name to each of the GMM's raw cluster
        indices, based on that cluster's mean volatility (assumed to be
        feature column index 1). Highest volatility -> Crisis, lowest -> Risk-On,
        middle -> Defensive. If n_regimes != 3, falls back to raw index labels.
        """
        cluster_assignments = self.model.predict(feature_matrix)
        n_features = feature_matrix.shape[1]

        if self.n_regimes != 3 or n_features < 2:
            self._cluster_to_regime = {i: f"Regime-{i}" for i in range(self.n_regimes)}
            return

        # mean volatility (column 1) per cluster
        cluster_volatility = {}
        for cluster_id in range(self.n_regimes):
            mask = cluster_assignments == cluster_id
            if mask.sum() == 0:
                cluster_volatility[cluster_id] = float("inf")  # empty cluster, park it last
            else:
                cluster_volatility[cluster_id] = feature_matrix[mask, 1].mean()

        # sort clusters by volatility ascending: lowest=Risk-On, mid=Defensive, highest=Crisis
        ordered = sorted(cluster_volatility, key=cluster_volatility.get)
        self._cluster_to_regime = {
            ordered[0]: "Risk-On",
            ordered[1]: "Defensive",
            ordered[2]: "Crisis",
        }

    def predict(self, feature_vector) -> dict:
        """
        feature_vector: 1D array-like, e.g. [daily_return_pct, volatility_pct]
        Returns {"regime": str, "confidence": float (0-1), "raw_probabilities": dict}
        """
        if not self._is_fit:
            raise MLEngineError("Call fit() before predict()")

        feature_vector = np.asarray(feature_vector, dtype=float).reshape(1, -1)
        probabilities = self.model.predict_proba(feature_vector)[0]
        best_cluster = int(np.argmax(probabilities))

        regime = self._cluster_to_regime.get(best_cluster, f"Regime-{best_cluster}")
        confidence = float(probabilities[best_cluster])

        raw_probs = {
            self._cluster_to_regime.get(i, f"Regime-{i}"): round(float(p), 4)
            for i, p in enumerate(probabilities)
        }

        return {
            "regime": regime,
            "confidence": round(confidence, 4),
            "raw_probabilities": raw_probs,
        }


# ---------- Originality signal 1: spread-aware entry gating ----------

def is_efficient_entry(spread_pct: float, is_anomalous: bool,
                        max_spread_pct: float = 1.0) -> dict:
    """
    Decides whether the current spread makes this an "efficient entry point"
    for a trade, not just a regime-change trigger.

    - Anomalous spreads (scale-mismatch data bug, see Phase 1) are NEVER
      treated as efficient -- they're excluded entirely, regardless of size.
    - A spread within +/- max_spread_pct of zero is considered efficient
      (on-chain price close to the real reference price -> low-cost entry).
    - A spread outside that band means the token is trading at a meaningful
      premium/discount -- still tradeable, just flagged as inefficient.
    """
    if is_anomalous:
        return {
            "efficient": False,
            "reason": "Spread flagged as anomalous (likely data/scale mismatch, not real market signal)",
        }

    if abs(spread_pct) <= max_spread_pct:
        return {"efficient": True, "reason": f"Spread {spread_pct}% within {max_spread_pct}% threshold"}

    return {
        "efficient": False,
        "reason": f"Spread {spread_pct}% exceeds {max_spread_pct}% threshold -- entry cost too high",
    }


# ---------- Originality signal 2: off-hours awareness ----------

# Position-size / slippage-tolerance multipliers by market status.
# "regular" hours -> full size, normal slippage tolerance.
# Off-hours / overnight -> reduced size, wider slippage tolerance (thinner liquidity).
# Closed / paused -> no new positions.
OFF_HOURS_ADJUSTMENTS = {
    "regular":    {"position_size_multiplier": 1.0,  "slippage_tolerance_pct": 0.5},
    "premarket":  {"position_size_multiplier": 0.5,  "slippage_tolerance_pct": 1.0},
    "postmarket": {"position_size_multiplier": 0.5,  "slippage_tolerance_pct": 1.0},
    "offhours":   {"position_size_multiplier": 0.3,  "slippage_tolerance_pct": 1.5},
    "overnight":  {"position_size_multiplier": 0.3,  "slippage_tolerance_pct": 1.5},
    "closed":     {"position_size_multiplier": 0.0,  "slippage_tolerance_pct": None},
    "pause":      {"position_size_multiplier": 0.0,  "slippage_tolerance_pct": None},
}


def get_off_hours_adjustment(market_status: str) -> dict:
    """
    market_status: one of Phase 1's statusInfo.marketStatus values
    ("regular", "premarket", "postmarket", "offhours", "overnight", "closed", "pause").
    Returns the position-size multiplier and slippage tolerance to apply.
    Unknown statuses default to the safest option (no new positions).
    """
    return OFF_HOURS_ADJUSTMENTS.get(
        market_status,
        {"position_size_multiplier": 0.0, "slippage_tolerance_pct": None},
    )


# ---------- Combined: one call that ties Phase 1 output to a trade decision ----------

def evaluate_token(classifier: RegimeClassifier, feature_vector, spread_pct: float,
                    is_anomalous: bool, market_status: str, max_spread_pct: float = 1.0) -> dict:
    """
    Ties everything together for one token: regime + confidence, entry
    efficiency, and off-hours-adjusted position sizing. This is what
    agent_runtime.py (Phase 4) will call per token, per loop iteration.
    """
    regime_result = classifier.predict(feature_vector)
    entry_result = is_efficient_entry(spread_pct, is_anomalous, max_spread_pct)
    hours_result = get_off_hours_adjustment(market_status)

    should_trade = (
        entry_result["efficient"]
        and hours_result["position_size_multiplier"] > 0
    )

    return {
        "regime": regime_result["regime"],
        "confidence": regime_result["confidence"],
        "entry_efficient": entry_result["efficient"],
        "entry_reason": entry_result["reason"],
        "market_status": market_status,
        "position_size_multiplier": hours_result["position_size_multiplier"],
        "slippage_tolerance_pct": hours_result["slippage_tolerance_pct"],
        "should_trade": should_trade,
    }
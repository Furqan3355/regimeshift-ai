"""
test_ml_engine.py
------------------
Tests for Phase 2: GMM regime classification, spread-aware gating, and
off-hours position sizing. Uses synthetic feature data (returns/volatility)
shaped like real market regimes -- no live API needed for these tests.
Run with: python -m pytest tests/ -v
"""

import sys
import os
import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ml_engine import (
    RegimeClassifier, MLEngineError, is_efficient_entry,
    get_off_hours_adjustment, evaluate_token,
)


def make_synthetic_regime_data(n_per_regime=30, seed=1):
    """
    Builds a synthetic dataset with 3 clearly separated clusters:
    - Risk-On:   high positive returns, low volatility
    - Defensive: near-zero returns, medium volatility
    - Crisis:    negative returns, high volatility
    Columns: [daily_return_pct, volatility_pct]
    """
    rng = np.random.default_rng(seed)
    risk_on = rng.normal(loc=[1.5, 0.8], scale=[0.3, 0.2], size=(n_per_regime, 2))
    defensive = rng.normal(loc=[0.1, 2.0], scale=[0.3, 0.3], size=(n_per_regime, 2))
    crisis = rng.normal(loc=[-2.0, 4.5], scale=[0.4, 0.5], size=(n_per_regime, 2))
    return np.vstack([risk_on, defensive, crisis])


# ---------- RegimeClassifier ----------

def test_fit_requires_minimum_samples():
    clf = RegimeClassifier(n_regimes=3)
    with pytest.raises(MLEngineError):
        clf.fit(np.array([[1.0, 0.5], [0.9, 0.4]]))  # only 2 samples, need >= 6


def test_predict_before_fit_raises():
    clf = RegimeClassifier(n_regimes=3)
    with pytest.raises(MLEngineError):
        clf.predict([1.0, 0.5])


def test_fit_and_predict_labels_regimes_correctly():
    """
    The core test: after fitting on clearly-separated synthetic data, a new
    sample that looks like "Risk-On" (high return, low vol) should be
    classified as Risk-On, and one that looks like "Crisis" should be Crisis.
    """
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    risk_on_sample = [1.6, 0.75]   # matches Risk-On generation params
    crisis_sample = [-2.1, 4.6]    # matches Crisis generation params
    defensive_sample = [0.05, 2.1] # matches Defensive generation params

    assert clf.predict(risk_on_sample)["regime"] == "Risk-On"
    assert clf.predict(crisis_sample)["regime"] == "Crisis"
    assert clf.predict(defensive_sample)["regime"] == "Defensive"


def test_predict_confidence_is_between_0_and_1():
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    result = clf.predict([1.5, 0.8])
    assert 0.0 <= result["confidence"] <= 1.0


def test_predict_raw_probabilities_sum_to_one():
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    result = clf.predict([0.0, 3.0])
    total = sum(result["raw_probabilities"].values())
    assert total == pytest.approx(1.0, abs=1e-3)


def test_predict_raw_probabilities_has_all_three_regime_names():
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    result = clf.predict([1.5, 0.8])
    assert set(result["raw_probabilities"].keys()) == {"Risk-On", "Defensive", "Crisis"}


def test_cluster_labels_are_consistent_even_if_gmm_cluster_order_differs():
    """
    sklearn's cluster indices are arbitrary -- refit with a different
    random_state and confirm labeling still correctly identifies which
    physical cluster is Crisis (highest volatility) regardless of index order.
    """
    data = make_synthetic_regime_data()
    clf_a = RegimeClassifier(n_regimes=3, random_state=1)
    clf_b = RegimeClassifier(n_regimes=3, random_state=99)
    clf_a.fit(data)
    clf_b.fit(data)

    crisis_sample = [-2.0, 4.5]
    assert clf_a.predict(crisis_sample)["regime"] == "Crisis"
    assert clf_b.predict(crisis_sample)["regime"] == "Crisis"


def test_feature_matrix_must_be_2d():
    clf = RegimeClassifier(n_regimes=3)
    with pytest.raises(MLEngineError):
        clf.fit(np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]))  # 1D, invalid


# ---------- spread-aware entry gating ----------

def test_is_efficient_entry_within_threshold():
    result = is_efficient_entry(spread_pct=0.34, is_anomalous=False, max_spread_pct=1.0)
    assert result["efficient"] is True


def test_is_efficient_entry_exceeds_threshold():
    result = is_efficient_entry(spread_pct=5.33, is_anomalous=False, max_spread_pct=1.0)
    assert result["efficient"] is False


def test_is_efficient_entry_negative_spread_within_threshold():
    result = is_efficient_entry(spread_pct=-0.5, is_anomalous=False, max_spread_pct=1.0)
    assert result["efficient"] is True


def test_is_efficient_entry_anomalous_always_rejected_even_if_small():
    """Even a small-looking anomalous spread must never be treated as efficient."""
    result = is_efficient_entry(spread_pct=0.1, is_anomalous=True, max_spread_pct=1.0)
    assert result["efficient"] is False
    assert "anomalous" in result["reason"].lower()


def test_is_efficient_entry_real_anomaly_case_rejected():
    """Real observed case: NFLX 900% spread, flagged anomalous -- must reject."""
    result = is_efficient_entry(spread_pct=900.0, is_anomalous=True, max_spread_pct=1.0)
    assert result["efficient"] is False


# ---------- off-hours awareness ----------

def test_off_hours_regular_full_size():
    adj = get_off_hours_adjustment("regular")
    assert adj["position_size_multiplier"] == 1.0


def test_off_hours_offhours_reduced_size():
    adj = get_off_hours_adjustment("offhours")
    assert 0 < adj["position_size_multiplier"] < 1.0
    assert adj["slippage_tolerance_pct"] > 0.5  # wider than regular hours


def test_off_hours_closed_blocks_trading():
    adj = get_off_hours_adjustment("closed")
    assert adj["position_size_multiplier"] == 0.0


def test_off_hours_pause_blocks_trading():
    adj = get_off_hours_adjustment("pause")
    assert adj["position_size_multiplier"] == 0.0


def test_off_hours_unknown_status_defaults_safe():
    adj = get_off_hours_adjustment("some_unexpected_status")
    assert adj["position_size_multiplier"] == 0.0


# ---------- combined evaluate_token ----------

def test_evaluate_token_full_pipeline_trade_allowed():
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    result = evaluate_token(
        clf, feature_vector=[1.5, 0.8], spread_pct=0.34, is_anomalous=False,
        market_status="regular",
    )
    assert result["regime"] == "Risk-On"
    assert result["entry_efficient"] is True
    assert result["should_trade"] is True


def test_evaluate_token_blocked_by_anomalous_spread():
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    result = evaluate_token(
        clf, feature_vector=[1.5, 0.8], spread_pct=900.0, is_anomalous=True,
        market_status="regular",
    )
    assert result["should_trade"] is False


def test_evaluate_token_blocked_by_closed_market():
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    result = evaluate_token(
        clf, feature_vector=[1.5, 0.8], spread_pct=0.1, is_anomalous=False,
        market_status="closed",
    )
    assert result["should_trade"] is False


def test_evaluate_token_offhours_reduces_size_but_still_trades():
    data = make_synthetic_regime_data()
    clf = RegimeClassifier(n_regimes=3)
    clf.fit(data)

    result = evaluate_token(
        clf, feature_vector=[1.5, 0.8], spread_pct=0.3, is_anomalous=False,
        market_status="offhours",
    )
    assert result["should_trade"] is True
    assert result["position_size_multiplier"] < 1.0
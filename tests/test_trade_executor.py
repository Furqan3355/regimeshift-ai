"""
test_trade_executor.py
------------------------
Tests for Phase 3 dry-run simulation, using fake responses shaped exactly
like the real Transaction API docs. No real API key or funds needed.
Run with: python -m pytest tests/ -v
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BinanceConfig
from trade_executor import TradeExecutor, TradeExecutorError, run_scenarios
from tests.fake_session import FakeSession


@pytest.fixture
def cfg():
    return BinanceConfig(api_key="test_key", api_secret="test_secret")


EXAMPLE_TX = {
    "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "to": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "value": "0",
    "data": "0xa9059cbb",
}


# ---------- gas price ----------

def test_get_gas_price_evm(cfg):
    session = FakeSession({
        "gas-price": {"code": 0, "msg": "success", "data": {
            "evmLegacyGasPrice": {"lowGasPrice": "1000000000", "mediumGasPrice": "2000000000", "highGasPrice": "5000000000"},
            "eip1559GasPrice": {"baseFee": "1500000000", "lowPriorityFee": "100000000", "lowMaxFee": "1700000000"},
            "solanaGasPrice": None,
        }}
    })
    executor = TradeExecutor(cfg, session)
    data = executor.get_gas_price("56")
    assert data["eip1559GasPrice"]["baseFee"] == "1500000000"


def test_get_gas_price_business_error_raises(cfg):
    session = FakeSession({"gas-price": {"code": 40001, "msg": "Invalid request parameters", "data": None}})
    executor = TradeExecutor(cfg, session)
    with pytest.raises(TradeExecutorError):
        executor.get_gas_price("56")


# ---------- gas limit ----------

def test_get_gas_limit_success(cfg):
    session = FakeSession({
        "gas-limit": {"code": 0, "msg": "success", "data": {"gasLimit": "21000", "energyRequired": None}}
    })
    executor = TradeExecutor(cfg, session)
    data = executor.get_gas_limit("56", EXAMPLE_TX)
    assert data["gasLimit"] == "21000"


# ---------- simulate ----------

def test_simulate_transaction_success(cfg):
    session = FakeSession({
        "pre-transaction/simulate": {"code": 0, "msg": "success", "data": {
            "status": "SUCCESS", "failReason": None,
            "balanceChanges": [{"contractAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
                                 "tokenType": "ERC20", "change": "-1000000",
                                 "owner": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"}],
            "allowanceChanges": [],
        }}
    })
    executor = TradeExecutor(cfg, session)
    result = executor.simulate_transaction("56", EXAMPLE_TX)
    assert result["status"] == "SUCCESS"


def test_simulate_transaction_failed(cfg):
    session = FakeSession({
        "pre-transaction/simulate": {"code": 0, "msg": "success", "data": {
            "status": "FAILED", "failReason": "execution reverted: ERC20InsufficientBalance",
            "balanceChanges": [], "allowanceChanges": [],
        }}
    })
    executor = TradeExecutor(cfg, session)
    result = executor.simulate_transaction("56", EXAMPLE_TX)
    assert result["status"] == "FAILED"
    assert "InsufficientBalance" in result["failReason"]


# ---------- gas cost / slippage math ----------

def test_estimate_gas_cost_usd(cfg):
    executor = TradeExecutor(cfg, FakeSession({}))
    # 21000 gas * 2 gwei (2e9 wei) = 42000e9 wei = 0.000042 native token
    # at $600/token -> $0.0252
    cost = executor.estimate_gas_cost_usd("21000", "2000000000", 600.0)
    assert cost == pytest.approx(0.0252, rel=1e-3)


def test_calculate_slippage_pct(cfg):
    executor = TradeExecutor(cfg, FakeSession({}))
    slippage = executor.calculate_slippage_pct(expected_amount=100.0, simulated_amount=99.92)
    assert slippage == pytest.approx(0.08, rel=1e-2)


def test_calculate_slippage_zero_expected_raises(cfg):
    executor = TradeExecutor(cfg, FakeSession({}))
    with pytest.raises(TradeExecutorError):
        executor.calculate_slippage_pct(expected_amount=0, simulated_amount=1.0)


# ---------- full dry-run report (Phase 3 checkpoint) ----------

def test_build_dry_run_report_passed(cfg):
    session = FakeSession({
        "gas-price": {"code": 0, "msg": "success", "data": {
            "evmLegacyGasPrice": None,
            "eip1559GasPrice": {"baseFee": "2000000000"},
            "solanaGasPrice": None,
        }},
        "gas-limit": {"code": 0, "msg": "success", "data": {"gasLimit": "21000"}},
        "pre-transaction/simulate": {"code": 0, "msg": "success", "data": {
            "status": "SUCCESS", "failReason": None, "balanceChanges": [], "allowanceChanges": [],
        }},
    })
    executor = TradeExecutor(cfg, session)

    report = executor.build_dry_run_report(
        regime="Risk-On", binance_chain_id="56", evm_tx=EXAMPLE_TX,
        expected_amount=100.0, simulated_amount=99.92, native_token_price_usd=600.0,
    )

    assert report["status"] == "PASSED"
    assert report["slippage_pct"] == pytest.approx(0.08, rel=1e-2)
    assert report["gas_cost_usd"] > 0
    assert "PASSED" in report["summary"]
    assert report["fail_reason"] is None


def test_build_dry_run_report_failed(cfg):
    session = FakeSession({
        "gas-price": {"code": 0, "msg": "success", "data": {
            "evmLegacyGasPrice": None,
            "eip1559GasPrice": {"baseFee": "2000000000"},
            "solanaGasPrice": None,
        }},
        "gas-limit": {"code": 0, "msg": "success", "data": {"gasLimit": "21000"}},
        "pre-transaction/simulate": {"code": 0, "msg": "success", "data": {
            "status": "FAILED", "failReason": "execution reverted: ERC20InsufficientBalance",
            "balanceChanges": [], "allowanceChanges": [],
        }},
    })
    executor = TradeExecutor(cfg, session)

    report = executor.build_dry_run_report(
        regime="Crisis", binance_chain_id="56", evm_tx=EXAMPLE_TX,
        expected_amount=100.0, simulated_amount=95.0, native_token_price_usd=600.0,
    )

    assert report["status"] == "FAILED"
    assert report["fail_reason"] is not None


def test_run_scenarios_multiple_regimes(cfg, capsys):
    session = FakeSession({
        "gas-price": {"code": 0, "msg": "success", "data": {
            "evmLegacyGasPrice": None, "eip1559GasPrice": {"baseFee": "2000000000"}, "solanaGasPrice": None,
        }},
        "gas-limit": {"code": 0, "msg": "success", "data": {"gasLimit": "21000"}},
        "pre-transaction/simulate": {"code": 0, "msg": "success", "data": {
            "status": "SUCCESS", "failReason": None, "balanceChanges": [], "allowanceChanges": [],
        }},
    })

    scenarios = [
        {"regime": "Risk-On", "binance_chain_id": "56", "evm_tx": EXAMPLE_TX,
         "expected_amount": 100.0, "simulated_amount": 99.92, "native_token_price_usd": 600.0},
        {"regime": "Defensive", "binance_chain_id": "56", "evm_tx": EXAMPLE_TX,
         "expected_amount": 100.0, "simulated_amount": 99.95, "native_token_price_usd": 600.0},
        {"regime": "Crisis", "binance_chain_id": "56", "evm_tx": EXAMPLE_TX,
         "expected_amount": 100.0, "simulated_amount": 98.5, "native_token_price_usd": 600.0},
    ]

    results = run_scenarios(cfg, session, scenarios)
    assert len(results) == 3
    assert results[0]["regime"] == "Risk-On"
    assert results[2]["regime"] == "Crisis"

    captured = capsys.readouterr()
    assert "PASSED" in captured.out
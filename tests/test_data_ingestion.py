"""
test_data_ingestion.py
-----------------------
Tests every fetch/compute function in data_ingestion.py against realistic
fake responses shaped exactly like the real Binance Web3 API docs, so no
real API key or network access is needed.
Run with: python -m pytest tests/test_data_ingestion.py -v
"""

import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BinanceConfig
from data_ingestion import DataIngestion, DataIngestionError, run_pipeline
from tests.fake_session import FakeSession


@pytest.fixture
def cfg():
    return BinanceConfig(api_key="test_key", api_secret="test_secret")


# ---------- RWA tokens ----------

SAMPLE_RWA_TOKEN = {
    "binanceChainId": "56",
    "tokenContractAddress": "0x8755c5c39b1aa9053a83ac731242a2cf4d04b0fe",
    "platformId": "ondo",
    "assetType": 1,
    "tokenName": "SolarEdge Technologies (Ondo Tokenized)",
    "tokenSymbol": "SEDGon",
    "underlyingTicker": "SEDG",
    "underlyingName": "SolarEdge Technologies",
    "tokenPrice": "61.89",
    "referencePrice": "61.746364",
    "statusInfo": {
        "openState": False,
        "marketStatus": "closed",
        "reasonCode": "MARKET_CLOSED",
        "reasonMsg": "Weekend or Holiday",
    },
}


def test_fetch_rwa_tokens_success(cfg):
    session = FakeSession({"rwa/tokens": {"code": 0, "msg": "success", "data": [SAMPLE_RWA_TOKEN]}})
    ingestion = DataIngestion(cfg, session)

    tokens = ingestion.fetch_rwa_tokens(platform_id="ondo", tab_id=4)
    assert len(tokens) == 1
    assert tokens[0]["underlyingTicker"] == "SEDG"


def test_fetch_rwa_tokens_business_error_raises(cfg):
    session = FakeSession({"rwa/tokens": {"code": 40101, "msg": "API Key is missing, invalid, or disabled", "data": None}})
    ingestion = DataIngestion(cfg, session)

    with pytest.raises(DataIngestionError):
        ingestion.fetch_rwa_tokens()


def test_fetch_rwa_tokens_http_error_raises(cfg):
    session = FakeSession({"rwa/tokens": {"code": 0, "data": []}}, status_code=401)
    ingestion = DataIngestion(cfg, session)

    with pytest.raises(DataIngestionError):
        ingestion.fetch_rwa_tokens()


def test_parse_rwa_token_success(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    parsed = ingestion.parse_rwa_token(SAMPLE_RWA_TOKEN)

    assert parsed["ticker"] == "SEDG"
    assert parsed["on_chain_price"] == 61.89
    assert parsed["reference_price"] == 61.746364
    assert parsed["market_status"] == "closed"
    assert parsed["open_state"] is False
    assert parsed["reason_msg"] == "Weekend or Holiday"
    assert "spread_pct" in parsed["spread"]


def test_parse_rwa_token_missing_field_raises(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    broken = {"tokenPrice": "1", "referencePrice": "1"}  # missing statusInfo, underlyingTicker

    with pytest.raises(DataIngestionError):
        ingestion.parse_rwa_token(broken)


# ---------- spread computation ----------

def test_compute_spread_premium(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    result = ingestion.compute_spread(on_chain_price=61.89, reference_price=61.746364)
    assert result["spread_pct"] == pytest.approx(0.2326, rel=1e-2)


def test_compute_spread_discount(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    result = ingestion.compute_spread(on_chain_price=95.0, reference_price=100.0)
    assert result["spread_pct"] == -5.0


def test_compute_spread_zero_reference_raises(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    with pytest.raises(DataIngestionError):
        ingestion.compute_spread(on_chain_price=100.0, reference_price=0.0)


# ---------- candles / volatility ----------

def test_fetch_candles_success(cfg):
    # raw candle format: [open, high, low, close, volume, timestamp_ms, tradeCount]
    session = FakeSession({
        "candles": {"code": 0, "msg": "success", "data": [
            [100, 105, 99, 102, 50000, 1748600000000, 42],
            [102, 106, 100, 104, 51000, 1748686400000, 38],
        ]}
    })
    ingestion = DataIngestion(cfg, session)

    candles = ingestion.fetch_candles("56", "0x8755c5c39b1aa9053a83ac731242a2cf4d04b0fe")
    assert len(candles) == 2
    assert candles[0]["close"] == 102.0
    assert candles[1]["close"] == 104.0


def test_calculate_volatility_known_values(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    candles = [{"close": 100}, {"close": 110}, {"close": 99}]
    vol = ingestion.calculate_volatility(candles)
    assert vol > 0


def test_calculate_volatility_too_few_candles_raises(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    with pytest.raises(DataIngestionError):
        ingestion.calculate_volatility([{"close": 100}])


# ---------- DeFi / Ondo investments ----------

def test_fetch_ondo_investments_success(cfg):
    session = FakeSession({
        "investment/list": {
            "code": 0, "msg": "success",
            "data": {"page": 1, "size": 20, "total": 1, "list": [
                {
                    "binanceChainId": "56",
                    "defiProtocolId": "ondo",
                    "protocolName": "Ondo Finance",
                    "investmentId": "abc123",
                    "investmentName": "Ondo USDY Vault",
                    "investType": "Earn",
                    "apyType": "APY",
                    "apyBps": 850,
                    "apyDisplay": "8.50%",
                    "tvl": "1000000.00",
                }
            ]}
        }
    })
    ingestion = DataIngestion(cfg, session)

    investments = ingestion.fetch_ondo_investments()
    assert len(investments) == 1
    assert investments[0]["protocolName"] == "Ondo Finance"


def test_parse_investment_success(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    inv = {"investmentName": "Ondo USDY Vault", "apyBps": 850, "tvl": "1000000.00"}

    parsed = ingestion.parse_investment(inv)
    assert parsed["name"] == "Ondo USDY Vault"
    assert parsed["apy_pct"] == 8.5
    assert parsed["tvl_usd"] == 1000000.0


def test_parse_investment_missing_field_raises(cfg):
    ingestion = DataIngestion(cfg, FakeSession({}))
    with pytest.raises(DataIngestionError):
        ingestion.parse_investment({"investmentName": "X"})  # missing apyBps, tvl


# ---------- full pipeline (Phase 1 checkpoint) ----------

def test_run_pipeline_end_to_end(cfg, capsys):
    session = FakeSession({
        "rwa/tokens": {"code": 0, "msg": "success", "data": [SAMPLE_RWA_TOKEN]},
        "candles": {"code": 0, "msg": "success", "data": [
            [100, 105, 99, 102, 50000, 1748600000000, 42],
            [102, 106, 100, 104, 51000, 1748686400000, 38],
            [104, 108, 103, 106, 52000, 1748772800000, 40],
        ]},
        "investment/list": {
            "code": 0, "msg": "success",
            "data": {"page": 1, "size": 20, "total": 1, "list": [
                {
                    "binanceChainId": "56", "defiProtocolId": "ondo",
                    "protocolName": "Ondo Finance", "investmentId": "abc123",
                    "investmentName": "Ondo USDY Vault", "investType": "Earn",
                    "apyType": "APY", "apyBps": 850, "apyDisplay": "8.50%",
                    "tvl": "1000000.00",
                }
            ]}
        },
    })

    result = run_pipeline(
        cfg, session, platform_id="ondo", tab_id=4,
        candle_chain_id="56", candle_token_address="0x8755c5c39b1aa9053a83ac731242a2cf4d04b0fe",
    )

    assert result["tokens"][0]["ticker"] == "SEDG"
    assert "volatility_14d" in result
    assert result["ondo_investments"][0]["name"] == "Ondo USDY Vault"

    captured = capsys.readouterr()
    assert "SEDG" in captured.out


# ---------- anomaly/scale-mismatch detection (added after real live data check) ----------

def test_compute_spread_flags_real_observed_anomalies(cfg):
    """
    These exact price pairs were observed on a real live call on 2026-09-26
    (AI Chips sector). All are exact clean-ratio mismatches, not real spreads,
    and must be flagged is_anomalous=True so they don't feed the trading signal.
    """
    ingestion = DataIngestion(cfg, FakeSession({}))
    real_anomalies = [
        (7116.5, 711.65),        # NFLX -- 10x
        (18913.497, 1886.4327),  # KLAC -- 10x
        (1602.0, 160.2),         # PPLT -- 10x
        (1627.03125, 325.40625), # CVNA -- 5x
        (339.619, 169.4477),     # APH -- 2x
        (0.334111, 3.285405),    # SOXS -- 1/10x
        (0.002649, 0.039728),    # ENLV -- ~1/15x
        (3390.1875, 678.0375),   # NOW -- 5x
        (4045.76, 1011.44),      # CRWD -- 4x
    ]
    for on_chain, ref in real_anomalies:
        result = ingestion.compute_spread(on_chain, ref)
        assert result["is_anomalous"] is True, f"Expected anomaly for {on_chain}/{ref}"


def test_compute_spread_does_not_flag_real_observed_normal_spreads(cfg):
    """
    These exact price pairs were also observed on the same live call and are
    genuine, small, noisy spreads -- must NOT be flagged as anomalous.
    """
    ingestion = DataIngestion(cfg, FakeSession({}))
    real_normal = [
        (359.351, 357.061),   # AVGO -- 0.64%
        (342.516, 341.364),   # AAPL -- 0.34%
        (109.759, 104.201),   # STRC -- 5.33%
        (210.362, 206.534),   # QCOM -- 1.85%
    ]
    for on_chain, ref in real_normal:
        result = ingestion.compute_spread(on_chain, ref)
        assert result["is_anomalous"] is False, f"False positive for {on_chain}/{ref}"


def test_filter_anomalous_tokens_from_parsed_list(cfg):
    """
    parse_rwa_token should carry is_anomalous through into the spread dict,
    so downstream code can filter the token list before feeding a regime signal.
    """
    ingestion = DataIngestion(cfg, FakeSession({}))
    anomalous_token = dict(SAMPLE_RWA_TOKEN)
    anomalous_token["tokenPrice"] = "617.46364"    # 10x the reference
    anomalous_token["referencePrice"] = "61.746364"

    parsed = ingestion.parse_rwa_token(anomalous_token)
    assert parsed["spread"]["is_anomalous"] is True

    # A caller building a clean list for the trading signal would do this:
    clean_tokens = [SAMPLE_RWA_TOKEN, anomalous_token]
    parsed_all = [ingestion.parse_rwa_token(t) for t in clean_tokens]
    filtered = [t for t in parsed_all if not t["spread"]["is_anomalous"]]
    assert len(filtered) == 1
    assert filtered[0]["ticker"] == "SEDG"
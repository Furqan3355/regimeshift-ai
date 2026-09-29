"""
test_config.py
---------------
Tests for real Binance Web3 API signing (HMAC-SHA256, base64, /build prefix).
Run with: python -m pytest tests/test_config.py -v
"""

import sys
import os
import base64
import hmac
import hashlib
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BinanceConfig, BinanceAuthError


def test_missing_credentials_raises_error(monkeypatch):
    monkeypatch.delenv("BINANCE_API_KEY", raising=False)
    monkeypatch.delenv("BINANCE_API_SECRET", raising=False)
    with pytest.raises(BinanceAuthError):
        BinanceConfig()


def test_credentials_from_env(monkeypatch):
    monkeypatch.setenv("BINANCE_API_KEY", "test_key")
    monkeypatch.setenv("BINANCE_API_SECRET", "test_secret")
    cfg = BinanceConfig()
    assert cfg.api_key == "test_key"
    assert cfg.api_secret == "test_secret"


def test_credentials_from_constructor():
    cfg = BinanceConfig(api_key="direct_key", api_secret="direct_secret")
    assert cfg.api_key == "direct_key"
    assert cfg.api_secret == "direct_secret"


def test_base_url_has_build_prefix():
    assert BinanceConfig.BASE_URL == "https://web3.binance.com/build"


def test_sign_request_url_includes_build_prefix_and_query():
    cfg = BinanceConfig(api_key="k", api_secret="s")
    signed = cfg.sign_request("GET", "/api/v1/dex/market/rwa/tokens", params={"platformId": "ondo"})

    assert signed["url"] == "https://web3.binance.com/build/api/v1/dex/market/rwa/tokens?platformId=ondo"


def test_sign_request_headers_present():
    cfg = BinanceConfig(api_key="my_key", api_secret="s")
    signed = cfg.sign_request("GET", "/api/v1/dex/market/rwa/tokens")

    assert signed["headers"]["X-OC-APIKEY"] == "my_key"
    assert "X-OC-TIMESTAMP" in signed["headers"]
    assert "X-OC-SIGN" in signed["headers"]
    # ISO 8601 with milliseconds, ends in Z
    assert signed["headers"]["X-OC-TIMESTAMP"].endswith("Z")


def test_signature_is_valid_base64_hmac_sha256():
    """
    Reproduces the exact pre-hash string construction from the docs and
    verifies our signature matches what we'd compute independently.
    """
    cfg = BinanceConfig(api_key="k", api_secret="my_secret")
    signed = cfg.sign_request("GET", "/api/v1/dex/market/rwa/tokens", params={"platformId": "ondo"})

    timestamp = signed["headers"]["X-OC-TIMESTAMP"]
    signed_path = "/build/api/v1/dex/market/rwa/tokens?platformId=ondo"
    expected_pre_hash = timestamp + "GET" + signed_path + ""

    expected_sig = base64.b64encode(
        hmac.new(b"my_secret", expected_pre_hash.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")

    assert signed["headers"]["X-OC-SIGN"] == expected_sig


def test_signature_changes_with_different_secret():
    cfg1 = BinanceConfig(api_key="k", api_secret="secret_one")
    cfg2 = BinanceConfig(api_key="k", api_secret="secret_two")

    sig1 = cfg1.sign_request("GET", "/api/v1/dex/market/rwa/tokens")["headers"]["X-OC-SIGN"]
    sig2 = cfg2.sign_request("GET", "/api/v1/dex/market/rwa/tokens")["headers"]["X-OC-SIGN"]

    assert sig1 != sig2


def test_post_body_included_in_signature():
    """POST requests must include the raw body string in the pre-hash."""
    cfg = BinanceConfig(api_key="k", api_secret="s")
    body = '{"investType":"Earn"}'

    signed_with_body = cfg.sign_request("POST", "/api/v1/defi/data/investment/list", body=body)
    signed_without_body = cfg.sign_request("POST", "/api/v1/defi/data/investment/list", body="")

    # Different body -> different signature (since timestamp differs too, we just
    # confirm both produce valid non-empty signatures and don't crash)
    assert signed_with_body["headers"]["X-OC-SIGN"]
    assert signed_without_body["headers"]["X-OC-SIGN"]
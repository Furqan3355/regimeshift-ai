"""
data_ingestion.py
------------------
Phase 1 core: pulls data from real Binance Web3 API endpoints, confirmed
against the official docs on 2026-09-26:
- RWA Data:  https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data
- General:   https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/general-data
- DeFi Data: https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/defi-data

Design note: every fetch_* function takes an optional `session` (requests-like
object) so tests can inject a fake/mock session instead of hitting the real
network. In production, pass a real `requests.Session()`.
"""

import json
import statistics


class DataIngestionError(Exception):
    """Raised when an API response is missing expected fields or returns an error code."""
    pass


class DataIngestion:
    def __init__(self, config, session):
        """
        config: BinanceConfig instance (handles signing/auth)
        session: object with .get(url, headers=None) / .post(url, headers=None, json=None)
                 methods, matching requests.Session()'s interface.
        """
        self.config = config
        self.session = session

    # ---------- RWA Data API ----------

    def fetch_rwa_tokens(self, platform_id: str = "ondo", tab_id: int = None,
                          binance_chain_id: str = None) -> list:
        """
        GET /api/v1/dex/market/rwa/tokens
        Returns the RWA token list. Each entry already includes on-chain price
        (tokenPrice), reference price (referencePrice) AND market status
        (statusInfo.marketStatus / openState) in a single call -- no need for
        3 separate requests.

        tab_id: sector filter, e.g. 4=AI Chips, 13=Buffett Portfolio (see docs
        for the full enum).
        """
        params = {}
        if platform_id:
            params["platformId"] = platform_id
        if tab_id is not None:
            params["tabId"] = tab_id
        if binance_chain_id:
            params["binanceChainId"] = binance_chain_id

        signed = self.config.sign_request("GET", "/api/v1/dex/market/rwa/tokens", params=params)
        resp = self.session.get(signed["url"], headers=signed["headers"])
        data = self._safe_json(resp)

        return data["data"]  # list of token dicts

    def parse_rwa_token(self, token: dict) -> dict:
        """
        Extracts the fields we care about from one RWA token entry:
        on-chain price, reference price, spread, and market status.
        """
        required = ["tokenPrice", "referencePrice", "statusInfo", "underlyingTicker"]
        missing = [f for f in required if f not in token]
        if missing:
            raise DataIngestionError(f"Missing fields {missing} in RWA token entry: {token}")

        on_chain_price = float(token["tokenPrice"])
        reference_price = float(token["referencePrice"])

        return {
            "ticker": token["underlyingTicker"],
            "on_chain_price": on_chain_price,
            "reference_price": reference_price,
            "market_status": token["statusInfo"]["marketStatus"],
            "open_state": token["statusInfo"]["openState"],
            "reason_msg": token["statusInfo"].get("reasonMsg"),
            "spread": self.compute_spread(on_chain_price, reference_price),
        }

    # Ratios that indicate a stock-split / share-basis mismatch rather than a
    # genuine trading spread. Found empirically: NFLX/PPLT showed exactly 10x,
    # NOW/CVNA exactly 5x, CRWD/IWF exactly 4x, APH exactly 2x, when on_chain_price
    # and reference_price used different share-count bases. Real market spreads
    # are never this clean, so any ratio within ~1% of one of these is flagged.
    SUSPICIOUS_RATIOS = [2, 4, 5, 10, 15]
    RATIO_TOLERANCE = 0.02  # 2% -- 1% missed real observed cases like SOXS (ratio 0.1017 vs clean 0.1)

    def compute_spread(self, on_chain_price: float, reference_price: float) -> dict:
        """
        Spread = how far the on-chain price has drifted from reference price.
        Positive = on-chain trading at a premium. Negative = at a discount.

        Also flags "is_anomalous": True when the ratio between the two prices
        is suspiciously close to a clean integer multiple (2x, 4x, 5x, 10x, 15x)
        -- this pattern was observed in real data and traced to stock-split /
        share-basis mismatches, not genuine spreads. Downstream regime/gating
        logic should treat anomalous spreads as unreliable, not as trading signals.
        """
        if reference_price == 0:
            raise DataIngestionError("reference_price cannot be zero when computing spread")

        spread_pct = ((on_chain_price - reference_price) / reference_price) * 100

        ratio = on_chain_price / reference_price
        is_anomalous = False
        for suspicious in self.SUSPICIOUS_RATIOS:
            for candidate in (suspicious, 1 / suspicious):
                if abs(ratio - candidate) / candidate <= self.RATIO_TOLERANCE:
                    is_anomalous = True
                    break
            if is_anomalous:
                break

        return {
            "spread_pct": round(spread_pct, 4),
            "on_chain_price": on_chain_price,
            "reference_price": reference_price,
            "is_anomalous": is_anomalous,
        }

    # ---------- General Data API (candles / volatility) ----------

    def fetch_candles(self, binance_chain_id: str, token_contract_address: str,
                       bar: str = "1d", limit: int = 14) -> list:
        """
        GET /api/v1/dex/market/candles
        Each raw candle is [open, high, low, close, volume, timestamp_ms, tradeCount].
        Returns a list of dicts: [{"close": float, "timestamp": int}, ...]
        """
        params = {
            "binanceChainId": binance_chain_id,
            "tokenContractAddress": token_contract_address,
            "bar": bar,
            "limit": limit,
        }
        signed = self.config.sign_request("GET", "/api/v1/dex/market/candles", params=params)
        resp = self.session.get(signed["url"], headers=signed["headers"])
        data = self._safe_json(resp)

        raw_candles = data["data"]
        return [
            {"close": float(c[3]), "timestamp": c[5]}
            for c in raw_candles
        ]

    def calculate_volatility(self, candles: list) -> float:
        """
        Simple volatility proxy: stdev of daily returns (%), computed from
        a list of candle dicts with a 'close' field.
        """
        if len(candles) < 2:
            raise DataIngestionError("Need at least 2 candles to compute volatility")

        closes = [c["close"] for c in candles]
        returns = [
            (closes[i] - closes[i - 1]) / closes[i - 1] * 100
            for i in range(1, len(closes))
            if closes[i - 1] != 0
        ]

        if len(returns) < 2:
            raise DataIngestionError("Not enough valid returns to compute volatility")

        return round(statistics.stdev(returns), 4)

    # ---------- DeFi Data API ----------

    def fetch_ondo_investments(self, invest_type: str = "Earn", defi_protocol_id: str = "ondo") -> list:
        """
        POST /api/v1/defi/data/investment/list
        Returns Ondo investment products with apyBps / apyDisplay / tvl.
        Filters server-side by defiProtocolId (NOT by protocolName -- protocolName
        is a display string like "Ondo Finance" and may not always contain "ondo"
        as a substring, so filtering client-side by name was unreliable and fell
        back to unrelated USDT vaults from other protocols).
        """
        body_dict = {"investType": invest_type}
        if defi_protocol_id:
            body_dict["defiProtocolId"] = defi_protocol_id
        body_str = json.dumps(body_dict)

        signed = self.config.sign_request(
            "POST", "/api/v1/defi/data/investment/list", body=body_str
        )
        resp = self.session.post(signed["url"], headers=signed["headers"], data=body_str)
        data = self._safe_json(resp)

        return data["data"]["list"]

    def parse_investment(self, investment: dict) -> dict:
        """Extracts APY (%) and TVL (USD) from one investment list entry."""
        required = ["apyBps", "tvl", "investmentName"]
        missing = [f for f in required if f not in investment]
        if missing:
            raise DataIngestionError(f"Missing fields {missing} in investment entry: {investment}")

        return {
            "name": investment["investmentName"],
            "apy_pct": investment["apyBps"] / 100,  # bps -> %
            "tvl_usd": float(investment["tvl"]),
        }

    # ---------- helpers ----------

    def _safe_json(self, resp) -> dict:
        if resp.status_code != 200:
            raise DataIngestionError(
                f"API returned HTTP {resp.status_code}: {getattr(resp, 'text', '')}"
            )
        data = resp.json()
        if data.get("code") != 0:
            # Binance wraps business errors in a 200 response with code != 0
            raise DataIngestionError(f"API returned error code {data.get('code')}: {data.get('msg')}")
        return data


def run_pipeline(config, session, platform_id="ondo", tab_id=4,
                  candle_chain_id=None, candle_token_address=None):
    """
    Convenience function: runs the full Phase 1 checkpoint --
    fetches RWA tokens (price + reference + market status), candles/volatility
    for one token, and Ondo investment APY, then prints clean structured JSON.
    """
    ingestion = DataIngestion(config, session)

    # 1. RWA tokens (price, reference price, market status all in one call)
    tokens = ingestion.fetch_rwa_tokens(platform_id=platform_id, tab_id=tab_id)
    parsed_tokens = [ingestion.parse_rwa_token(t) for t in tokens]

    result = {"sector_tab_id": tab_id, "tokens": parsed_tokens}

    # 2. Candles/volatility -- only if a specific token address was given
    if candle_chain_id and candle_token_address:
        candles = ingestion.fetch_candles(candle_chain_id, candle_token_address)
        result["volatility_14d"] = ingestion.calculate_volatility(candles)

    # 3. Ondo APY -- filtered server-side by defiProtocolId="ondo" (see fetch_ondo_investments)
    investments = ingestion.fetch_ondo_investments(defi_protocol_id="ondo")
    result["ondo_investments"] = [ingestion.parse_investment(inv) for inv in investments]

    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    # Real run: requires `pip install requests` + real env vars set.
    import requests
    from config import BinanceConfig

    cfg = BinanceConfig()
    run_pipeline(cfg, requests.Session(), platform_id="ondo", tab_id=4)
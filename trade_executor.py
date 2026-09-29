"""
trade_executor.py
------------------
Phase 3: dry-run trade simulation using the real Transaction API, confirmed
against https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/transaction-api
on 2026-09-26.

Flow for one "dry run" scenario:
  1. get_gas_price(chain)          -> current network gas price
  2. get_gas_limit(chain, evmTx)   -> estimated gas units for the tx
  3. simulate_transaction(chain, evmTx) -> predicted SUCCESS/FAILED + balance changes
  4. build_dry_run_report(...)     -> combines all of the above into the
     "PASSED (Slippage: 0.08%, Gas: $0.03)"-style result the plan doc asks for

No real funds or signing needed for any of this -- simulate + gas endpoints
are read-only estimation calls.
"""

import json


class TradeExecutorError(Exception):
    """Raised when a Transaction API call fails or returns malformed data."""
    pass


class TradeExecutor:
    def __init__(self, config, session):
        self.config = config
        self.session = session

    # ---------- gas price ----------

    def get_gas_price(self, binance_chain_id: str) -> dict:
        """
        GET /api/v1/dex/pre-transaction/gas-price
        Returns whichever of evmLegacyGasPrice / eip1559GasPrice / solanaGasPrice
        is populated for this chain (others are null).
        """
        params = {"binanceChainId": binance_chain_id}
        signed = self.config.sign_request("GET", "/api/v1/dex/pre-transaction/gas-price", params=params)
        resp = self.session.get(signed["url"], headers=signed["headers"])
        return self._safe_json(resp)["data"]

    # ---------- gas limit ----------

    def get_gas_limit(self, binance_chain_id: str, evm_tx: dict) -> dict:
        """
        POST /api/v1/dex/pre-transaction/gas-limit
        evm_tx: {"from": ..., "to": ..., "value": ..., "data": ...}
        Returns {"gasLimit": "21000", ...}
        """
        body_dict = {"binanceChainId": binance_chain_id, "evmTx": evm_tx}
        body_str = json.dumps(body_dict)
        signed = self.config.sign_request(
            "POST", "/api/v1/dex/pre-transaction/gas-limit", body=body_str
        )
        resp = self.session.post(signed["url"], headers=signed["headers"], data=body_str)
        return self._safe_json(resp)["data"]

    # ---------- simulation (the core of Phase 3) ----------

    def simulate_transaction(self, binance_chain_id: str, evm_tx: dict) -> dict:
        """
        POST /api/v1/dex/pre-transaction/simulate
        Predicts SUCCESS/FAILED for an unsigned tx, plus balance changes.
        This is the dry-run step the plan doc requires -- no funds needed.
        """
        body_dict = {"binanceChainId": binance_chain_id, "evmTx": evm_tx}
        body_str = json.dumps(body_dict)
        signed = self.config.sign_request(
            "POST", "/api/v1/dex/pre-transaction/simulate", body=body_str
        )
        resp = self.session.post(signed["url"], headers=signed["headers"], data=body_str)
        return self._safe_json(resp)["data"]

    # ---------- combining into a "PASSED (Slippage: X%, Gas: $Y)" report ----------

    def estimate_gas_cost_usd(self, gas_limit: str, gas_price_wei: str, native_token_price_usd: float) -> float:
        """
        gas_cost_native = gasLimit * gasPrice (both integer strings, in wei)
        gas_cost_usd = gas_cost_native / 1e18 * native_token_price_usd
        """
        gas_cost_wei = int(gas_limit) * int(gas_price_wei)
        gas_cost_native = gas_cost_wei / 1e18
        return round(gas_cost_native * native_token_price_usd, 4)

    def calculate_slippage_pct(self, expected_amount: float, simulated_amount: float) -> float:
        """
        Slippage = how much less/more you actually got vs. expected, as a %.
        expected_amount/simulated_amount should be in the same token units
        (e.g. both in "smallest unit" or both human-readable -- caller's choice,
        just be consistent).
        """
        if expected_amount == 0:
            raise TradeExecutorError("expected_amount cannot be zero when computing slippage")
        slippage_pct = abs(expected_amount - simulated_amount) / expected_amount * 100
        return round(slippage_pct, 4)

    def build_dry_run_report(self, regime: str, binance_chain_id: str, evm_tx: dict,
                              expected_amount: float, simulated_amount: float,
                              native_token_price_usd: float) -> dict:
        """
        Runs gas-price + gas-limit + simulate together and builds the
        clean report format the plan doc wants:
        "PASSED (Slippage: 0.08%, Gas: $0.03)"
        """
        gas_price_data = self.get_gas_price(binance_chain_id)
        gas_limit_data = self.get_gas_limit(binance_chain_id, evm_tx)
        sim_result = self.simulate_transaction(binance_chain_id, evm_tx)

        # Prefer EIP-1559 baseFee if present, else legacy medium gas price
        if gas_price_data.get("eip1559GasPrice"):
            gas_price_wei = gas_price_data["eip1559GasPrice"]["baseFee"]
        elif gas_price_data.get("evmLegacyGasPrice"):
            gas_price_wei = gas_price_data["evmLegacyGasPrice"]["mediumGasPrice"]
        else:
            raise TradeExecutorError(f"No usable gas price data for chain {binance_chain_id}")

        gas_cost_usd = self.estimate_gas_cost_usd(
            gas_limit_data["gasLimit"], gas_price_wei, native_token_price_usd
        )
        slippage_pct = self.calculate_slippage_pct(expected_amount, simulated_amount)

        status = "PASSED" if sim_result["status"] == "SUCCESS" else "FAILED"

        report = {
            "regime": regime,
            "status": status,
            "slippage_pct": slippage_pct,
            "gas_cost_usd": gas_cost_usd,
            "fail_reason": sim_result.get("failReason") if status == "FAILED" else None,
            "summary": f"{status} (Slippage: {slippage_pct}%, Gas: ${gas_cost_usd})",
        }
        return report

    # ---------- helpers ----------

    def _safe_json(self, resp) -> dict:
        if resp.status_code != 200:
            raise TradeExecutorError(f"API returned HTTP {resp.status_code}: {getattr(resp, 'text', '')}")
        data = resp.json()
        if data.get("code") != 0:
            raise TradeExecutorError(f"API returned error code {data.get('code')}: {data.get('msg')}")
        return data


def run_scenarios(config, session, scenarios: list):
    """
    scenarios: list of dicts like:
        {"regime": "Risk-On", "binance_chain_id": "56", "evm_tx": {...},
         "expected_amount": 100.0, "simulated_amount": 99.92, "native_token_price_usd": 600.0}
    Runs dry-run for each and prints the results, matching the plan's Phase 3 checkpoint.
    """
    executor = TradeExecutor(config, session)
    results = []
    for s in scenarios:
        report = executor.build_dry_run_report(
            s["regime"], s["binance_chain_id"], s["evm_tx"],
            s["expected_amount"], s["simulated_amount"], s["native_token_price_usd"],
        )
        results.append(report)
        print(json.dumps(report, indent=2))
    return results


if __name__ == "__main__":
    import requests
    from config import BinanceConfig

    cfg = BinanceConfig()
    example_tx = {
        "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "to": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "value": "0",
        "data": "0x",
    }
    scenarios = [
        {"regime": "Risk-On", "binance_chain_id": "56", "evm_tx": example_tx,
         "expected_amount": 100.0, "simulated_amount": 99.92, "native_token_price_usd": 600.0},
    ]
    run_scenarios(cfg, requests.Session(), scenarios)
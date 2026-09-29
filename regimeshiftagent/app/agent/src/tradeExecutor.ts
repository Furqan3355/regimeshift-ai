/**
 * tradeExecutor.ts
 * -----------------
 * TypeScript port of trade_executor.py (Phase 3): dry-run trade simulation
 * using the real Binance Web3 Transaction API. Uses the global `fetch`
 * (available in Node 18+; AgentCore's NODE_22 runtime has it natively --
 * no axios/node-fetch dependency needed).
 *
 * Flow for one "dry run" scenario (identical to the Python version):
 *   1. getGasPrice(chain)        -> current network gas price
 *   2. getGasLimit(chain, evmTx) -> estimated gas units for the tx
 *   3. simulateTransaction(...)  -> predicted SUCCESS/FAILED + balance changes
 *   4. buildDryRunReport(...)    -> combines all of the above into the
 *      "PASSED (Slippage: 0.08%, Gas: $0.03)"-style result
 *
 * No real funds or signing needed -- simulate + gas endpoints are read-only
 * estimation calls (same guarantee as the Python version).
 */

import { BinanceConfig } from "./binanceConfig.js";

export class TradeExecutorError extends Error {}

export interface EvmTx {
  from: string;
  to: string;
  value: string;
  data: string;
}

export interface DryRunReport {
  regime: string;
  status: "PASSED" | "FAILED";
  slippage_pct: number;
  gas_cost_usd: number;
  fail_reason: string | null;
  summary: string;
}

export interface DryRunScenario {
  regime: string;
  binanceChainId: string;
  evmTx: EvmTx;
  expectedAmount: number;
  simulatedAmount: number;
  nativeTokenPriceUsd: number;
}

export class TradeExecutor {
  constructor(private readonly config: BinanceConfig) {}

  // ---------- gas price ----------

  /**
   * GET /api/v1/dex/pre-transaction/gas-price
   * Returns whichever of evmLegacyGasPrice / eip1559GasPrice / solanaGasPrice
   * is populated for this chain (others are null).
   */
  async getGasPrice(binanceChainId: string): Promise<any> {
    const signed = this.config.signRequest("GET", "/api/v1/dex/pre-transaction/gas-price", {
      binanceChainId,
    });
    const resp = await fetch(signed.url, { method: "GET", headers: signed.headers });
    return (await this.safeJson(resp)).data;
  }

  // ---------- gas limit ----------

  /**
   * POST /api/v1/dex/pre-transaction/gas-limit
   * evmTx: {from, to, value, data}. Returns {gasLimit: "21000", ...}
   */
  async getGasLimit(binanceChainId: string, evmTx: EvmTx): Promise<any> {
    const bodyStr = JSON.stringify({ binanceChainId, evmTx });
    const signed = this.config.signRequest("POST", "/api/v1/dex/pre-transaction/gas-limit", undefined, bodyStr);
    const resp = await fetch(signed.url, { method: "POST", headers: signed.headers, body: bodyStr });
    return (await this.safeJson(resp)).data;
  }

  // ---------- simulation (the core of Phase 3) ----------

  /**
   * POST /api/v1/dex/pre-transaction/simulate
   * Predicts SUCCESS/FAILED for an unsigned tx, plus balance changes.
   * No funds needed -- this is the dry-run step.
   */
  async simulateTransaction(binanceChainId: string, evmTx: EvmTx): Promise<any> {
    const bodyStr = JSON.stringify({ binanceChainId, evmTx });
    const signed = this.config.signRequest("POST", "/api/v1/dex/pre-transaction/simulate", undefined, bodyStr);
    const resp = await fetch(signed.url, { method: "POST", headers: signed.headers, body: bodyStr });
    return (await this.safeJson(resp)).data;
  }

  // ---------- combining into a "PASSED (Slippage: X%, Gas: $Y)" report ----------

  /**
   * gasCostNative = gasLimit * gasPrice (both integer strings, in wei)
   * gasCostUsd = gasCostNative / 1e18 * nativeTokenPriceUsd
   * Uses BigInt for the wei multiplication to avoid float precision loss on
   * large integers (Python's arbitrary-precision int has no equivalent
   * risk, so this is a deliberate TS-side safety addition).
   */
  estimateGasCostUsd(gasLimit: string, gasPriceWei: string, nativeTokenPriceUsd: number): number {
    const gasCostWei = BigInt(gasLimit) * BigInt(gasPriceWei);
    const gasCostNative = Number(gasCostWei) / 1e18;
    return Math.round(gasCostNative * nativeTokenPriceUsd * 10000) / 10000;
  }

  /** Slippage = how much less/more you actually got vs. expected, as a %. */
  calculateSlippagePct(expectedAmount: number, simulatedAmount: number): number {
    if (expectedAmount === 0) {
      throw new TradeExecutorError("expected_amount cannot be zero when computing slippage");
    }
    const slippagePct = (Math.abs(expectedAmount - simulatedAmount) / expectedAmount) * 100;
    return Math.round(slippagePct * 10000) / 10000;
  }

  /**
   * Runs gas-price + gas-limit + simulate together and builds the clean
   * report format: "PASSED (Slippage: 0.08%, Gas: $0.0007)"
   */
  async buildDryRunReport(
    regime: string,
    binanceChainId: string,
    evmTx: EvmTx,
    expectedAmount: number,
    simulatedAmount: number,
    nativeTokenPriceUsd: number,
  ): Promise<DryRunReport> {
    const gasPriceData = await this.getGasPrice(binanceChainId);
    const gasLimitData = await this.getGasLimit(binanceChainId, evmTx);
    const simResult = await this.simulateTransaction(binanceChainId, evmTx);

    // Prefer EIP-1559 baseFee if present, else legacy medium gas price.
    let gasPriceWei: string;
    if (gasPriceData?.eip1559GasPrice) {
      gasPriceWei = gasPriceData.eip1559GasPrice.baseFee;
    } else if (gasPriceData?.evmLegacyGasPrice) {
      gasPriceWei = gasPriceData.evmLegacyGasPrice.mediumGasPrice;
    } else {
      throw new TradeExecutorError(`No usable gas price data for chain ${binanceChainId}`);
    }

    const gasCostUsd = this.estimateGasCostUsd(gasLimitData.gasLimit, gasPriceWei, nativeTokenPriceUsd);
    const slippagePct = this.calculateSlippagePct(expectedAmount, simulatedAmount);

    const status: "PASSED" | "FAILED" = simResult.status === "SUCCESS" ? "PASSED" : "FAILED";

    return {
      regime,
      status,
      slippage_pct: slippagePct,
      gas_cost_usd: gasCostUsd,
      fail_reason: status === "FAILED" ? (simResult.failReason ?? null) : null,
      summary: `${status} (Slippage: ${slippagePct}%, Gas: $${gasCostUsd})`,
    };
  }

  // ---------- helpers ----------

  private async safeJson(resp: Response): Promise<any> {
    if (resp.status !== 200) {
      const text = await resp.text().catch(() => "");
      throw new TradeExecutorError(`API returned HTTP ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    if (data.code !== 0) {
      throw new TradeExecutorError(`API returned error code ${data.code}: ${data.msg}`);
    }
    return data;
  }
}

/**
 * scenarios: list of {regime, binanceChainId, evmTx, expectedAmount,
 * simulatedAmount, nativeTokenPriceUsd}. Runs dry-run for each, matching the
 * Phase 3 checkpoint format.
 */
export async function runScenarios(
  config: BinanceConfig,
  scenarios: DryRunScenario[],
): Promise<DryRunReport[]> {
  const executor = new TradeExecutor(config);
  const results: DryRunReport[] = [];
  for (const s of scenarios) {
    const report = await executor.buildDryRunReport(
      s.regime,
      s.binanceChainId,
      s.evmTx,
      s.expectedAmount,
      s.simulatedAmount,
      s.nativeTokenPriceUsd,
    );
    results.push(report);
  }
  return results;
}
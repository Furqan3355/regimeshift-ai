/**
 * binanceConfig.ts
 * -----------------
 * TypeScript port of config.py: Binance Web3 API request signing, per
 * https://web3.binance.com/en/dev-docs/authentication (confirmed 2026-09-26).
 *
 * - Base URL is https://web3.binance.com/build (the /build prefix is REQUIRED)
 * - Auth uses 3 headers: X-OC-APIKEY, X-OC-TIMESTAMP, X-OC-SIGN
 * - Signature = Base64( HMAC-SHA256( timestamp + method + requestPath + body, secretKey ) )
 * - requestPath MUST include the /build prefix and the raw query string
 * - timestamp is ISO 8601 with milliseconds, e.g. "2026-05-11T10:08:57.715Z"
 * - body is "" for GET/HEAD requests
 *
 * Uses Node's built-in `crypto` module -- no extra npm dependency needed,
 * which matters for AgentCore's Node.js CodeZip deploy (keep the bundle lean).
 */

import { createHmac } from "node:crypto";

export class BinanceAuthError extends Error {}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

export class BinanceConfig {
  static readonly BASE_URL = "https://web3.binance.com/build";
  static readonly BUILD_PREFIX = "/build";

  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey ?? process.env.BINANCE_API_KEY ?? "";
    this.apiSecret = apiSecret ?? process.env.BINANCE_API_SECRET ?? "";

    if (!this.apiKey || !this.apiSecret) {
      throw new BinanceAuthError(
        "Missing BINANCE_API_KEY / BINANCE_API_SECRET. Set them as environment variables before running.",
      );
    }
  }

  /** ISO 8601 timestamp with MILLISECOND precision (not microseconds), e.g. 2026-05-11T10:08:57.715Z. */
  private isoTimestamp(): string {
    // Node's Date#toISOString() already gives millisecond precision
    // (YYYY-MM-DDTHH:mm:ss.sssZ), so no manual truncation needed here --
    // unlike Python's datetime, which defaults to microseconds.
    return new Date().toISOString();
  }

  /**
   * Builds path+query exactly as it appears on the wire, e.g.
   * /api/v1/dex/market/rwa/tokens?platformId=ondo&tabId=4
   * Uses encodeURIComponent (spaces -> %20, matching Python's quote_via=quote).
   */
  private buildPathWithQuery(path: string, params?: Record<string, string | number>): string {
    if (!params || Object.keys(params).length === 0) return path;
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `${path}?${query}`;
  }

  /**
   * Signs a request and returns everything needed to send it.
   * path: endpoint path WITHOUT the /build prefix, e.g. "/api/v1/dex/pre-transaction/gas-price"
   * params: query params (GET) -- omit for POST-with-body calls
   * body: raw JSON string body (POST/PUT/DELETE); "" for GET/HEAD
   */
  signRequest(
    method: string,
    path: string,
    params?: Record<string, string | number>,
    body = "",
  ): SignedRequest {
    const upperMethod = method.toUpperCase();
    const pathWithQuery = this.buildPathWithQuery(path, params);

    // requestPath used in the signature MUST include the /build prefix.
    const signedRequestPath = BinanceConfig.BUILD_PREFIX + pathWithQuery;

    const timestamp = this.isoTimestamp();
    const preHash = timestamp + upperMethod + signedRequestPath + body;

    const signature = createHmac("sha256", this.apiSecret)
      .update(preHash, "utf-8")
      .digest("base64");

    return {
      url: BinanceConfig.BASE_URL + pathWithQuery,
      headers: {
        "X-OC-APIKEY": this.apiKey,
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signature,
        "Content-Type": "application/json",
      },
    };
  }
}
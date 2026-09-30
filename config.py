"""
config.py
---------
Real Binance Web3 API authentication, per official docs:
https://web3.binance.com/en/dev-docs/authentication

Key facts (confirmed from docs on 2026-09-26):
- Base URL is https://web3.binance.com/build  (the /build prefix is REQUIRED)
- Auth uses 3 headers: X-OC-APIKEY, X-OC-TIMESTAMP, X-OC-SIGN
- Signature = Base64( HMAC-SHA256( timestamp + method + requestPath + body, secretKey ) )
- requestPath MUST include the /build prefix and the raw query string, exactly
  as sent on the wire, or you get error 40102 "Invalid signature"
- timestamp is ISO 8601 with milliseconds, e.g. "2026-05-11T10:08:57.715Z"
- body is "" (empty string) for GET/HEAD requests

Setup:
    export BINANCE_API_KEY="your_key_here"
    export BINANCE_API_SECRET="your_secret_here"
"""

import os
import hmac
import hashlib
import base64
import urllib.parse
from datetime import datetime, timezone


def _load_dotenv():
    """Load KEY=VALUE lines from <repo>/.env (git-ignored) without overriding real env vars."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    try:
        with open(path, encoding="utf-8-sig") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


_load_dotenv()



class BinanceAuthError(Exception):
    """Raised when API credentials are missing or invalid."""
    pass


class BinanceConfig:
    # The /build prefix is mandatory -- both in the URL and in the signed requestPath.
    BASE_URL = "https://web3.binance.com/build"
    BUILD_PREFIX = "/build"

    def __init__(self, api_key: str = None, api_secret: str = None):
        self.api_key = api_key or os.environ.get("BINANCE_API_KEY")
        self.api_secret = api_secret or os.environ.get("BINANCE_API_SECRET")

        if not self.api_key or not self.api_secret:
            raise BinanceAuthError(
                "Missing BINANCE_API_KEY / BINANCE_API_SECRET. "
                "Set them as environment variables before running."
            )

    def _iso_timestamp(self) -> str:
        """
        ISO 8601 timestamp with millisecond precision, e.g. 2026-05-11T10:08:57.715Z
        (matches the exact format Binance's docs require -- NOT plain isoformat(),
        which would give microseconds instead of milliseconds).
        """
        now = datetime.now(timezone.utc)
        return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"

    def _build_path_with_query(self, path: str, params: dict = None) -> str:
        """
        Builds the path+query exactly as it will appear on the wire, e.g.
        /api/v1/dex/market/rwa/tokens?platformId=ondo&tabId=4
        Uses urlencode with quote_via=quote so spaces become %20 (not +),
        matching the docs' raw-encoded requirement.
        """
        if not params:
            return path
        query_str = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
        return f"{path}?{query_str}"

    def sign_request(self, method: str, path: str, params: dict = None, body: str = "") -> dict:
        """
        Signs a request and returns everything needed to send it:
            {
                "url": full URL to call (BASE_URL + path + query),
                "headers": dict of headers to attach,
            }

        path: the endpoint path WITHOUT the /build prefix, e.g. "/api/v1/dex/market/rwa/tokens"
        params: dict of query params (for GET) -- omit for POST-with-body calls
        body: raw JSON string body (for POST/PUT/DELETE); "" for GET/HEAD
        """
        method = method.upper()
        path_with_query = self._build_path_with_query(path, params)

        # requestPath used in the signature MUST include the /build prefix.
        signed_request_path = self.BUILD_PREFIX + path_with_query

        timestamp = self._iso_timestamp()
        pre_hash = timestamp + method + signed_request_path + body

        signature = base64.b64encode(
            hmac.new(
                self.api_secret.encode("utf-8"),
                pre_hash.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode("utf-8")

        return {
            "url": self.BASE_URL + path_with_query,
            "headers": {
                "X-OC-APIKEY": self.api_key,
                "X-OC-TIMESTAMP": timestamp,
                "X-OC-SIGN": signature,
                "Content-Type": "application/json",
            },
        }
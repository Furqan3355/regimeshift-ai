import path from "node:path";
import type { NextConfig } from "next";

// The repo root, so the app can import ../proxy/verdict.mjs: the ONE decision
// engine shared with the paper bot and the tests. Never copy the rules into web/.
const repoRoot = path.join(__dirname, "..");

// The local Node proxy (proxy/server.mjs) holds the Binance keys and serves /api/*.
const PROXY_URL = process.env.PROXY_URL ?? "http://127.0.0.1:8787";

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${PROXY_URL}/api/:path*` }];
  },
};

export default nextConfig;

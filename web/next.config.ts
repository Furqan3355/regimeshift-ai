import path from "node:path";
import type { NextConfig } from "next";

// The repo root, so the app can import ../proxy/verdict.mjs: the ONE decision
// engine shared with the paper bot and the tests. Never copy the rules into web/.
const repoRoot = path.join(__dirname, "..");

// The local Node proxy (proxy/server.mjs) holds the Binance keys and serves /api/*.
const PROXY_URL = process.env.PROXY_URL ?? "http://127.0.0.1:8787";

// Optional path prefix. Local dev and Netlify stay at /.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const staticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const, trailingSlash: true } : {}),
  ...(basePath ? { basePath } : {}),
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  ...(staticExport
    ? {}
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${PROXY_URL}/api/:path*` }];
        },
      }),
};

export default nextConfig;

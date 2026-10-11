"use client";

import { useEffect, useState } from "react";
import { Dot } from "@/components/ui/Badge";

/** LIVE = a reachable price feed; DEMO = illustrative simulated numbers. */
export function LiveBadge({ live, lastUpdate, source }: { live: boolean | null; lastUpdate: number; source?: "binance" | "coingecko" | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  if (live === null) {
    return <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Dot /> Connecting…</span>;
  }
  if (!live) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-wait" title="The local proxy is not reachable, so prices are simulated.">
        <Dot tone="wait" /> <b className="font-semibold">DEMO</b> · simulated data
      </span>
    );
  }
  const secs = Math.max(0, Math.round((now - lastUpdate) / 1000));
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2" title={source === "coingecko" ? "Ondo tokenized-stock prices from CoinGecko." : "Real prices from the Binance RWA API via the proxy."}>
      <Dot tone="buy" /> <b className="font-semibold text-buy">LIVE</b> · updated {secs < 2 ? "just now" : `${secs}s ago`}
    </span>
  );
}

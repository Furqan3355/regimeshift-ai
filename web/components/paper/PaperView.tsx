"use client";

import { useState } from "react";
import { LiveBadge } from "@/components/layout/LiveBadge";
import { Toolbar } from "@/components/layout/Toolbar";
import { Segmented } from "@/components/ui/Segmented";
import { useBot } from "@/hooks/useBot";
import type { Market } from "@/hooks/useMarket";
import type { PaperPortfolio } from "@/hooks/usePaperPortfolio";
import { BotPortfolio } from "./BotPortfolio";
import { MyPortfolio } from "./MyPortfolio";

type Who = "mine" | "bot";

export function PaperView({ active, market, portfolio }: { active: boolean; market: Market; portfolio: PaperPortfolio }) {
  const [who, setWho] = useState<Who>("mine");
  const feed = useBot(active && who === "bot");

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Paper trading</h1>
      <Toolbar end={<LiveBadge live={market.live} lastUpdate={market.lastUpdate} />}>
        <Segmented<Who>
          value={who}
          onChange={setWho}
          options={[
            { value: "mine", label: "My portfolio" },
            { value: "bot", label: "Bot portfolio" },
          ]}
        />
        <span className="hidden text-xs text-muted md:inline">Virtual $10,000 · real prices</span>
      </Toolbar>
      {who === "mine" ? <MyPortfolio market={market} portfolio={portfolio} /> : <BotPortfolio feed={feed} prices={market.prices} />}
    </div>
  );
}

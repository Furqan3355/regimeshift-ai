"use client";

import { useState } from "react";
import { AdvisorView } from "@/components/advisor/AdvisorView";
import { Header, type NavItem } from "@/components/layout/Header";
import { PaperView } from "@/components/paper/PaperView";
import { useMarket } from "@/hooks/useMarket";
import { usePaperPortfolio } from "@/hooks/usePaperPortfolio";

type Tab = "advisor" | "paper";

const NAV: NavItem<Tab>[] = [
  { value: "advisor", label: "Advisor" },
  { value: "paper", label: "Paper trading" },
];

export function Dashboard() {
  const [tab, setTab] = useState<Tab>("advisor");
  const market = useMarket();
  const portfolio = usePaperPortfolio(market.prices);
  const goToPaper = () => { setTab("paper"); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-dvh">
      <Header nav={NAV} active={tab} onNavigate={setTab} />

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        {/* Both views stay mounted so the selected ticker and wallet state survive tab switches. */}
        <div hidden={tab !== "advisor"}>
          <AdvisorView market={market} onPaperBuy={portfolio.buy} goToPaper={goToPaper} />
        </div>
        <div hidden={tab !== "paper"}>
          <PaperView active={tab === "paper"} market={market} portfolio={portfolio} />
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-6 text-xs text-muted sm:px-6">
        RegimeShift AI · BNB Hack. Not financial advice. Verdicts come from fixed rules, never from an LLM.
      </footer>
    </div>
  );
}

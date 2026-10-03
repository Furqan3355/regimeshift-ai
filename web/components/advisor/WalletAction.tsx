"use client";

import { useState } from "react";
import { ArrowUpRight, LoaderCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { connectBsc, hasWallet, shortAddress } from "@/lib/wallet";

type State =
  | { s: "idle"; note?: string }
  | { s: "connecting" }
  | { s: "nowallet" }
  | { s: "connected"; address: string; bnb: string };

/** "Connect wallet" → "Buy on PancakeSwap". RegimeShift never holds funds. */
export function WalletAction({
  ticker,
  onPaperBuy,
  goToPaper,
}: {
  ticker: string;
  onPaperBuy: (ticker: string, usd: number) => void;
  goToPaper: () => void;
}) {
  const [st, setSt] = useState<State>({ s: "idle" });

  async function connect() {
    if (!hasWallet()) return setSt({ s: "nowallet" });
    setSt({ s: "connecting" });
    try {
      setSt({ s: "connected", ...(await connectBsc()) });
    } catch (err) {
      const e = err as { code?: number; message?: string };
      setSt({ s: "idle", note: e.code === 4001 ? "Connection rejected in wallet." : `Could not connect: ${e.message || err}` });
    }
  }

  function buyOnPancake() {
    onPaperBuy(ticker, 50); // also recorded in the paper portfolio, like the original dashboard
    window.open("https://pancakeswap.finance/swap?chain=bsc", "_blank", "noopener");
  }

  const paperLink = (
    <button type="button" onClick={goToPaper} className="cursor-pointer text-ink underline underline-offset-2">
      paper trading
    </button>
  );

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      {st.s === "connected" ? (
        <Button variant="primary" onClick={buyOnPancake} className="w-full sm:w-fit">
          Buy {ticker} on PancakeSwap <ArrowUpRight />
        </Button>
      ) : (
        <Button variant="primary" onClick={connect} disabled={st.s === "connecting"} className="w-full sm:w-fit">
          {st.s === "connecting" ? <LoaderCircle className="animate-spin" /> : <Wallet />}
          {st.s === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>
      )}
      <p className="text-xs text-muted">
        {st.s === "connected" ? (
          <>Connected <code className="font-mono text-ink-2">{shortAddress(st.address)}</code> · {st.bnb} BNB on BSC. RegimeShift never holds your funds.</>
        ) : st.s === "nowallet" ? (
          <>No wallet extension found. Install <a href="https://metamask.io" target="_blank" rel="noopener" className="text-ink underline underline-offset-2">MetaMask</a>, or use {paperLink}.</>
        ) : st.s === "idle" && st.note ? (
          st.note
        ) : (
          <>MetaMask / Trust / Binance Wallet. Or practise with {paperLink} first.</>
        )}
      </p>
    </div>
  );
}

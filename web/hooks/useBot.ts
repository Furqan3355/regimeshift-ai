"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BotSnapshot } from "@/lib/types";

const POLL_MS = 15_000;

export type BotFeed =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; snap: BotSnapshot };

/** Polls the server-side paper bot while `active` (it only exists on the local proxy). */
export function useBot(active: boolean): BotFeed {
  const [feed, setFeed] = useState<BotFeed>({ status: "loading" });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const poll = () =>
      api<BotSnapshot>("/api/bot")
        .then((snap) => { if (!cancelled) setFeed({ status: "ready", snap }); })
        .catch(() => { if (!cancelled) setFeed({ status: "unavailable" }); });
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [active]);

  return feed;
}

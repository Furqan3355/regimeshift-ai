import type { NewsLevel, Regime, VerdictKind } from "@/lib/types";

/** Status colour: buy/positive, wait/caution, skip/negative, or neutral. */
export type Tone = "buy" | "wait" | "skip" | "neutral";

// Full class strings (Tailwind can only see literal class names).
export const TONE = {
  buy: { text: "text-buy", soft: "bg-buy-soft", dot: "bg-buy", edge: "border-l-buy" },
  wait: { text: "text-wait", soft: "bg-wait-soft", dot: "bg-wait", edge: "border-l-wait" },
  skip: { text: "text-skip", soft: "bg-skip-soft", dot: "bg-skip", edge: "border-l-skip" },
  neutral: { text: "text-ink-2", soft: "bg-surface-2", dot: "bg-muted", edge: "border-l-line" },
} satisfies Record<Tone, Record<string, string>>;

export const regimeTone = (r: Regime): Tone => (r === "Risk-On" ? "buy" : r === "Defensive" ? "wait" : "skip");
export const newsTone = (n: NewsLevel): Tone => (n === "clear" ? "buy" : n === "caution" ? "wait" : n === "unavailable" ? "neutral" : "skip");
export const pnlTone = (n: number): Tone => (n >= 0.005 ? "buy" : n <= -0.005 ? "skip" : "neutral");
export const pnlText = (n: number) => TONE[pnlTone(n)].text;
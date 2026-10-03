export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

// No sign on values that round to zero, so the UI never shows "−0.00%".
const sign = (n: number, digits: number) => (Math.abs(n) < 0.5 * 10 ** -digits ? "" : n > 0 ? "+" : "−");

export const signedUsd = (n: number) => `${sign(n, 2)}${usd(Math.abs(n))}`;

export const signedPct = (n: number, digits = 2) => `${sign(n, digits)}${Math.abs(n).toFixed(digits)}%`;

export const stamp = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "–";

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Display-only cleanup of engine text: "$212.28523435756819" → "$212.29", "+/-" → "±". */
export const tidy = (s: string) =>
  s.replace(/(\d+\.\d{3,})/g, (n) => Number(n).toFixed(2)).replace(/\+\/-/g, "±");

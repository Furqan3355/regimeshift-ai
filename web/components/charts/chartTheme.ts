// Shared Recharts styling so every chart reads the same in light and dark mode.

export const AXIS = {
  stroke: "var(--muted)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID = { stroke: "var(--line)", vertical: false } as const;

export const TOOLTIP = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    fontSize: 12,
    padding: "6px 8px",
  },
  labelStyle: { color: "var(--muted)", marginBottom: 2 },
  itemStyle: { color: "var(--ink)", padding: 0 },
} as const;

export const shortDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Axis label for prices: no cents above $1,000, 2 decimals otherwise. */
export const axisUsd = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(n >= 100 ? 0 : 2)}`;

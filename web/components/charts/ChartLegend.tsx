/** Tiny inline legend for a card header: a solid or dashed swatch per series. */
export function ChartLegend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <span className="flex items-center gap-3 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <svg width="14" height="4" aria-hidden>
            <line x1="0" y1="2" x2="14" y2="2" stroke={i.color} strokeWidth="2" strokeDasharray={i.dashed ? "3 2" : undefined} />
          </svg>
          {i.label}
        </span>
      ))}
    </span>
  );
}

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardList } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import type { Tone } from "@/components/ui/tone";

export interface ActivityItem {
  key: string;
  text: ReactNode;
  time: string;
  badge?: { label: string; tone: Tone };
}

export function ActivityLog({
  title,
  meta,
  items,
  empty,
  className,
}: {
  title: string;
  meta?: ReactNode;
  items: ActivityItem[];
  empty: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} meta={meta} />
      {items.length ? (
        <CardList>
          {items.map((l) => (
            <li key={l.key} className="flex items-start gap-2.5 px-4 py-2 text-sm">
              {l.badge && <Badge tone={l.badge.tone} className="mt-px w-10 justify-center uppercase">{l.badge.label}</Badge>}
              <p className="min-w-0 flex-1 text-ink-2">{l.text}</p>
              <time className="shrink-0 pt-px text-xs text-muted tabular-nums">{l.time}</time>
            </li>
          ))}
        </CardList>
      ) : (
        <EmptyState>{empty}</EmptyState>
      )}
    </Card>
  );
}

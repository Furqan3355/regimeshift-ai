import { Card, CardHeader } from "@/components/ui/Card";
import { Dot } from "@/components/ui/Badge";
import { newsTone, regimeTone, type Tone } from "@/components/ui/tone";
import { capitalize, signedPct } from "@/lib/format";
import type { Verdict } from "@/lib/types";
import { OFFHOURS } from "@/lib/verdict";

const marketNote = (m: Verdict["market"]): [Tone, string] => {
  const mult = OFFHOURS[m].m; // the engine's size multiplier for this market status
  return mult === 1 ? ["buy", "full size"] : mult === 0 ? ["wait", "no new positions"] : ["wait", `${Math.round(mult * 100)}% size`];
};

/** The four inputs behind the verdict, one compact row each. */
export function SignalList({ verdict: r }: { verdict: Verdict }) {
  const wide = r.triggers.some((t) => t.code === "wide_spread");
  const [mTone, mNote] = marketNote(r.market);

  const rows: { label: string; value: string; note: string; tone: Tone }[] = [
    { label: "Regime", value: r.regime, note: `${(r.conf * 100).toFixed(1)}% conf.`, tone: regimeTone(r.regime) },
    { label: "Spread", value: signedPct(r.spreadPct), note: r.anomalous ? "glitch" : wide ? "too wide" : "OK", tone: r.anomalous ? "skip" : wide ? "wait" : "buy" },
    { label: "News", value: capitalize(r.news.level), note: r.news.trigger ? `“${r.news.trigger}”` : "", tone: newsTone(r.news.level) },
    { label: "Market", value: capitalize(r.marketLabel), note: mNote, tone: mTone },
  ];

  return (
    <Card>
      <CardHeader title="Signals" />
      <dl className="divide-y divide-line">
        {rows.map((s) => (
          <div key={s.label} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 px-4 py-2 text-sm">
            <dt className="text-muted">{s.label}</dt>
            <dd className="flex min-w-0 items-center gap-2 font-medium">
              <Dot tone={s.tone} />
              <span className="truncate tabular-nums">{s.value}</span>
            </dd>
            <dd className="text-right text-xs text-muted">{s.note}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

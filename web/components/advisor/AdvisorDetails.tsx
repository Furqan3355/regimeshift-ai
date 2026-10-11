import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { KeyValue } from "@/components/ui/KeyValue";
import { capitalize, cn, signedPct, tidy, usd } from "@/lib/format";
import type { NewsArticle, TickerData, Verdict } from "@/lib/types";

/** http(s) only. A bad URL stays plain text instead of becoming a link. */
function articleHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function headlineItems(d: TickerData): NewsArticle[] {
  if (d.articles?.length) return d.articles.filter((a) => a.headline);
  return d.news.split("|").map((s) => s.trim()).filter(Boolean).map((headline) => ({ headline, url: null }));
}

/** Secondary information, collapsed by default so the answer and charts come first. */
export function AdvisorDetails({ data: d, verdict: r }: { data: TickerData; verdict: Verdict }) {
  const headlines = headlineItems(d);

  return (
    <Card>
      <Disclosure title="Why this verdict?">
        <ul className="list-disc space-y-1 pl-4 text-sm text-ink-2 marker:text-muted">
          {r.reasons.map((reason, i) => <li key={i}>{tidy(reason)}</li>)}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Fixed, tested rules decide; no LLM makes the call. Every extra signal can only make the verdict more cautious.
          The most severe rule wins and size is multiplied by every caution factor. LIVE uses a live tokenized-stock
          feed. DEMO uses built-in illustrative numbers.
        </p>
      </Disclosure>

      <Disclosure title="Rules that fired" meta={r.triggers.length || "none"}>
        {r.triggers.length ? (
          <ul className="space-y-2">
            {r.triggers.map((t) => (
              <li key={t.code} className="flex items-start gap-2 text-sm">
                <Badge tone={t.level} className="mt-0.5 uppercase">{t.level}</Badge>
                <span className="min-w-0 text-ink-2">
                  <code className="mr-1.5 font-mono text-xs text-muted">{t.code}</code>
                  {tidy(t.text)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No blocking rule fired.</p>
        )}
      </Disclosure>

      <Disclosure title="Technical values">
        <KeyValue
          rows={[
            ["Trend", capitalize(d.ta.trend)],
            ["RSI (14)", String(d.ta.rsi ?? "n/a")],
            ["20-day average", d.ta.sma != null ? usd(d.ta.sma) : "n/a"],
            ["20-day low", usd(d.ta.low)],
            ...(d.ta.high != null ? [["20-day high", usd(d.ta.high)] as [string, string]] : []),
            ["On-chain price", usd(d.onp)],
            ["Reference price", usd(d.refp)],
            ["Daily return", signedPct(d.ret)],
            ["7-day volatility", `${d.vol.toFixed(2)}%`],
          ]}
        />
      </Disclosure>

      <Disclosure title="Headlines" meta={headlines.length || "none"} defaultOpen={headlines.length > 0}>
        {headlines.length ? (
          <ul className="space-y-1.5">
            {headlines.map((a, i) => {
              const hit = a.headline === r.news.headline;
              const href = articleHref(a.url);
              return (
                <li key={i} title={a.headline} className={cn("line-clamp-2 text-sm", hit ? "text-ink" : "text-ink-2")}>
                  {hit && <Badge tone={r.news.level === "serious" ? "skip" : "wait"} className="mr-1.5">rule</Badge>}
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2 hover:text-ink">
                      {a.headline}
                    </a>
                  ) : (
                    a.headline
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No recent headlines available.</p>
        )}
      </Disclosure>
    </Card>
  );
}

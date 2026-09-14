"use client";

import type { AnalysisChargeReceipt } from "@/lib/billing";
import type { AnalysisUsage } from "@/lib/types";

const number = (value: number) => value.toLocaleString("tr-TR");
const usd = (nanoUsd: number) =>
  (nanoUsd / 1_000_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });

/**
 * A compact, in-flow receipt. It intentionally comes after the result rather
 * than floating over the UI, so each meal shows exactly what was spent.
 */
export default function TokenMeter({
  usage,
  receipt,
}: {
  usage: AnalysisUsage;
  receipt: AnalysisChargeReceipt | null;
}) {
  if (!receipt) return null;
  const cached = usage.cached_input || 0;
  const searches = usage.web_searches || 0;

  return (
    <section className="space-y-2.5 p-4" aria-label="Fitcoin analiz makbuzu">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Analiz makbuzu</p>
        <span className="mono text-[12px] text-[var(--accent-ink)]">−{number(receipt.charged_fitcoin)} FC</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] leading-snug text-[var(--muted)] sm:grid-cols-4">
        <p>
          <span className="block text-[var(--faint)]">Giriş</span>
          <span className="mono text-[var(--ink)]">{number(usage.input)}</span>
        </p>
        <p>
          <span className="block text-[var(--faint)]">Önbellek</span>
          <span className="mono text-[var(--ink)]">{number(cached)}</span>
        </p>
        <p>
          <span className="block text-[var(--faint)]">Çıkış</span>
          <span className="mono text-[var(--ink)]">{number(usage.output)}</span>
        </p>
        <p>
          <span className="block text-[var(--faint)]">Web araması</span>
          <span className="mono text-[var(--ink)]">{number(searches)}</span>
        </p>
      </div>
      <p className="mono text-[11px] leading-snug text-[var(--faint)]">
        {usd(receipt.cost_nano_usd)} tahmini maliyet · kalan {number(receipt.available_fitcoin)} FC
      </p>
    </section>
  );
}

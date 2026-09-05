"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DonutChart, type DonutChartSegment } from "@/components/ui/donut-chart";
import { kcal } from "@/lib/format";

type Totals = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

/** Makro başına enerji yoğunluğu (kcal/g) — Atwater katsayıları. */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const g = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString("tr-TR")} g`;

/**
 * Günün kalorisinin ne kadarının hangi makrodan geldiğini gösterir.
 *
 * Makro toplamlarından gelen kaloriyi günün toplamıyla karşılaştırıyoruz;
 * aradaki fark "hesaplanamayan" olarak ayrı bir dilim. Bunu gizlemek, eksik
 * makro verisini doluymuş gibi göstermek olurdu.
 */
export default function MacroDonut({ totals }: { totals: Totals }) {
  const [hovered, setHovered] = useState<DonutChartSegment | null>(null);

  const { segments, fromMacros, unaccounted } = useMemo(() => {
    const p = totals.protein_g * KCAL_PER_G.protein;
    const c = totals.carbs_g * KCAL_PER_G.carbs;
    const f = totals.fat_g * KCAL_PER_G.fat;
    const sum = p + c + f;
    // Etiketsiz kalemlerde makro bilinmiyor; toplam kalori daha büyük olabilir.
    const rest = Math.max(0, totals.kcal - sum);

    const list: DonutChartSegment[] = [
      { label: "Protein", value: p, color: "var(--macro-protein)" },
      { label: "Karbonhidrat", value: c, color: "var(--macro-carbs)" },
      { label: "Yağ", value: f, color: "var(--macro-fat)" },
    ];
    if (rest > 1) list.push({ label: "Hesaplanamayan", value: rest, color: "var(--macro-rest)" });

    return { segments: list, fromMacros: sum, unaccounted: rest };
  }, [totals]);

  const total = fromMacros + unaccounted;
  const gramsOf: Record<string, number> = {
    Protein: totals.protein_g,
    Karbonhidrat: totals.carbs_g,
    Yağ: totals.fat_g,
  };

  const centerLabel = hovered?.label ?? "Bugün";
  const centerValue = hovered ? Math.round(hovered.value) : Math.round(totals.kcal);
  const centerPct = hovered ? pct(hovered.value, total) : null;

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Kalori dağılımı</p>
        {unaccounted > 1 && (
          <p className="mono text-[10px] text-[var(--faint)]">
            %{Math.round(pct(unaccounted, total))} makrosu bilinmiyor
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
        <DonutChart
          data={segments}
          size={168}
          strokeWidth={22}
          onSegmentHover={setHovered}
          className="shrink-0"
          centerContent={
            <AnimatePresence mode="wait">
              <motion.div
                key={centerLabel}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.18, ease: "circOut" }}
                className="flex flex-col items-center"
              >
                <p className="eyebrow max-w-[92px] truncate">{centerLabel}</p>
                <p className="figure mt-1 text-[30px]">{kcal(centerValue)}</p>
                <p className="mono text-[10px] text-[var(--faint)]">
                  {centerPct === null ? "kcal" : `kcal · %${Math.round(centerPct)}`}
                </p>
              </motion.div>
            </AnimatePresence>
          }
        />

        <ul className="w-full space-y-1.5">
          {segments.map((s) => {
            const share = Math.round(pct(s.value, total));
            const grams = gramsOf[s.label];
            const active = hovered?.label === s.label;
            return (
              <li
                key={s.label}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(null)}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors ${
                  active ? "bg-[var(--sunk)]" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.label}</span>
                {grams !== undefined && (
                  <span className="mono shrink-0 text-[11px] text-[var(--faint)]">{g(grams)}</span>
                )}
                <span className="mono w-9 shrink-0 text-right text-[13px]">%{share}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

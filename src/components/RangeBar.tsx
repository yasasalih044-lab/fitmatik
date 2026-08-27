"use client";

/**
 * Uygulamanın imzası. Tek bir kalori sayısı yalan söyler; burada
 * kaynakların söylediği aralık ve içine düşen en iyi tahmin görünür.
 */
export default function RangeBar({
  min,
  max,
  best,
  scaleMax,
  compact = false,
}: {
  min: number;
  max: number;
  best: number;
  scaleMax?: number;
  compact?: boolean;
}) {
  const top = Math.max(scaleMax ?? max * 1.15, max, best, 1);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`;
  const spanW = `${Math.min(100, Math.max(1.5, ((max - min) / top) * 100))}%`;

  return (
    <div className={compact ? "" : "space-y-2"}>
      <div className="rangebar" role="img" aria-label={`${min} ile ${max} kalori arası, en iyi tahmin ${best} kalori`}>
        <div className="rangebar__span" style={{ left: pct(min), width: spanW }} />
        <div className="rangebar__pin" style={{ left: pct(best) }} />
      </div>
      {!compact && (
        <div className="mono flex justify-between text-[11px] text-[var(--faint)]">
          <span>{min} kcal</span>
          <span>{max} kcal</span>
        </div>
      )}
    </div>
  );
}

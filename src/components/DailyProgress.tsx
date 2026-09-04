"use client";

import Link from "next/link";
import { kcal } from "@/lib/format";
import type { Targets } from "@/lib/accounts";

type Totals = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

const g = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString("tr-TR")} g`;

function Bar({ label, value, target, unit }: { label: string; value: number; target: number; unit: "kcal" | "g" }) {
  const pct = target > 0 ? Math.min(200, (value / target) * 100) : 0;
  const over = value > target;
  const left = Math.max(0, target - value);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
        <span className="mono text-[11px] text-[var(--muted)]">
          <span className="text-[var(--ink)]">{unit === "kcal" ? kcal(value) : g(value)}</span>
          <span className="text-[var(--faint)]"> / {unit === "kcal" ? kcal(target) : g(target)}</span>
        </span>
      </div>
      <div className="h-[5px] overflow-hidden rounded-full bg-[var(--sunk)]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: over ? "var(--red)" : "var(--ink)",
          }}
        />
      </div>
      <p className="mono text-[10px] text-[var(--faint)]">
        {over
          ? `${unit === "kcal" ? kcal(value - target) : g(value - target)} aşıldı`
          : `${unit === "kcal" ? kcal(left) : g(left)} kaldı · %${Math.round(pct)}`}
      </p>
    </div>
  );
}

export default function DailyProgress({ totals, targets }: { totals: Totals; targets: Targets }) {
  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Günlük hedef</p>
        <Link href="/ayarlar" className="btn btn-quiet text-[11px]">
          Düzenle
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Bar label="Kalori" value={totals.kcal} target={targets.kcal} unit="kcal" />
        <Bar label="Protein" value={totals.protein_g} target={targets.protein_g} unit="g" />
        <Bar label="Karbonhidrat" value={totals.carbs_g} target={targets.carbs_g} unit="g" />
        <Bar label="Yağ" value={totals.fat_g} target={targets.fat_g} unit="g" />
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { kcal } from "@/lib/format";
import { DEFAULT_TARGETS, writeTargets, type Targets } from "@/lib/targets";

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

export default function DailyProgress({
  totals,
  targets,
  onChange,
}: {
  totals: Totals;
  targets: Targets;
  onChange: (t: Targets) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(targets);

  function save() {
    writeTargets(draft);
    onChange(draft);
    setEditing(false);
  }

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Günlük hedef</p>
        <button onClick={() => { setDraft(targets); setEditing((v) => !v); }} className="btn btn-quiet text-[11px]">
          {editing ? "Vazgeç" : "Düzenle"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-3">
          {([
            ["kcal", "Kalori (kcal)"],
            ["protein_g", "Protein (g)"],
            ["carbs_g", "Karbonhidrat (g)"],
            ["fat_g", "Yağ (g)"],
          ] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-[var(--muted)]">{label}</span>
              <input
                type="text"
                inputMode="numeric"
                value={String(draft[k])}
                onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                className="mono w-24 py-2 text-center text-[14px]"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary flex-1 py-2.5 text-sm">Kaydet</button>
            <button onClick={() => setDraft(DEFAULT_TARGETS)} className="btn btn-ghost px-3 py-2.5 text-[13px]">
              Varsayılan
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Bar label="Kalori" value={totals.kcal} target={targets.kcal} unit="kcal" />
          <Bar label="Protein" value={totals.protein_g} target={targets.protein_g} unit="g" />
          <Bar label="Karbonhidrat" value={totals.carbs_g} target={targets.carbs_g} unit="g" />
          <Bar label="Yağ" value={totals.fat_g} target={targets.fat_g} unit="g" />
        </div>
      )}
    </section>
  );
}

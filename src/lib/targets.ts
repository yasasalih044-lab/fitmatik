"use client";

/**
 * Günlük hedefler. Kişisel bir uygulama olduğu için tarayıcıda tutuluyor —
 * sunucuya taşımak gerekirse tek yer burası.
 */
export type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export const DEFAULT_TARGETS: Targets = { kcal: 2400, protein_g: 150, carbs_g: 250, fat_g: 80 };

const KEY = "fitmatik.targets.v1";

export function readTargets(): Targets {
  if (typeof window === "undefined") return DEFAULT_TARGETS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_TARGETS;
    const p = JSON.parse(raw) as Partial<Targets>;
    const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    return {
      kcal: n(p.kcal, DEFAULT_TARGETS.kcal),
      protein_g: n(p.protein_g, DEFAULT_TARGETS.protein_g),
      carbs_g: n(p.carbs_g, DEFAULT_TARGETS.carbs_g),
      fat_g: n(p.fat_g, DEFAULT_TARGETS.fat_g),
    };
  } catch {
    return DEFAULT_TARGETS;
  }
}

export function writeTargets(t: Targets) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* özel sekmede yazılamayabilir; varsayılanlarla devam */
  }
}

/**
 * Hedef seçimi kalori/makro hedeflerini nasıl etkiler.
 *
 * Kaynak: ISSN "diets and body composition" position stand (Aragon ve ark. 2017,
 * J Int Soc Sports Nutr) — kesimde 2.3–3.1 g/kg (yağsız kütle) protein, çoğu
 * antrenmanlı kişi için 1.4–2.0 g/kg idame; kalori açığı/fazlası büyüklüğü
 * antrenman durumuna göre değişir. Buradaki yüzdeler o aralığın ölçülü ucundan
 * (agresif değil) seçildi; hiçbiri tıbbi tavsiye yerine geçmez.
 */
export type Goal = "kilo_ver" | "koru_kas" | "kilo_al";
export type TrainingMode = "bulk" | "definasyon" | null;

export type GoalProfile = {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: "kadin" | "erkek" | "belirtmek-istemiyorum";
};

export type GoalTargets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export const GOALS: { id: Goal; label: string; blurb: string }[] = [
  { id: "kilo_ver", label: "Kilo vermek", blurb: "Ölçülü kalori açığı; kası korumak için protein yüksek tutulur." },
  { id: "koru_kas", label: "Kilo korurken kas kazanmak", blurb: "İdame kalori; kas kazanımı için protein artırılır." },
  { id: "kilo_al", label: "Kilo almak", blurb: "Ölçülü kalori fazlası; yağlanmayı sınırlamak için kontrollü." },
];

export function isGoal(value: unknown): value is Goal {
  return typeof value === "string" && GOALS.some((g) => g.id === value);
}

export function isTrainingMode(value: unknown): value is TrainingMode {
  return value === null || value === undefined || value === "bulk" || value === "definasyon";
}

const KCAL_FACTOR: Record<Goal, { standart: number; refined: number | null }> = {
  kilo_ver: { standart: 0.8, refined: 0.75 },
  koru_kas: { standart: 1, refined: null },
  kilo_al: { standart: 1.12, refined: 1.18 },
};

const PROTEIN_PER_KG: Record<Goal, { standart: number; refined: number | null }> = {
  kilo_ver: { standart: 2.2, refined: 2.4 },
  koru_kas: { standart: 2.0, refined: null },
  kilo_al: { standart: 1.8, refined: 1.8 },
};

const REFINES: Record<Goal, TrainingMode> = { kilo_ver: "definasyon", koru_kas: null, kilo_al: "bulk" };

/** Mifflin-St Jeor + hedefe göre kalori çarpanı ve protein/kg; kalan karbonhidrata gider. */
export function suggestTargetsForGoal(profile: GoalProfile, goal: Goal, mode: TrainingMode = null): GoalTargets {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const bmr = profile.gender === "erkek" ? base + 5 : profile.gender === "kadin" ? base - 161 : base - 78;
  const tdee = bmr * 1.375;

  const refined = mode !== null && mode === REFINES[goal];
  const kcalFactor = refined ? (KCAL_FACTOR[goal].refined ?? KCAL_FACTOR[goal].standart) : KCAL_FACTOR[goal].standart;
  const proteinPerKg = refined ? (PROTEIN_PER_KG[goal].refined ?? PROTEIN_PER_KG[goal].standart) : PROTEIN_PER_KG[goal].standart;

  const kcal = Math.max(1200, Math.round((tdee * kcalFactor) / 10) * 10);
  const protein_g = Math.round(profile.weightKg * proteinPerKg);
  const fat_g = Math.round((kcal * 0.28) / 9);
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));

  return { kcal, protein_g, carbs_g, fat_g };
}

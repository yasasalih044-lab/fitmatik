/**
 * Gün, gece yarısında değil **öğlen 12:00'da** başlar.
 *
 * Sebebi: gece 00:30'da yenen atıştırmalık kullanıcı için "dünün" devamıdır,
 * yeni günün başlangıcı değil. 12:00 sınırıyla 12:00–11:59 arası tek blok olur.
 * Değiştirmek için tek yer: NEXT_PUBLIC_DAY_START_HOUR (varsayılan 12).
 */
export const DAY_START_HOUR = (() => {
  const v = Number(process.env.NEXT_PUBLIC_DAY_START_HOUR);
  return Number.isInteger(v) && v >= 0 && v <= 23 ? v : 12;
})();

export const kcal = (n: number) => Math.round(n).toLocaleString("tr-TR");

const pad = (n: number) => String(n).padStart(2, "0");

/** Bir zamanın ait olduğu günlük bloğun anahtarı (YYYY-MM-DD). */
export function dayKey(iso: string | Date): string {
  const d = new Date(iso);
  d.setHours(d.getHours() - DAY_START_HOUR);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = () => dayKey(new Date());

/** Bir blok anahtarının gerçek başlangıç anı (yerel saat). */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, DAY_START_HOUR, 0, 0, 0);
}

/** Şu an içinde bulunduğumuz bloğun başlangıcı — "bugün" sorgularının alt sınırı. */
export const currentDayStart = () => dayStart(todayKey());

/** Bir bloğun anahtarını n gün geriye kaydır. */
export function shiftKey(key: string, days: number): string {
  const d = dayStart(key);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function dayLabel(key: string) {
  const today = todayKey();
  if (key === today) return "Bugün";
  if (key === shiftKey(today, -1)) return "Dün";
  return dayStart(key).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });
}

export const confidenceLabel = (c: string) =>
  c === "high" ? "etiketten" : c === "medium" ? "kaynaklı" : "tahmini";

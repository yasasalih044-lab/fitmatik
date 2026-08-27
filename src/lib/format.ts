export const kcal = (n: number) => Math.round(n).toLocaleString("tr-TR");

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const todayKey = () => dayKey(new Date().toISOString());

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function dayLabel(key: string) {
  const today = todayKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return "Bugün";
  if (key === dayKey(y.toISOString())) return "Dün";
  const [yy, mm, dd] = key.split("-").map(Number);
  return new Date(yy, mm - 1, dd).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });
}

export const confidenceLabel = (c: string) =>
  c === "high" ? "etiketten" : c === "medium" ? "kaynaklı" : "tahmini";

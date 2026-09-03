/**
 * Open Food Facts istemcisi.
 *
 * Neden bu: paketli ürünlerde tek doğru kaynak ambalajın üstündeki etiket.
 * Barkod, o fiziksel ürünün kimliği — web araması "eti gong kaç kalori" diye
 * sorup ortalama bir sayı uydururken barkod tam o paketin değerlerini verir.
 * Veri açık, anahtar gerektirmiyor, sunucudan çağrılabiliyor.
 *
 * Hız sınırları (OFF belgelerine göre): ürün 100/dk, arama 10/dk.
 */

const HOST = "https://world.openfoodfacts.org";
const SEARCH_HOST = "https://search.openfoodfacts.org";
const UA = `Fitmatik/1.0 (${process.env.CONTACT_EMAIL || "fitmatik@mavrosai.site"})`;

const FIELDS = [
  "code", "product_name", "product_name_tr", "brands", "quantity",
  "serving_size", "serving_quantity", "nutriments", "nutrition_data_per",
].join(",");

export type FoodFact = {
  code: string;
  name: string;
  brand: string | null;
  /** Ambalaj gramajı, etikette yazan haliyle: "36 g" */
  quantity: string | null;
  serving_size: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  fiber_100g: number | null;
  url: string;
};

/* --- Uçnoktası başına küçük bir jeton kovası --------------------------- */
const buckets: Record<string, number[]> = {};
function allow(kind: "product" | "search", perMinute: number): boolean {
  const now = Date.now();
  const b = (buckets[kind] ||= []);
  while (b.length && now - b[0] > 60_000) b.shift();
  if (b.length >= perMinute) return false;
  b.push(now);
  return true;
}

async function getJson(url: string, timeoutMs = 8000): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[fitmatik] OFF ${res.status}: ${url}`);
      return null;
    }
    const text = await res.text();
    return text.trim().startsWith("{") ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch (e) {
    console.warn("[fitmatik] OFF isteği başarısız:", e instanceof Error ? e.message : e);
    return null;
  }
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function toFact(p: Record<string, unknown> | undefined | null): FoodFact | null {
  if (!p || !p.code) return null;
  const n = (p.nutriments || {}) as Record<string, unknown>;
  const name =
    (p.product_name_tr as string) || (p.product_name as string) || (p.generic_name as string) || "";
  const kcal = num(n["energy-kcal_100g"]) ?? (num(n["energy_100g"]) !== null ? Math.round(num(n["energy_100g"])! / 4.184) : null);
  if (!name && kcal === null) return null;

  // v2 API markayı virgüllü metin, arama servisi ise dizi olarak veriyor.
  const raw = p.brands;
  const brand = Array.isArray(raw)
    ? (raw[0] != null ? String(raw[0]).trim() : null)
    : typeof raw === "string" && raw.trim()
      ? raw.split(",")[0].trim()
      : null;

  return {
    code: String(p.code),
    name: name.trim(),
    brand: brand || null,
    quantity: (p.quantity as string) || null,
    serving_size: (p.serving_size as string) || null,
    kcal_100g: kcal,
    protein_100g: num(n["proteins_100g"]),
    carbs_100g: num(n["carbohydrates_100g"]),
    fat_100g: num(n["fat_100g"]),
    fiber_100g: num(n["fiber_100g"]),
    url: `https://world.openfoodfacts.org/product/${p.code}`,
  };
}

/** Barkodla tam eşleşme — paketli ürünler için en güvenilir yol. */
export async function lookupBarcode(code: string): Promise<FoodFact | null> {
  const clean = (code || "").replace(/\D/g, "");
  if (clean.length < 8 || clean.length > 14) return null;
  if (!allow("product", 90)) return null;

  const d = await getJson(`${HOST}/api/v2/product/${clean}.json?fields=${FIELDS}`);
  if (!d || d.status === 0) return null;
  const fact = toFact(d.product as Record<string, unknown>);
  return fact?.kcal_100g !== null && fact ? fact : null;
}

/** Marka + ürün adıyla arama. Besin değeri olmayan kayıtlar elenir. */
export async function searchProducts(query: string, limit = 3): Promise<FoodFact[]> {
  const q = (query || "").trim();
  if (q.length < 3) return [];
  if (!allow("search", 8)) return [];

  const url = `${SEARCH_HOST}/search?q=${encodeURIComponent(q)}&page_size=${Math.min(limit * 4, 20)}&fields=${FIELDS}`;
  const d = await getJson(url, 10_000);
  const hits = (d?.hits as Record<string, unknown>[]) || [];

  return hits
    .map(toFact)
    .filter((f): f is FoodFact => !!f && f.kcal_100g !== null)
    .slice(0, limit);
}

/**
 * Tüketilen gram miktarını, 100 g başına değerlerden gerçek besin değerine çevirir.
 * Aritmetiği modele bırakmak yerine burada yapıyoruz: model porsiyonu tahmin eder,
 * veritabanı yoğunluğu verir, hesabı kod yapar.
 */
export function scaleToGrams(fact: FoodFact, grams: number) {
  const f = (per100: number | null) =>
    per100 === null || !Number.isFinite(grams) ? null : Math.round(((per100 * grams) / 100) * 10) / 10;
  return {
    kcal: f(fact.kcal_100g) === null ? null : Math.round(f(fact.kcal_100g)!),
    protein_g: f(fact.protein_100g),
    carbs_g: f(fact.carbs_100g),
    fat_g: f(fact.fat_100g),
  };
}

/** "36 g", "330 ml", "2 x 45g" gibi metinlerden gram çıkarır. */
export function gramsFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.toLowerCase().replace(",", ".");
  const multi = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(g|gr|ml)\b/.exec(s);
  if (multi) return Number(multi[1]) * Number(multi[2]);
  const one = /(\d+(?:\.\d+)?)\s*(g|gr|ml)\b/.exec(s);
  return one ? Number(one[1]) : null;
}

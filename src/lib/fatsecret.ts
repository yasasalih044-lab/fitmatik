/**
 * FatSecret Platform API — OAuth 2.0 client credentials.
 *
 * Türkiye gıda veritabanı kapsamı Open Food Facts'ten çok daha iyi; markalı
 * ürünlerde asıl kaynağımız bu. `basic` kapsamı foods.search ve food.get verir
 * (barkod ve NLP uçnoktaları Premier kapsamında).
 *
 * DİKKAT: FatSecret istekleri IP allowlist'e tabi. Sunucunun çıkış IP'si
 * platform.fatsecret.com paneline eklenmezse her çağrı `code: 21` döner.
 */

const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const API_URL = "https://platform.fatsecret.com/rest/server.api";

export type FsFood = {
  id: string;
  name: string;
  brand: string | null;
  /** "Per 100g - Calories: 450kcal | Fat: 17.00g | ..." */
  description: string;
  url: string;
};

export type FsServing = {
  description: string;
  metric_amount: number | null;
  metric_unit: string | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
};

export type FsDetail = {
  id: string;
  name: string;
  brand: string | null;
  url: string;
  servings: FsServing[];
};

export class FatSecretIpError extends Error {
  ip: string;
  constructor(ip: string) {
    super(`FatSecret bu IP'yi tanımıyor: ${ip}`);
    this.ip = ip;
  }
}

export function configured(): boolean {
  return !!(process.env.FATSECRET_CLIENT_ID && process.env.FATSECRET_CLIENT_SECRET);
}

/* --- Jeton önbelleği: token 24 saat geçerli, her istekte yenileme --------- */
let token: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (!configured()) return null;
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;

  const basic = Buffer.from(
    `${process.env.FATSECRET_CLIENT_ID}:${process.env.FATSECRET_CLIENT_SECRET}`,
  ).toString("base64");

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=basic",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn(`[fitmatik] FatSecret token alınamadı: HTTP ${res.status}`);
      return null;
    }
    const d = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!d.access_token) return null;
    token = { value: d.access_token, expiresAt: Date.now() + (d.expires_in ?? 86_400) * 1000 };
    return token.value;
  } catch (e) {
    console.warn("[fitmatik] FatSecret token hatası:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function call(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const at = await accessToken();
  if (!at) return null;

  const qs = new URLSearchParams({ format: "json", region: process.env.FATSECRET_REGION || "TR", ...params });
  try {
    const res = await fetch(`${API_URL}?${qs}`, {
      headers: { Authorization: `Bearer ${at}` },
      signal: AbortSignal.timeout(12_000),
    });
    const d = (await res.json()) as Record<string, unknown>;
    const err = d.error as { code?: number; message?: string } | undefined;
    if (err) {
      if (err.code === 21) {
        const ip = /'([^']+)'/.exec(err.message || "")?.[1] || "bilinmiyor";
        throw new FatSecretIpError(ip);
      }
      console.warn(`[fitmatik] FatSecret hata ${err.code}: ${err.message}`);
      return null;
    }
    return d;
  } catch (e) {
    if (e instanceof FatSecretIpError) throw e;
    console.warn("[fitmatik] FatSecret isteği başarısız:", e instanceof Error ? e.message : e);
    return null;
  }
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v ? [v as T] : []);
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Ada göre arama. Bulunamazsa boş dizi. */
export async function searchFoods(query: string, max = 5): Promise<FsFood[]> {
  const q = (query || "").trim();
  if (q.length < 2) return [];

  const d = await call({ method: "foods.search", search_expression: q, max_results: String(max) });
  const raw = asArray<Record<string, unknown>>((d?.foods as Record<string, unknown>)?.food);

  return raw.map((f) => ({
    id: String(f.food_id),
    name: String(f.food_name || ""),
    brand: (f.brand_name as string) || null,
    description: String(f.food_description || ""),
    url: String(f.food_url || ""),
  }));
}

/** Bir ürünün tüm porsiyon/besin ayrıntısı. */
export async function getFood(id: string): Promise<FsDetail | null> {
  const d = await call({ method: "food.get.v2", food_id: id });
  const f = d?.food as Record<string, unknown> | undefined;
  if (!f) return null;

  const servings = asArray<Record<string, unknown>>((f.servings as Record<string, unknown>)?.serving).map((s) => ({
    description: String(s.serving_description || ""),
    metric_amount: num(s.metric_serving_amount),
    metric_unit: (s.metric_serving_unit as string) || null,
    kcal: num(s.calories),
    protein_g: num(s.protein),
    carbs_g: num(s.carbohydrate),
    fat_g: num(s.fat),
    fiber_g: num(s.fiber),
  }));

  return {
    id: String(f.food_id),
    name: String(f.food_name || ""),
    brand: (f.brand_name as string) || null,
    url: String(f.food_url || ""),
    servings,
  };
}

/** 100 g başına değerleri veren porsiyonu bul; yoksa metrik bir porsiyondan ölçekle. */
export function per100g(detail: FsDetail): {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
} | null {
  const metric = detail.servings.filter(
    (s) => s.metric_amount && s.metric_unit && /^(g|ml)$/i.test(s.metric_unit) && s.kcal !== null,
  );
  if (!metric.length) return null;

  // 100 g/ml olan porsiyon varsa doğrudan kullan, yoksa en güvenilir metriği ölçekle.
  const exact = metric.find((s) => Math.abs((s.metric_amount || 0) - 100) < 0.5);
  const s = exact ?? metric[0];
  const factor = 100 / (s.metric_amount || 100);
  const f = (v: number | null) => (v === null ? null : Math.round(v * factor * 10) / 10);

  return {
    kcal: s.kcal === null ? null : Math.round(s.kcal * factor),
    protein_g: f(s.protein_g),
    carbs_g: f(s.carbs_g),
    fat_g: f(s.fat_g),
  };
}

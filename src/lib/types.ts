export type Source = "text" | "image";

/** Bir kalemin sayıları nereden geldi — kullanıcı güvenini buna göre ayarlasın. */
export type Basis = "etiket" | "barkod" | "veritabani" | "web" | "tahmin";

export type FoodItem = {
  /** Yemeğin adı, Türkçe. Paketli üründe marka + ürün adı. */
  name: string;
  /** Miktar/porsiyon açıklaması: "2 dilim", "1 kutu 330ml", "orta boy 1 adet" */
  qty: string;
  /** Paketli ürünse marka, değilse null */
  brand: string | null;
  /** Paketli (etiketli) ürün mü */
  packaged: boolean;
  kcal_min: number;
  kcal_max: number;
  kcal_best: number;
  /** Tüketilen miktarın gram karşılığı (biliniyorsa) */
  grams: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  basis: Basis;
  /** Open Food Facts'te eşleşen ürünün barkodu */
  barcode: string | null;
  /** Bu kalem için kısa not / nereden geldiği */
  note: string;
};

export type Macros = {
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

export type WebSource = { title: string; url: string };

export type AnalyzeResult = {
  title: string;
  source: Source;
  items: FoodItem[];
  kcal_min: number;
  kcal_max: number;
  kcal_best: number;
  macros: Macros;
  confidence: "low" | "medium" | "high";
  /** Kullanıcıya gösterilen cümle: "400-600 arası söyleniyor ama büyük ihtimalle 450 kalori" */
  verdict: string;
  sources: WebSource[];
  model: string;
  elapsed_ms: number;
  /** Görsel paketli gıda değilse doldurulur */
  rejected?: { reason: string };
};

export type Entry = {
  id: string;
  created_at: string;
  eaten_at: string;
  source: Source;
  raw_input: string | null;
  image_url: string | null;
  title: string;
  items: FoodItem[];
  kcal_min: number;
  kcal_max: number;
  kcal_best: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  confidence: string;
  verdict: string;
  sources: WebSource[];
  model: string | null;
};

export type DaySummary = {
  day: string; // YYYY-MM-DD
  kcal_best: number;
  kcal_min: number;
  kcal_max: number;
  count: number;
};

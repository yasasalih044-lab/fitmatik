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

/**
 * Bir analizin OpenAI token maliyeti. İlk üç alan eski UI sözleşmesidir;
 * ayrıntılar, eski kayıtlar ve mock'lar bozulmasın diye isteğe bağlıdır.
 */
export type TokenUsage = {
  input: number;
  output: number;
  total: number;
  /** Responses API `input_tokens_details.cached_tokens`. */
  cached_input?: number;
  /** Varsa Responses API'nin cache yazım tokenları. Ayrı bir fiyatı olmayabilir. */
  cache_write_input?: number;
  /** Responses API `output_tokens_details.reasoning_tokens`. */
  reasoning?: number;
};

/** Sağlayıcı yanıtından normalize edilmiş, fiyatlandırmaya hazır kullanım. */
export type DetailedTokenUsage = Required<TokenUsage>;

export type AnalysisStage = "parse" | "research";
export type WebSearchTool = "web_search" | "web_search_preview";

/**
 * Her model çağrısı için saklanacak denetlenebilir kullanım makbuzu.
 * Bu nesne JSON-serializable tutulur; para/ledger katmanı bunu doğrudan
 * `ai_usage_receipts` kaydına dönüştürebilir.
 */
export type OpenAIUsageReceipt = {
  provider: "openai";
  stage: AnalysisStage;
  /** Responses API `id`; sağlayıcı bunu vermediyse null. */
  response_id: string | null;
  /** İstekte gönderilen model alias'ı. */
  requested_model: string;
  /** Sağlayıcının yanıtta döndürdüğü model; yoksa requested_model. */
  model: string;
  service_tier: string | null;
  /** İstekte başarıyla kullanılan araç varyantı; araç yoksa null. */
  web_search_tool: WebSearchTool | null;
  /** Yalnızca çıktıdaki gerçekten çalışmış `action.type === "search"` sayısı. */
  web_searches: number;
  usage: DetailedTokenUsage;
};

/** Analiz toplamı ve saklanabilir çağrı makbuzları. */
export type AnalysisUsage = TokenUsage & {
  web_searches?: number;
  stages?: OpenAIUsageReceipt[];
};

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
  usage: AnalysisUsage;
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
  tokens: number | null;
};

export type DaySummary = {
  day: string; // YYYY-MM-DD
  kcal_best: number;
  kcal_min: number;
  kcal_max: number;
  count: number;
};

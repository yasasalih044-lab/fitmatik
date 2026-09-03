import { gramsFromText, lookupBarcode, scaleToGrams, searchProducts, type FoodFact } from "./foodDb";
import type { AnalyzeResult, Basis, FoodItem, Source, WebSource } from "./types";

const OPENAI_URL = "https://api.openai.com/v1/responses";

export const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

export class OpenAIError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "openai_error", status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type ResponsesBody = {
  model: string;
  instructions: string;
  input: unknown;
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" };
  text?: { format: unknown };
  tools?: unknown[];
  tool_choice?: string;
  max_output_tokens?: number;
};

/** Responses API çağrısı; web_search aracı desteklenmiyorsa aşamalı olarak geri düşer. */
async function callOpenAI(body: ResponsesBody, withSearch: boolean): Promise<{ text: string; citations: WebSource[] }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAIError("OPENAI_API_KEY tanımlı değil.", "missing_key", 500);

  const searchVariants = withSearch ? ["web_search", "web_search_preview", null] : [null];
  let lastErr: OpenAIError | null = null;

  for (const variant of searchVariants) {
    const payload: ResponsesBody = { ...body };
    if (variant) {
      payload.tools = [{ type: variant }];
      payload.tool_choice = "auto";
    } else {
      delete payload.tools;
      delete payload.tool_choice;
    }

    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(240_000),
    });

    const raw = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new OpenAIError(`OpenAI geçersiz yanıt döndü (HTTP ${res.status}).`);
    }

    const err = data.error as { message?: string; code?: string; type?: string } | undefined;
    if (err) {
      const code = err.code || err.type || "openai_error";
      const msg = err.message || "Bilinmeyen OpenAI hatası";
      // Kredi/anahtar/limit hataları: araç değiştirerek çözülmez, hemen çık.
      if (["insufficient_quota", "credit_balance_exhausted", "invalid_api_key", "rate_limit_exceeded", "model_not_found"].includes(code)) {
        throw new OpenAIError(msg, code, code === "rate_limit_exceeded" ? 429 : 402);
      }
      lastErr = new OpenAIError(msg, code);
      // Araç desteklenmiyor olabilir → bir sonraki varyantı dene.
      continue;
    }

    return extractText(data);
  }

  throw lastErr ?? new OpenAIError("OpenAI çağrısı başarısız.");
}

function extractText(data: Record<string, unknown>): { text: string; citations: WebSource[] } {
  const output = (data.output as unknown[]) || [];
  let text = "";
  const citations: WebSource[] = [];

  for (const rawItem of output) {
    const item = rawItem as { type?: string; content?: unknown[] };
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const rawPart of item.content) {
      const part = rawPart as { type?: string; text?: string; annotations?: unknown[] };
      if (part.type !== "output_text" || typeof part.text !== "string") continue;
      text += part.text;
      for (const rawAnn of part.annotations || []) {
        const ann = rawAnn as { type?: string; url?: string; title?: string };
        if (ann.type === "url_citation" && ann.url) {
          citations.push({ title: ann.title || ann.url, url: ann.url });
        }
      }
    }
  }

  if (!text.trim()) {
    const status = data.status as string | undefined;
    const incomplete = data.incomplete_details as { reason?: string } | undefined;
    throw new OpenAIError(
      `Model boş yanıt döndü${status ? ` (durum: ${status}${incomplete?.reason ? `/${incomplete.reason}` : ""})` : ""}.`,
      "empty_response",
    );
  }

  return { text, citations };
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch { /* aşağıda hata fırlatılır */ }
    }
    throw new OpenAIError(`${label} adımında JSON çözümlenemedi.`, "bad_json");
  }
}

/* ------------------------------------------------------------------ */
/* 1. AŞAMA — Girdiyi yapılandır (ne yenmiş, ne kadar)                  */
/* ------------------------------------------------------------------ */

const PARSE_SCHEMA = {
  type: "json_schema",
  name: "meal_parse",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["accepted", "reject_reason", "title", "items"],
    properties: {
      accepted: { type: "boolean" },
      reject_reason: { type: ["string", "null"] },
      title: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name", "qty", "brand", "packaged", "barcode", "db_query", "grams_est",
            "label_kcal_per_100g", "label_kcal_per_serving", "label_serving_size",
            "protein_g", "carbs_g", "fat_g", "search_query",
          ],
          properties: {
            name: { type: "string" },
            qty: { type: "string" },
            brand: { type: ["string", "null"] },
            packaged: { type: "boolean" },
            barcode: { type: ["string", "null"] },
            db_query: { type: "string" },
            grams_est: { type: ["number", "null"] },
            label_kcal_per_100g: { type: ["number", "null"] },
            label_kcal_per_serving: { type: ["number", "null"] },
            label_serving_size: { type: ["string", "null"] },
            protein_g: { type: ["number", "null"] },
            carbs_g: { type: ["number", "null"] },
            fat_g: { type: ["number", "null"] },
            search_query: { type: "string" },
          },
        },
      },
    },
  },
} as const;

type ParseOut = {
  accepted: boolean;
  reject_reason: string | null;
  title: string;
  items: Array<{
    name: string;
    qty: string;
    brand: string | null;
    packaged: boolean;
    barcode: string | null;
    db_query: string;
    grams_est: number | null;
    label_kcal_per_100g: number | null;
    label_kcal_per_serving: number | null;
    label_serving_size: string | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    search_query: string;
  }>;
};

const PARSE_TEXT_INSTRUCTIONS = `Sen bir beslenme kaydı ayrıştırıcısısın. Kullanıcı Türkçe, gündelik dille ne yediğini yazar.

Görevin: serbest metni yapılandırılmış yemek kalemlerine çevirmek. Kalori TAHMİN ETME — o bir sonraki adımın işi.

Kurallar:
- Her ayrı yiyecek/içecek ayrı bir kalem olur. "tost ve ayran" -> 2 kalem.
- qty alanına kullanıcının belirttiği miktarı yaz. Miktar belirtilmemişse Türkiye'deki tipik tek porsiyonu varsay ve qty'de bunu açıkça belirt (ör. "1 porsiyon (~varsayım)").
- Pişirme yöntemi kaloriyi değiştirir; adı buna göre yaz ("kızarmış tavuk göğsü", "haşlanmış yumurta").
- Marka adı geçiyorsa brand alanına yaz ve packaged=true yap. Ev yapımı/açık yemek ise packaged=false, brand=null.
- label_* ve makro alanları metin girdisinde her zaman null olur.
- search_query: bu kalemin kalorisini internette aramak için en iyi Türkçe sorgu. Marka varsa markayı ve porsiyonu içersin. Örn: "Ülker Çikolatalı Gofret 36 g kaç kalori".
- db_query: gıda veritabanında aratmak için KISA sorgu — sadece marka + ürün adı, miktar YOK. Örn: "Eti Gong". Paketli değilse boş string.
- grams_est: tüketilen miktarın gram karşılığı. Türkiye'deki tipik porsiyonlara göre tahmin et (1 dilim ekmek ~30 g, 1 orta yumurta ~50 g, 1 bardak süt ~200 ml). Bilemiyorsan null.
- barcode: kullanıcı metinde barkod numarası yazdıysa yaz, yoksa null.
- title: tüm öğünün kısa Türkçe özeti, en fazla 6 kelime.
- Kullanıcı ürün adı yerine SADECE bir barkod numarası yazdıysa bu GEÇERLİ bir kalemdir; reddetme. accepted=true, name="Barkodlu ürün", packaged=true, barcode=<rakamlar>, db_query="" yap. Ürünü bir sonraki adım veritabanından çözecek.
- Metin yiyecek/içecek içermiyorsa accepted=false ve reject_reason'a Türkçe kısa açıklama yaz.
- Yalnızca JSON döndür.`;

const PARSE_IMAGE_INSTRUCTIONS = `Sen bir paketli gıda etiketi okuyucususun. Kullanıcı bir ürün fotoğrafı yükler.

ÇOK ÖNEMLİ — SADECE PAKETLİ GIDA kabul edilir: ambalajlı, markalı, üstünde besin değerleri tablosu veya en azından okunur bir marka/ürün adı olan ürünler (cips, gofret, kutu içecek, yoğurt, protein bar, hazır çorba...).
Tabak yemeği, ev yapımı yemek, restoran tabağı, açık büfe, meyve tabağı gibi paketsiz görseller KABUL EDİLMEZ: accepted=false yap ve reject_reason'a "Bu bir paketli ürün değil, tabak/ev yemeği görünüyor. Ne yediğini yazı olarak girebilirsin." benzeri Türkçe bir açıklama yaz.

Kabul edilen görselde:
- name: marka + ürün adı (etikette yazan haliyle).
- brand: marka. packaged: true.
- qty: kullanıcı miktar belirtmediyse ambalajın tamamını varsay ("1 paket (X g)"). Ambalaj gramajı etikette yazıyorsa kullan.
- label_kcal_per_100g: etiketteki 100 g/100 ml enerji değerini kcal olarak yaz. Sadece kJ varsa 4.184'e böl ve yuvarla.
- label_kcal_per_serving: etiketteki porsiyon başına kcal (varsa).
- label_serving_size: etiketteki porsiyon tanımı (varsa).
- protein_g / carbs_g / fat_g: TÜKETİLEN MİKTARIN toplam makroları (100 g değerini gramaja göre ölçekle).
- Etiket okunmuyorsa alanları null bırak ama ürünü yine de tanımla; search_query'yi marka+ürün+gramaj olarak yaz.
- barcode: ambalajdaki BARKOD rakamlarını oku ve olduğu gibi yaz (EAN-13 genelde 13 hane, Türk ürünlerinde 869 ile başlar). Okunmuyorsa null. Bu alan çok değerli — barkod, ürünün tam kimliğidir.
- db_query: marka + ürün adı, miktar yok. Örn: "Eti Gong".
- grams_est: tüketilen gram. Kullanıcı "yarısını yedim" dediyse ambalaj gramajının yarısı.
- Yalnızca JSON döndür.`;

async function stage1Parse(opts: { source: Source; text?: string; imageDataUrl?: string }): Promise<ParseOut> {
  const content: unknown[] = [];

  if (opts.source === "image") {
    content.push({
      type: "input_text",
      text: opts.text?.trim()
        ? `Kullanıcının ek notu (miktar/porsiyon için dikkate al): ${opts.text.trim()}`
        : "Bu paketli ürünü ayrıştır.",
    });
    content.push({ type: "input_image", image_url: opts.imageDataUrl, detail: "high" });
  } else {
    content.push({ type: "input_text", text: opts.text || "" });
  }

  const { text } = await callOpenAI(
    {
      model: MODEL,
      instructions: opts.source === "image" ? PARSE_IMAGE_INSTRUCTIONS : PARSE_TEXT_INSTRUCTIONS,
      input: [{ role: "user", content }],
      reasoning: { effort: "low" },
      text: { format: PARSE_SCHEMA },
      max_output_tokens: 4000,
    },
    false,
  );

  return parseJson<ParseOut>(text, "Ayrıştırma");
}

/* ------------------------------------------------------------------ */
/* 2. AŞAMA — Araştırma: internetteki kalori aralığını bul             */
/* ------------------------------------------------------------------ */

const RESEARCH_SCHEMA = {
  type: "json_schema",
  name: "meal_research",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items", "kcal_min", "kcal_max", "kcal_best", "protein_g", "carbs_g", "fat_g", "confidence", "verdict", "sources"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name", "qty", "brand", "packaged", "grams",
            "kcal_min", "kcal_max", "kcal_best",
            "protein_g", "carbs_g", "fat_g", "note",
          ],
          properties: {
            name: { type: "string" },
            qty: { type: "string" },
            brand: { type: ["string", "null"] },
            packaged: { type: "boolean" },
            grams: { type: ["number", "null"] },
            kcal_min: { type: "number" },
            kcal_max: { type: "number" },
            kcal_best: { type: "number" },
            protein_g: { type: ["number", "null"] },
            carbs_g: { type: ["number", "null"] },
            fat_g: { type: ["number", "null"] },
            note: { type: "string" },
          },
        },
      },
      kcal_min: { type: "number" },
      kcal_max: { type: "number" },
      kcal_best: { type: "number" },
      protein_g: { type: ["number", "null"] },
      carbs_g: { type: ["number", "null"] },
      fat_g: { type: ["number", "null"] },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      verdict: { type: "string" },
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "url"],
          properties: { title: { type: "string" }, url: { type: "string" } },
        },
      },
    },
  },
} as const;

type ResearchItem = {
  name: string;
  qty: string;
  brand: string | null;
  packaged: boolean;
  grams: number | null;
  kcal_min: number;
  kcal_max: number;
  kcal_best: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  note: string;
};

type ResearchOut = {
  items: ResearchItem[];
  kcal_min: number;
  kcal_max: number;
  kcal_best: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  confidence: "low" | "medium" | "high";
  verdict: string;
  sources: WebSource[];
};

const RESEARCH_INSTRUCTIONS = `Sen bir kalori araştırmacısısın. Sana ayrıştırılmış bir öğünün JSON'u verilir. Görevin her kalem için GERÇEK kaynaklardan kalori bilgisi bulup toplamı çıkarmak.

Yöntem:
1. Elinde web arama aracı varsa her kalemin search_query'si ile arama yap. Türkiye'deki markalar için üreticinin sitesini, market sitelerini (Migros, A101, Şok, Getir), Yemeksepeti/Fitatlas/Diyetkolik/Nutritionix/FatSecret gibi kalori veritabanlarını tercih et.
2. Kaynaklar arasında bir ARALIK olur — kcal_min ve kcal_max bu aralığı yansıtsın (verilen porsiyon için, 100 g için değil).
3. Sonra tek bir sayıya bağlan: kcal_best. Bu, kaynakların çoğunluğuna ve porsiyonun gerçekçiliğine göre senin en iyi tahminin.
4. Etiket verisi (label_kcal_per_100g / label_kcal_per_serving) verilmişse O ESAS ALINIR: kcal_best etiketten hesaplanır, aralık dar tutulur, confidence "high" olur.
5. Girdide bir kalemin yanında "VERİTABANI" bloğu varsa (Open Food Facts, barkod eşleşmesi) O DA BAĞLAYICIDIR ve web aramasını EZER. Web'de farklı bir sayı görürsen veritabanını tercih et; web sayıları ortalama/tahmin, veritabanı ise o ürünün gerçek etiketi.
6. Arama aracın yoksa kendi bilgine dayan, aralığı GENİŞ tut ve confidence "low" ver.

Alanlar:
- Her kalemin kcal_min/max/best değeri O KALEMİN belirtilen miktarı içindir. note alanına kısaca nereden geldiğini yaz ("etiketten: 534 kcal/100g x 36 g").
- grams: o kalemin TÜKETİLEN gram karşılığı. Sıvılarda ml'yi gram say. Bilemiyorsan null — ama elinden geldiğince tahmin et, kullanıcı gramajı görmek istiyor.
- protein_g / carbs_g / fat_g: O KALEMİN makroları (tüm öğünün değil). Bilinmiyorsa null.
- Üst seviyedeki kcal_min/kcal_max/kcal_best kalemlerin toplamıdır.
- protein_g/carbs_g/fat_g: tüm öğünün toplam makroları; bilinmiyorsa null.
- verdict: TÜRKÇE tek cümle, kullanıcıya doğrudan hitap eden, aralığı ve en iyi tahmini içeren. Tam olarak şu üslupta: "400-600 arası söyleniyor ama büyük ihtimalle 450 kalori". Sayıları kendi bulduğun değerlerle değiştir.
- sources: kullandığın gerçek URL'ler (en fazla 5). Arama yapmadıysan boş dizi ver — URL UYDURMA.
- confidence: etiket varsa "high"; birden çok tutarlı kaynak varsa "medium"; tahminse "low".

Yalnızca JSON döndür.`;

function factBlock(fact: FoodFact | null): string {
  if (!fact) return "";
  const bits = [
    `ad: ${fact.name}`,
    fact.brand ? `marka: ${fact.brand}` : "",
    `barkod: ${fact.code}`,
    fact.quantity ? `ambalaj: ${fact.quantity}` : "",
    fact.serving_size ? `porsiyon: ${fact.serving_size}` : "",
    `100 g başına: ${fact.kcal_100g} kcal`,
    fact.protein_100g !== null ? `protein ${fact.protein_100g} g` : "",
    fact.carbs_100g !== null ? `karbonhidrat ${fact.carbs_100g} g` : "",
    fact.fat_100g !== null ? `yağ ${fact.fat_100g} g` : "",
  ].filter(Boolean);
  return `\n  VERİTABANI (bağlayıcı): ${bits.join(", ")}`;
}

async function stage2Research(
  parsed: ParseOut,
  source: Source,
  facts: (FoodFact | null)[],
): Promise<{ out: ResearchOut; citations: WebSource[] }> {
  const { text, citations } = await callOpenAI(
    {
      model: MODEL,
      instructions: RESEARCH_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Girdi kaynağı: ${source === "image" ? "paketli ürün fotoğrafı (etiket okundu)" : "serbest metin"}\n\n` +
                `Öğün JSON:\n${JSON.stringify({ title: parsed.title, items: parsed.items }, null, 2)}\n\n` +
                `Veritabanı eşleşmeleri (varsa bağlayıcıdır):` +
                (facts.some(Boolean)
                  ? parsed.items.map((it, i) => `\n- ${it.name}${factBlock(facts[i]) || "\n  (eşleşme yok)"}`).join("")
                  : " yok"),
            },
          ],
        },
      ],
      reasoning: { effort: "low" },
      text: { format: RESEARCH_SCHEMA },
      max_output_tokens: 6000,
    },
    true,
  );

  return { out: parseJson<ResearchOut>(text, "Araştırma"), citations };
}

/* ------------------------------------------------------------------ */

const r0 = (n: number) => Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
const r1 = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

function dedupeSources(...lists: WebSource[][]): WebSource[] {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const list of lists) {
    for (const s of list || []) {
      if (!s?.url || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push({ title: s.title || s.url, url: s.url });
    }
  }
  return out.slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Ara aşama — paketli kalemleri Open Food Facts ile eşleştir          */
/* ------------------------------------------------------------------ */

/**
 * Arama sonuçları arasından bu kaleme karşılık geleni seç.
 *
 * Burada cömert davranmak zararlı: "Eti Gong" ararken "Gong Pops"u kabul edip
 * "veritabanı" damgası vurmak, web tahmininden DAHA yanıltıcı olur — kullanıcı
 * sayının kesin olduğunu sanır. O yüzden kural katı: ürün adında bizim
 * bilmediğimiz ayırt edici bir kelime varsa eşleşme sayılmaz.
 */
const STOPWORDS = new Set([
  "gr", "gram", "adet", "paket", "kutu", "ile", "the", "and", "pack", "size",
  "urun", "tane", "porsiyon", "net", "yeni", "cesit",
]);

function tokens(text: string): string[] {
  const map: Record<string, string> = { ı: "i", İ: "i", ş: "s", ğ: "g", ü: "u", ö: "o", ç: "c", â: "a", î: "i", û: "u" };
  const words = text
    .toLowerCase()
    .replace(/[ıİşğüöçâîû]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !STOPWORDS.has(w));
  // Marka adı hem brand hem name alanında geçebiliyor; tekrar kapsamı şişirmesin.
  return [...new Set(words)];
}

function pickBest(hits: FoodFact[], item: ParseOut["items"][number]): FoodFact | null {
  if (!hits.length) return null;
  const wanted = tokens(`${item.brand || ""} ${item.name}`);
  if (!wanted.length) return null;

  for (const f of hits) {
    const have = tokens(`${f.brand || ""} ${f.name}`);
    if (!have.length) continue;

    const covered = wanted.filter((w) => have.includes(w)).length / wanted.length;
    // Üründe bizim aramadığımız ayırt edici kelime var mı? ("pops", "sade", "fındıklı"...)
    const extra = have.filter((w) => !wanted.includes(w));

    if (covered >= 0.75 && extra.length === 0) return f;
  }
  return null; // Emin değilsek eşleşme yok de; web araştırması devreye girsin.
}

async function lookupFacts(items: ParseOut["items"]): Promise<(FoodFact | null)[]> {
  return Promise.all(
    items.map(async (it) => {
      if (it.barcode) {
        const byCode = await lookupBarcode(it.barcode);
        if (byCode) return byCode;
      }
      // Ev yemeğinin ambalajı yok; veritabanında aramanın anlamı yok.
      if (!it.packaged && !it.brand) return null;
      const q = (it.db_query || `${it.brand || ""} ${it.name}`).trim();
      return pickBest(await searchProducts(q, 4), it);
    }),
  );
}

/* ------------------------------------------------------------------ */

/**
 * Bir kalemin sayılarını kesinleştirir.
 * Öncelik: fotoğraftaki etiket > barkod/veritabanı > web > tahmin.
 * Elimizde 100 g başına değer ve gram varsa aritmetiği MODEL DEĞİL KOD yapar.
 */
function settleItem(
  researched: ResearchItem,
  parsed: ParseOut["items"][number] | undefined,
  fact: FoodFact | null,
): FoodItem {
  // "1 paket yedim" gibi ifadelerde modelin gramaj tahmini yerine ambalajın
  // kendi gramajı kullanılmalı — veritabanı bunu biliyor, model tahmin ediyor.
  const qtyText = `${researched.qty} ${parsed?.qty ?? ""}`.toLowerCase();
  const explicitGrams = gramsFromText(researched.qty) ?? gramsFromText(parsed?.qty);
  const wholePack =
    /\b(paket|kutu|şişe|sise|adet|ambalaj|tamam)/.test(qtyText) &&
    !/(yarım|yarim|çeyrek|ceyrek|buçuk|bucuk|yarısı|yarisi)/.test(qtyText) &&
    explicitGrams === null;
  const packGrams = fact ? gramsFromText(fact.quantity) : null;

  const grams =
    (wholePack ? packGrams : null) ??
    explicitGrams ??
    researched.grams ??
    parsed?.grams_est ??
    gramsFromText(parsed?.label_serving_size) ??
    packGrams;

  const base: FoodItem = {
    name: researched.name,
    qty: researched.qty,
    brand: researched.brand ?? parsed?.brand ?? null,
    packaged: !!researched.packaged,
    kcal_min: r0(researched.kcal_min),
    kcal_max: r0(researched.kcal_max),
    kcal_best: r0(researched.kcal_best),
    grams: grams !== null ? Math.round(grams) : null,
    protein_g: r1(researched.protein_g),
    carbs_g: r1(researched.carbs_g),
    fat_g: r1(researched.fat_g),
    basis: researched.packaged ? "web" : "tahmin",
    barcode: fact?.code ?? parsed?.barcode ?? null,
    note: researched.note || "",
  };

  // 1) Fotoğraftaki etiket — bu ürünün kendi beyanı, en güçlü kaynak.
  const label100 = parsed?.label_kcal_per_100g ?? null;
  if (label100 !== null && grams !== null) {
    const kcal = Math.round((label100 * grams) / 100);
    return { ...base, ...band(kcal), basis: "etiket", note: base.note || `etiketten: ${label100} kcal/100 g × ${Math.round(grams)} g` };
  }
  if (parsed?.label_kcal_per_serving != null && grams === null) {
    const kcal = Math.round(parsed.label_kcal_per_serving);
    return { ...base, ...band(kcal), basis: "etiket" };
  }

  // 2) Barkod / veritabanı eşleşmesi.
  if (fact && fact.kcal_100g !== null && grams !== null) {
    const scaled = scaleToGrams(fact, grams);
    // Ad da sayılarla aynı kayıttan gelsin; barkodla eşleşen üründe model
    // çoğu zaman ürünü tanımıyor ("barkodlu paket ürün") ama veritabanı tanıyor.
    const dbName = [fact.brand, fact.name].filter(Boolean).join(" ").trim();
    return {
      ...base,
      name: dbName || base.name,
      brand: fact.brand ?? base.brand,
      ...band(scaled.kcal ?? base.kcal_best),
      protein_g: scaled.protein_g ?? base.protein_g,
      carbs_g: scaled.carbs_g ?? base.carbs_g,
      fat_g: scaled.fat_g ?? base.fat_g,
      basis: parsed?.barcode && fact.code === parsed.barcode.replace(/\D/g, "") ? "barkod" : "veritabani",
      note: `${fact.name}: ${fact.kcal_100g} kcal/100 g × ${Math.round(grams)} g`,
    };
  }

  // 3) Web araştırması — model ne bulduysa o, aralık geniş kalır.
  return base;
}

/** Etiket/veritabanı sayıları kesin sayılır; yine de yuvarlama payı bırak. */
function band(kcal: number) {
  const pad = Math.max(3, Math.round(kcal * 0.03));
  return { kcal_best: r0(kcal), kcal_min: r0(kcal - pad), kcal_max: r0(kcal + pad) };
}

const BASIS_RANK: Record<Basis, number> = { etiket: 4, barkod: 4, veritabani: 3, web: 2, tahmin: 1 };

/**
 * Karar cümlesini koddan üret. Modelin cümlesi kendi ara sayılarına dayanıyor;
 * biz toplamları kalemlerden yeniden hesapladığımız için ikisi tutmayabiliyor
 * ("225-225 arası söyleniyor" gibi). Ekrandaki sayı, çubuk ve cümle aynı
 * kaynaktan gelsin.
 */
function buildVerdict(items: FoodItem[], min: number, max: number, best: number): string {
  if (!items.length) return `Yaklaşık ${best} kalori.`;
  const strong = items.every((i) => i.basis === "etiket" || i.basis === "barkod");
  if (strong) return `Ambalajın kendi besin değerlerine göre ${best} kalori.`;
  if (max - min < 5) return `Yaklaşık ${best} kalori.`;
  return `${min}-${max} arası söyleniyor ama büyük ihtimalle ${best} kalori.`;
}

export async function analyzeMeal(opts: { source: Source; text?: string; imageDataUrl?: string }): Promise<AnalyzeResult> {
  const started = Date.now();

  const parsed = await stage1Parse(opts);

  if (!parsed.accepted || parsed.items.length === 0) {
    return {
      title: parsed.title || "Tanımlanamadı",
      source: opts.source,
      items: [],
      kcal_min: 0,
      kcal_max: 0,
      kcal_best: 0,
      macros: { protein_g: null, carbs_g: null, fat_g: null },
      confidence: "low",
      verdict: parsed.reject_reason || "Bu girdiden bir öğün çıkaramadım.",
      sources: [],
      model: MODEL,
      elapsed_ms: Date.now() - started,
      rejected: { reason: parsed.reject_reason || "Girdi anlaşılamadı." },
    };
  }

  // Veritabanı eşleştirmesi araştırmayla aynı anda başlayamaz: sonucu
  // araştırmaya bağlayıcı girdi olarak veriyoruz.
  const facts = await lookupFacts(parsed.items);
  const { out, citations } = await stage2Research(parsed, opts.source, facts);

  const items = (out.items || []).map((it, i) => settleItem(it, parsed.items[i], facts[i] ?? null));

  // Toplamları kalemlerden yeniden hesapla; model toplamı tutturamazsa tutarlı kalsın.
  let kcal_min = items.reduce((a, i) => a + i.kcal_min, 0);
  let kcal_max = items.reduce((a, i) => a + i.kcal_max, 0);
  let kcal_best = items.reduce((a, i) => a + i.kcal_best, 0);
  if (!items.length) {
    kcal_min = r0(out.kcal_min);
    kcal_max = r0(out.kcal_max);
    kcal_best = r0(out.kcal_best);
  }
  if (kcal_max < kcal_min) [kcal_min, kcal_max] = [kcal_max, kcal_min];
  kcal_best = Math.min(Math.max(kcal_best, kcal_min), kcal_max);

  // Makro toplamı: kalemlerden topla, hiç kalem vermediyse modelin toplamına düş.
  const sumMacro = (k: "protein_g" | "carbs_g" | "fat_g") => {
    const vals = items.map((i) => i[k]).filter((v): v is number => v !== null);
    return vals.length ? r1(vals.reduce((a, b) => a + b, 0)) : (out[k] ?? null);
  };

  // Güven, en zayıf kalemin dayanağına göre: bir kalem tahminse öğün "kesin" değildir.
  const weakest = items.length ? Math.min(...items.map((i) => BASIS_RANK[i.basis])) : 1;
  const confidence: AnalyzeResult["confidence"] = weakest >= 4 ? "high" : weakest >= 3 ? "medium" : out.confidence || "low";

  const dbSources: WebSource[] = facts
    .filter((f): f is FoodFact => !!f)
    .map((f) => ({ title: `Open Food Facts — ${f.name || f.code}`, url: f.url }));

  return {
    title: parsed.title || items[0]?.name || "Öğün",
    source: opts.source,
    items,
    kcal_min,
    kcal_max,
    kcal_best,
    macros: { protein_g: sumMacro("protein_g"), carbs_g: sumMacro("carbs_g"), fat_g: sumMacro("fat_g") },
    confidence,
    verdict: buildVerdict(items, kcal_min, kcal_max, kcal_best),
    sources: dedupeSources(dbSources, out.sources || [], citations),
    model: MODEL,
    elapsed_ms: Date.now() - started,
  };
}

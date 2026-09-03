import type { AnalyzeResult, FoodItem, Source, WebSource } from "./types";

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
            "name", "qty", "brand", "packaged",
            "label_kcal_per_100g", "label_kcal_per_serving", "label_serving_size",
            "protein_g", "carbs_g", "fat_g", "search_query",
          ],
          properties: {
            name: { type: "string" },
            qty: { type: "string" },
            brand: { type: ["string", "null"] },
            packaged: { type: "boolean" },
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
- title: tüm öğünün kısa Türkçe özeti, en fazla 6 kelime.
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
          required: ["name", "qty", "brand", "packaged", "kcal_min", "kcal_max", "kcal_best", "note"],
          properties: {
            name: { type: "string" },
            qty: { type: "string" },
            brand: { type: ["string", "null"] },
            packaged: { type: "boolean" },
            kcal_min: { type: "number" },
            kcal_max: { type: "number" },
            kcal_best: { type: "number" },
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

type ResearchOut = {
  items: FoodItem[];
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
5. Arama aracın yoksa kendi bilgine dayan, aralığı GENİŞ tut ve confidence "low" ver.

Alanlar:
- Her kalemin kcal_min/max/best değeri O KALEMİN belirtilen miktarı içindir. note alanına kısaca nereden geldiğini yaz ("etiketten: 534 kcal/100g x 36 g").
- Üst seviyedeki kcal_min/kcal_max/kcal_best kalemlerin toplamıdır.
- protein_g/carbs_g/fat_g: tüm öğünün toplam makroları; bilinmiyorsa null.
- verdict: TÜRKÇE tek cümle, kullanıcıya doğrudan hitap eden, aralığı ve en iyi tahmini içeren. Tam olarak şu üslupta: "400-600 arası söyleniyor ama büyük ihtimalle 450 kalori". Sayıları kendi bulduğun değerlerle değiştir.
- sources: kullandığın gerçek URL'ler (en fazla 5). Arama yapmadıysan boş dizi ver — URL UYDURMA.
- confidence: etiket varsa "high"; birden çok tutarlı kaynak varsa "medium"; tahminse "low".

Yalnızca JSON döndür.`;

async function stage2Research(parsed: ParseOut, source: Source): Promise<{ out: ResearchOut; citations: WebSource[] }> {
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
              text: `Girdi kaynağı: ${source === "image" ? "paketli ürün fotoğrafı (etiket okundu)" : "serbest metin"}\n\nÖğün JSON:\n${JSON.stringify(
                { title: parsed.title, items: parsed.items },
                null,
                2,
              )}`,
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

  const { out, citations } = await stage2Research(parsed, opts.source);

  const items: FoodItem[] = (out.items || []).map((i) => ({
    name: i.name,
    qty: i.qty,
    brand: i.brand ?? null,
    packaged: !!i.packaged,
    kcal_min: r0(i.kcal_min),
    kcal_max: r0(i.kcal_max),
    kcal_best: r0(i.kcal_best),
    note: i.note || "",
  }));

  // Toplamları kalemlerden yeniden hesapla; model toplamı tutturamazsa tutarlı kalsın.
  const sumMin = items.reduce((a, i) => a + i.kcal_min, 0);
  const sumMax = items.reduce((a, i) => a + i.kcal_max, 0);
  const sumBest = items.reduce((a, i) => a + i.kcal_best, 0);

  let kcal_min = items.length ? sumMin : r0(out.kcal_min);
  let kcal_max = items.length ? sumMax : r0(out.kcal_max);
  let kcal_best = items.length ? sumBest : r0(out.kcal_best);
  if (kcal_max < kcal_min) [kcal_min, kcal_max] = [kcal_max, kcal_min];
  kcal_best = Math.min(Math.max(kcal_best, kcal_min), kcal_max);

  return {
    title: parsed.title || items[0]?.name || "Öğün",
    source: opts.source,
    items,
    kcal_min,
    kcal_max,
    kcal_best,
    macros: {
      protein_g: out.protein_g ?? null,
      carbs_g: out.carbs_g ?? null,
      fat_g: out.fat_g ?? null,
    },
    confidence: out.confidence || "low",
    verdict: out.verdict || `${kcal_min}-${kcal_max} arası söyleniyor ama büyük ihtimalle ${kcal_best} kalori`,
    sources: dedupeSources(out.sources || [], citations),
    model: MODEL,
    elapsed_ms: Date.now() - started,
  };
}

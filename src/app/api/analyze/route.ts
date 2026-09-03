import { NextResponse } from "next/server";
import { analyzeMeal, OpenAIError } from "@/lib/openai";
import { insertEntry, uploadImage } from "@/lib/store";
import type { AnalyzeResult, Source } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_IMAGE_CHARS = 9_000_000; // ~6.5 MB base64

export async function POST(req: Request) {
  let body: { source?: string; text?: string; image?: string; eaten_at?: string; save?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const source: Source = body.source === "image" ? "image" : "text";
  const eatenAt = body.eaten_at ? new Date(body.eaten_at) : new Date();
  if (Number.isNaN(eatenAt.getTime())) {
    return NextResponse.json({ error: "Geçersiz tarih." }, { status: 400 });
  }
  const text = (body.text || "").trim();
  const image = body.image || "";

  if (source === "text" && text.length < 2) {
    return NextResponse.json({ error: "Ne yediğini yaz." }, { status: 400 });
  }
  if (source === "image") {
    if (!image.startsWith("data:image/")) {
      return NextResponse.json({ error: "Geçerli bir görsel yükle." }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: "Görsel çok büyük. Daha küçük bir fotoğraf dene." }, { status: 413 });
    }
  }

  try {
    const result =
      process.env.NODE_ENV !== "production" && text === "__mock__"
        ? MOCK
        : await analyzeMeal({ source, text, imageDataUrl: image });

    if (result.rejected || body.save === false) {
      return NextResponse.json({ result, entry: null });
    }

    const image_url = source === "image" ? await uploadImage(image) : null;

    const entry = await insertEntry({
      eaten_at: eatenAt.toISOString(),
      source,
      raw_input: text || null,
      image_url,
      title: result.title,
      items: result.items,
      kcal_min: result.kcal_min,
      kcal_max: result.kcal_max,
      kcal_best: result.kcal_best,
      protein_g: result.macros.protein_g,
      carbs_g: result.macros.carbs_g,
      fat_g: result.macros.fat_g,
      confidence: result.confidence,
      verdict: result.verdict,
      sources: result.sources,
      model: result.model,
    });

    return NextResponse.json({ result, entry });
  } catch (e) {
    if (e instanceof OpenAIError) {
      const friendly =
        e.code === "insufficient_quota" || e.code === "credit_balance_exhausted"
          ? "OpenAI hesabında kredi kalmamış. platform.openai.com üzerinden kredi yükle."
          : e.code === "invalid_api_key"
            ? "OpenAI API anahtarı geçersiz."
            : e.code === "rate_limit_exceeded"
              ? "OpenAI hız sınırına takıldık, birazdan tekrar dene."
              : e.message;
      return NextResponse.json({ error: friendly, code: e.code }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
    console.error("[fitmatik] analyze:", msg);
    // Depolama hataları kullanıcıya farklı bir şey anlatır: hesap yapıldı ama kaydedilemedi.
    const isStore = /Kayıt (yazılamadı|silinemedi)|Kayıtlar (okunamadı|listelenemedi)/.test(msg);
    return NextResponse.json(
      { error: isStore ? "Kalori hesaplandı ama günlüğe yazılamadı. Tekrar dene." : "Hesaplama sırasında bir hata oldu. Tekrar dene." },
      { status: 500 },
    );
  }
}

/** Yalnızca geliştirmede: arayüzü OpenAI çağrısı olmadan denemek için. */
const MOCK: AnalyzeResult = {
  title: "Kahvaltı: ekmek, yumurta, çay",
  source: "text" as const,
  items: [
    { name: "Eti Gong Çikolatalı", qty: "1 paket (36 g)", brand: "Eti", packaged: true, kcal_min: 182, kcal_max: 194, kcal_best: 188, grams: 36, protein_g: 2.3, carbs_g: 22.7, fat_g: 9.8, basis: "barkod", barcode: "8690526025001", note: "Eti Gong: 522 kcal/100 g × 36 g" },
    { name: "Beyaz ekmek", qty: "2 dilim (~50 g)", brand: null, packaged: false, kcal_min: 120, kcal_max: 160, kcal_best: 133, grams: 50, protein_g: 4.2, carbs_g: 25.5, fat_g: 0.8, basis: "web", barcode: null, note: "kaynak ortalaması" },
    { name: "Siyah çay (şekersiz)", qty: "1 ince belli bardak", brand: null, packaged: false, kcal_min: 0, kcal_max: 5, kcal_best: 2, grams: 200, protein_g: 0, carbs_g: 0.3, fat_g: 0, basis: "tahmin", barcode: null, note: "ihmal edilebilir" },
  ],
  kcal_min: 302,
  kcal_max: 359,
  kcal_best: 323,
  macros: { protein_g: 6.5, carbs_g: 48.5, fat_g: 10.6 },
  confidence: "medium" as const,
  verdict: "302-359 arası söyleniyor ama büyük ihtimalle 323 kalori",
  sources: [
    { title: "Diyetkolik — Ekmek kaç kalori", url: "https://www.diyetkolik.com/kac-kalori/ekmek/" },
    { title: "FatSecret — Haşlanmış yumurta", url: "https://www.fatsecret.com.tr/kalori-besin/genel/yumurta-haslanmis" },
  ],
  model: "mock",
  elapsed_ms: 0,
};

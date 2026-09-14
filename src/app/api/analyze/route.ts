import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { analyzeMeal, MODEL, OpenAIError } from "@/lib/openai";
import {
  BillingError,
  MAX_ANALYSIS_WEB_SEARCH_CALLS,
  quoteAnalysisReservation,
  quoteAnalysisUsage,
  type AnalysisBillingQuote,
  type AnalysisChargeReceipt,
} from "@/lib/billing";
import {
  beginAnalysis,
  claimAnalysis,
  discardUnlinkedImage,
  failAnalysis,
  finalizeAnalysis,
  getAnalysisRun,
  getEntry,
  getWallet,
  uploadImage,
  type UsageReceiptInput,
} from "@/lib/store";
import { currentAccount } from "@/lib/session";
import type { AnalyzeResult, Entry, OpenAIUsageReceipt, Source } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_IMAGE_CHARS = 9_000_000; // roughly 6.5 MB of decoded bytes
const MAX_TEXT_CHARACTERS = 8_000;
const MAX_IMAGE_DIMENSION = 2_048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AnalyzeBody = {
  source?: string;
  text?: string;
  image?: string;
  eaten_at?: string;
  save?: boolean;
};

type StoredSuccess = { result: AnalyzeResult; quote: AnalysisBillingQuote };

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isStoredSuccess(value: unknown): value is StoredSuccess {
  const candidate = asObject(value);
  return Boolean(candidate && asObject(candidate.result) && asObject(candidate.quote));
}

function requestDigest(input: {
  source: Source;
  text: string;
  image: string;
  eatenAt: string;
  save: boolean;
}): string {
  const imageDigest = input.source === "image" ? createHash("sha256").update(input.image).digest("hex") : null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        source: input.source,
        text: input.text,
        imageDigest,
        eatenAt: input.eatenAt,
        save: input.save,
      }),
    )
    .digest("hex");
}

function estimateWebSearchCalls(source: Source, text: string): number {
  if (source === "image") return 1;
  const likelyItems = text
    .split(/(?:[,;+]|\s+ve\s+)/iu)
    .map((part) => part.trim())
    .filter(Boolean).length;
  return Math.min(Math.max(likelyItems, 1), MAX_ANALYSIS_WEB_SEARCH_CALLS);
}

function dataUrlDimensions(dataUrl: string): { width: number; height: number } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length) return null;

  if (mime === "image/png") {
    if (
      bytes.length < 24 ||
      bytes.toString("ascii", 1, 4) !== "PNG" ||
      bytes.readUInt32BE(12) !== 0x49484452
    ) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  if (mime === "image/jpeg") {
    let offset = 2;
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 1 >= bytes.length) return null;
      const segmentLength = bytes.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
      }
      offset += segmentLength;
    }
    return null;
  }

  // WebP uses one of three lightweight container headers. Client-side
  // compression outputs JPEG, but accepting a bounded WebP is useful on web.
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8X") {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (kind === "VP8L" && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function userFacingOpenAIError(error: OpenAIError): string {
  if (error.code === "insufficient_quota" || error.code === "credit_balance_exhausted") {
    return "OpenAI hesabında kredi kalmamış. platform.openai.com üzerinden kredi yükle.";
  }
  if (error.code === "invalid_api_key") return "OpenAI API anahtarı geçersiz.";
  if (error.code === "rate_limit_exceeded") return "OpenAI hız sınırına takıldık, birazdan tekrar dene.";
  if (error.code === "missing_usage" || error.code === "invalid_usage") {
    return "Sağlayıcı kullanım makbuzu doğrulanamadı; Fitcoin düşülmedi. Tekrar deneyebilirsin.";
  }
  return error.message;
}

function toUsageReceipts(stages: OpenAIUsageReceipt[] | undefined, quote: AnalysisBillingQuote): UsageReceiptInput[] {
  if (!stages || stages.length !== 2) {
    throw new BillingError("Başarılı analiz için iki OpenAI kullanım makbuzu zorunlu.", "missing_receipts");
  }
  const expectedStages = new Set(["parse", "research"]);
  if (stages.some((stage) => !expectedStages.delete(stage.stage) || !stage.response_id) || expectedStages.size !== 0) {
    throw new BillingError("OpenAI kullanım makbuzlarının aşamaları tutarsız.", "invalid_receipts");
  }

  return stages.map((stage) => {
    const priced = quote.receipts.find((receipt) => receipt.stage === stage.stage && receipt.response_id === stage.response_id);
    if (!priced) throw new BillingError("Fiyatlandırılmış OpenAI makbuzu bulunamadı.", "missing_receipts");
    return {
      stage: stage.stage,
      response_id: stage.response_id,
      requested_model: stage.requested_model,
      model: stage.model,
      tool_type: stage.web_search_tool,
      input_tokens: stage.usage.input,
      cached_input_tokens: stage.usage.cached_input,
      cache_write_input_tokens: stage.usage.cache_write_input,
      output_tokens: stage.usage.output,
      reasoning_tokens: stage.usage.reasoning,
      total_tokens: stage.usage.total,
      web_search_calls: stage.web_searches,
      cost_nano_usd: priced.cost_nano_usd,
      fitcoin_units: priced.fitcoin,
      rate_card_version: priced.rate_card_version,
      metadata: {
        provider: stage.provider,
        service_tier: stage.service_tier,
        web_search_tool: stage.web_search_tool,
        input_nano_usd: priced.input_nano_usd,
        cached_input_nano_usd: priced.cached_input_nano_usd,
        output_nano_usd: priced.output_nano_usd,
        web_search_nano_usd: priced.web_search_nano_usd,
      },
    };
  });
}

function chargeReceipt(
  quote: AnalysisBillingQuote,
  settled: { charged_fitcoin: number; available_fitcoin: number; reserved_fitcoin: number },
): AnalysisChargeReceipt {
  return {
    ...quote,
    fitcoin: settled.charged_fitcoin,
    charged_fitcoin: settled.charged_fitcoin,
    available_fitcoin: settled.available_fitcoin,
    reserved_fitcoin: settled.reserved_fitcoin,
  };
}

async function responseForCompletedRun(accountId: string, runId: string) {
  const run = await getAnalysisRun(accountId, runId);
  if (!run || run.status !== "succeeded" || !isStoredSuccess(run.result_json)) return null;
  let entry: Entry | null = null;
  if (run.entry_id) {
    try {
      entry = await getEntry(accountId, run.entry_id);
    } catch (error) {
      // Settlement is already durable; a transient signed-URL failure must not
      // turn it into a failed or newly chargeable analysis.
      console.error("[fitmatik] idempotent entry hydrate:", error instanceof Error ? error.message : error);
    }
  }
  const wallet = await getWallet(accountId);
  return NextResponse.json({
    result: run.result_json.result,
    entry,
    billing: chargeReceipt(run.result_json.quote, {
      charged_fitcoin: run.charged_fitcoin,
      available_fitcoin: wallet.available_fitcoin,
      reserved_fitcoin: wallet.reserved_fitcoin,
    }),
    replayed: true,
  });
}

async function releaseReservation(accountId: string, runId: string, reason: string): Promise<void> {
  try {
    await failAnalysis(accountId, runId, reason, "not_charged");
  } catch (releaseError) {
    console.error("[fitmatik] Fitcoin release:", releaseError instanceof Error ? releaseError.message : releaseError);
  }
}

function insufficientFitcoinResponse(reserve: AnalysisBillingQuote, availableFitcoin: number) {
  return NextResponse.json(
    {
      error:
        "Fitcoin bakiyesi yetersiz. Bu analiz için en fazla " +
        reserve.fitcoin.toLocaleString("tr-TR") +
        " FC ayrılması gerekiyor; kullanılabilir bakiyen " +
        availableFitcoin.toLocaleString("tr-TR") +
        " FC.",
      available_fitcoin: availableFitcoin,
      reserve_fitcoin: reserve.fitcoin,
    },
    { status: 402 },
  );
}

export async function POST(req: Request) {
  let account;
  try {
    account = await currentAccount();
  } catch (error) {
    console.error("[fitmatik] session configuration:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Oturum altyapısı yapılandırılmamış." }, { status: 503 });
  }
  if (!account) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || "";
  if (!UUID.test(idempotencyKey)) {
    return NextResponse.json({ error: "Her analiz için geçerli bir Idempotency-Key gerekli." }, { status: 400 });
  }

  let body: AnalyzeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const source: Source = body.source === "image" ? "image" : "text";
  const eatenAt = body.eaten_at ? new Date(body.eaten_at) : new Date();
  if (Number.isNaN(eatenAt.getTime())) return NextResponse.json({ error: "Geçersiz tarih." }, { status: 400 });
  const text = (body.text || "").trim();
  const image = body.image || "";
  const save = body.save !== false;

  if (text.length > MAX_TEXT_CHARACTERS) {
    return NextResponse.json({ error: "Yemek açıklaması en fazla 8.000 karakter olabilir." }, { status: 413 });
  }
  if (source === "text" && text.length < 2) return NextResponse.json({ error: "Ne yediğini yaz." }, { status: 400 });
  if (source === "image") {
    if (image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: "Görsel çok büyük. Daha küçük bir fotoğraf dene." }, { status: 413 });
    }
    const dimensions = dataUrlDimensions(image);
    if (!dimensions) {
      return NextResponse.json({ error: "JPG, PNG veya WebP biçiminde geçerli bir görsel yükle." }, { status: 400 });
    }
    if (
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > MAX_IMAGE_DIMENSION ||
      dimensions.height > MAX_IMAGE_DIMENSION
    ) {
      return NextResponse.json({ error: "Görsel en fazla 2048 × 2048 piksel olabilir." }, { status: 413 });
    }
  }

  const maximumWebSearchCalls = estimateWebSearchCalls(source, text);
  let reserve: AnalysisBillingQuote;
  try {
    reserve = quoteAnalysisReservation({
      model: MODEL,
      source,
      textCharacters: text.length,
      maximumWebSearchCalls,
    });
  } catch (error) {
    console.error("[fitmatik] reserve quote:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Bu OpenAI modeli için doğrulanmış Fitcoin fiyat kartı yok. Analiz başlatılmadı." },
      { status: 503 },
    );
  }

  const digest = requestDigest({ source, text, image, eatenAt: eatenAt.toISOString(), save });
  let runId: string | null = null;
  let uploadedImagePath: string | null = null;
  let reservationOwned = false;
  let settled = false;

  try {
    const started = await beginAnalysis(account.id, idempotencyKey, digest, reserve.fitcoin);
    runId = started.analysis_run_id;

    if (started.replayed) {
      const complete = await responseForCompletedRun(account.id, runId);
      if (complete) return complete;
      const run = await getAnalysisRun(account.id, runId);
      if (run?.status === "rejected" && run.error === "insufficient_fitcoin") {
        return insufficientFitcoinResponse(reserve, started.available_fitcoin);
      }
      if (run?.status === "reserved" || run?.status === "processing") {
        return NextResponse.json(
          { error: "Bu analiz hâlâ işleniyor. Kısa süre sonra aynı işlemi tekrar dene." },
          { status: 202 },
        );
      }
      return NextResponse.json(
        { error: "Önceki analiz tamamlanamadı; Fitcoin iade edildi. Tekrar başlatabilirsin.", retry_with_new_key: true },
        { status: 409 },
      );
    }

    if (!started.sufficient) return insufficientFitcoinResponse(reserve, started.available_fitcoin);

    reservationOwned = true;

    const claim = await claimAnalysis(account.id, runId);
    if (!claim.claimed) {
      const complete = await responseForCompletedRun(account.id, runId);
      if (complete) return complete;
      return NextResponse.json({ error: "Bu analiz başka bir istek tarafından işleniyor." }, { status: 202 });
    }

    const result =
      process.env.NODE_ENV !== "production" && text === "__mock__"
        ? MOCK
        : await analyzeMeal({ source, text, imageDataUrl: image, maximumWebSearchCalls });

    if (result.rejected) {
      await failAnalysis(account.id, runId, "invalid_analysis_input", "not_charged");
      reservationOwned = false;
      return NextResponse.json({ result, entry: null, billing: null });
    }

    const quote = quoteAnalysisUsage(result.usage.stages || []);
    if (quote.fitcoin > reserve.fitcoin) {
      await failAnalysis(account.id, runId, "reserve_bound_exceeded", "not_charged");
      reservationOwned = false;
      return NextResponse.json(
        { error: "Analiz maliyet üst sınırı doğrulanamadı; Fitcoin düşülmedi. Tekrar dene." },
        { status: 503 },
      );
    }
    const receipts = toUsageReceipts(result.usage.stages, quote);

    if (save && source === "image") uploadedImagePath = await uploadImage(account.id, image);
    const entryInput = save
      ? {
          eaten_at: eatenAt.toISOString(),
          source,
          raw_input: text || null,
          image_path: uploadedImagePath,
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
          tokens: result.usage.total || null,
        }
      : null;
    const finalized = await finalizeAnalysis(account.id, runId, quote.fitcoin, entryInput, receipts, { result, quote });
    settled = true;

    let entry: Entry | null = null;
    if (finalized.entry_id) {
      try {
        entry = await getEntry(account.id, finalized.entry_id);
      } catch (error) {
        console.error("[fitmatik] entry hydrate after settlement:", error instanceof Error ? error.message : error);
      }
    }
    return NextResponse.json({ result, entry, billing: chargeReceipt(quote, finalized), replayed: false });
  } catch (error) {
    // A network failure after the RPC commits is ambiguous from this process.
    // Read the durable run before releasing a hold or deleting its private
    // image, otherwise a committed analysis could be mistaken for an orphan.
    if (runId && !settled) {
      try {
        const completed = await responseForCompletedRun(account.id, runId);
        if (completed) return completed;
      } catch (recoveryError) {
        console.error("[fitmatik] finalizer recovery:", recoveryError instanceof Error ? recoveryError.message : recoveryError);
      }
    }
    if (uploadedImagePath && !settled) {
      try {
        await discardUnlinkedImage(account.id, uploadedImagePath);
      } catch (cleanupError) {
        console.error("[fitmatik] orphan image cleanup:", cleanupError instanceof Error ? cleanupError.message : cleanupError);
      }
    }
    if (runId && reservationOwned && !settled) {
      await releaseReservation(account.id, runId, error instanceof Error ? error.message : "analysis_failed");
    }
    if (error instanceof OpenAIError) {
      return NextResponse.json({ error: userFacingOpenAIError(error), code: error.code }, { status: error.status });
    }
    if (error instanceof BillingError) {
      return NextResponse.json(
        { error: "Analiz maliyeti doğrulanamadı; Fitcoin düşülmedi. Tekrar dene.", code: error.code },
        { status: 503 },
      );
    }
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    console.error("[fitmatik] analyze:", message);
    return NextResponse.json({ error: "Hesaplama sırasında bir hata oldu. Fitcoin düşülmedi; tekrar dene." }, { status: 500 });
  }
}

/** Yalnızca geliştirmede: arayüzü OpenAI çağrısı olmadan denemek için. */
const MOCK: AnalyzeResult = {
  title: "Kahvaltı: ekmek, yumurta, çay",
  source: "text",
  items: [
    { name: "Eti Gong Çikolatalı", qty: "1 paket (36 g)", brand: "Eti", packaged: true, kcal_min: 182, kcal_max: 194, kcal_best: 188, grams: 36, protein_g: 2.3, carbs_g: 22.7, fat_g: 9.8, basis: "barkod", barcode: "8690526025001", note: "Eti Gong: 522 kcal/100 g × 36 g" },
    { name: "Beyaz ekmek", qty: "2 dilim (~50 g)", brand: null, packaged: false, kcal_min: 120, kcal_max: 160, kcal_best: 133, grams: 50, protein_g: 4.2, carbs_g: 25.5, fat_g: 0.8, basis: "web", barcode: null, note: "kaynak ortalaması" },
    { name: "Siyah çay (şekersiz)", qty: "1 ince belli bardak", brand: null, packaged: false, kcal_min: 0, kcal_max: 5, kcal_best: 2, grams: 200, protein_g: 0, carbs_g: 0.3, fat_g: 0, basis: "tahmin", barcode: null, note: "ihmal edilebilir" },
  ],
  kcal_min: 302,
  kcal_max: 359,
  kcal_best: 323,
  macros: { protein_g: 6.5, carbs_g: 48.5, fat_g: 10.6 },
  confidence: "medium",
  verdict: "302-359 arası söyleniyor ama büyük ihtimalle 323 kalori",
  sources: [
    { title: "Diyetkolik — Ekmek kaç kalori", url: "https://www.diyetkolik.com/kac-kalori/ekmek/" },
    { title: "FatSecret — Haşlanmış yumurta", url: "https://www.fatsecret.com.tr/kalori-besin/genel/yumurta-haslanmis" },
  ],
  model: MODEL,
  elapsed_ms: 0,
  usage: {
    input: 2_140,
    cached_input: 0,
    cache_write_input: 0,
    output: 1_160,
    reasoning: 120,
    total: 3_300,
    web_searches: 1,
    stages: [
      {
        provider: "openai",
        stage: "parse",
        response_id: "mock-parse-00000000-0000-0000-0000-000000000001",
        requested_model: MODEL,
        model: MODEL,
        service_tier: null,
        web_search_tool: null,
        web_searches: 0,
        usage: { input: 920, cached_input: 0, cache_write_input: 0, output: 460, reasoning: 50, total: 1_380 },
      },
      {
        provider: "openai",
        stage: "research",
        response_id: "mock-research-00000000-0000-0000-0000-000000000002",
        requested_model: MODEL,
        model: MODEL,
        service_tier: null,
        web_search_tool: "web_search",
        web_searches: 1,
        usage: { input: 1_220, cached_input: 0, cache_write_input: 0, output: 700, reasoning: 70, total: 1_920 },
      },
    ],
  },
};

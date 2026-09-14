import type { AnalysisStage, OpenAIUsageReceipt, Source, WebSearchTool } from "./types";

/** Fitcoin'in USD karşılığı: 10.000 FC = $1.00. */
export const FITCOIN_PER_USD = 10_000;

/** Tüm hesaplama float olmadan nano-USD (1e-9 USD) üzerinden yapılır. */
export const NANO_USD_PER_USD = 1_000_000_000;
export const NANO_USD_PER_FITCOIN = NANO_USD_PER_USD / FITCOIN_PER_USD;

type WebSearchRates = Partial<Record<WebSearchTool, number>>;

/**
 * Birimlerin tamamı integer nano-USD'dir. Fiyat kartı sürümü makbuzla birlikte
 * saklanmalıdır: OpenAI alias ve fiyatları zamanla değişebilir.
 */
export type OpenAIRateCard = {
  version: string;
  model_family: string;
  input_nano_usd_per_token: number;
  cached_input_nano_usd_per_token: number;
  output_nano_usd_per_token: number;
  web_search_nano_usd_per_call: WebSearchRates;
};

/**
 * GPT-5 mini standard fiyat kartı:
 * - $0.25 / 1M input = 250 nano-USD/token
 * - $0.025 / 1M cached input = 25 nano-USD/token
 * - $2.00 / 1M output = 2,000 nano-USD/token
 * - standard web search = $10 / 1k call = 10,000,000 nano-USD/call
 *
 * Cache-write tokenları kaydedilir ama bu kartta ayrı bir cache-write ücreti
 * yoktur; `input_tokens` içindeki cached olmayan kısım olarak fiyatlanır.
 */
export const GPT_5_MINI_RATE_CARD: Readonly<OpenAIRateCard> = Object.freeze({
  version: "openai-gpt-5-mini-standard-2025-08-07",
  model_family: "gpt-5-mini",
  input_nano_usd_per_token: 250,
  cached_input_nano_usd_per_token: 25,
  output_nano_usd_per_token: 2_000,
  web_search_nano_usd_per_call: Object.freeze({
    web_search: 10_000_000,
    // `gpt-5-mini` reasoning kullanımında eski preview aracının aynı $10/1k
    // fiyatına karşılık gelir. Farklı bir modelde bu fonksiyon fail-closed olur.
    web_search_preview: 10_000_000,
  }),
});

export class BillingError extends Error {
  code: string;

  constructor(message: string, code = "billing_error") {
    super(message);
    this.code = code;
  }
}

/** Bilinmeyen model/araç fiyatı için kullanıcıdan ücret tahmin etmeyin. */
export class UnsupportedOpenAIRateCardError extends BillingError {
  constructor(model: string) {
    super(`Fiyat kartı tanımlı olmayan OpenAI modeli: ${model || "(boş)"}.`, "unsupported_rate_card");
  }
}

/**
 * Yalnızca uygulamanın seçtiği alias ile bu fiyat kartının doğrulanmış model
 * snapshot'ını tanır. Yeni bir snapshot farklı fiyat taşıyabileceği için
 * çağıranı fail-closed yapar; rate-card güncellemesi açık bir deploy olmalı.
 */
export function getOpenAIRateCard(model: string): Readonly<OpenAIRateCard> | null {
  const normalized = model.trim().toLowerCase();
  if (normalized === "gpt-5-mini" || normalized === "gpt-5-mini-2025-08-07") {
    return GPT_5_MINI_RATE_CARD;
  }
  return null;
}

export type ReceiptBillingQuote = {
  stage: AnalysisStage;
  response_id: string | null;
  model: string;
  rate_card_version: string;
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  output_tokens: number;
  web_searches: number;
  input_nano_usd: number;
  cached_input_nano_usd: number;
  output_nano_usd: number;
  web_search_nano_usd: number;
  /** Deterministik fiyat-kartı tahmini; OpenAI fatura toplamı değildir. */
  cost_nano_usd: number;
  /** Tam Fitcoin'e yukarı yuvarlanmış tahsilat. */
  fitcoin: number;
};

export type AnalysisBillingQuote = {
  currency: "USD";
  fitcoin_per_usd: typeof FITCOIN_PER_USD;
  rate_card_versions: string[];
  receipts: ReceiptBillingQuote[];
  cost_nano_usd: number;
  fitcoin: number;
};

/** User-facing receipt returned only after the atomic wallet settlement. */
export type AnalysisChargeReceipt = AnalysisBillingQuote & {
  charged_fitcoin: number;
  available_fitcoin: number;
  reserved_fitcoin: number;
};

/** The analysis route and Responses request share these hard limits. */
export const MAX_ANALYSIS_WEB_SEARCH_CALLS = 8;
export const MAX_PARSE_OUTPUT_TOKENS = 4_000;
export const MAX_RESEARCH_OUTPUT_TOKENS = 6_000;

/**
 * A deliberately conservative reservation quote. It is not a flat meal fee:
 * it grows with the submitted text/image and with the bounded number of web
 * searches. Actual provider usage is always what is eventually charged.
 *
 * Image input is bounded server-side to 2,048 px. The 30k-token allowance is
 * intentionally higher than the vision tiling budget, so an account can
 * never reach OpenAI before its wallet has a sufficient temporary hold.
 */
export function quoteAnalysisReservation(input: {
  model: string;
  source: Source;
  textCharacters: number;
  maximumWebSearchCalls: number;
}): AnalysisBillingQuote {
  const textCharacters = Math.min(Math.max(Math.floor(input.textCharacters), 0), 8_000);
  const maximumWebSearchCalls = Math.min(
    Math.max(Math.floor(input.maximumWebSearchCalls), 0),
    MAX_ANALYSIS_WEB_SEARCH_CALLS,
  );
  const imageInputAllowance = input.source === "image" ? 30_000 : 0;

  // Both system instructions and the maximum first-stage JSON are counted
  // here. Text is charged at one token per character, deliberately a higher
  // bound than normal Turkish tokenization.
  const parseInputTokens = 8_000 + textCharacters + imageInputAllowance;
  const researchInputTokens = 16_000;

  const base = {
    provider: "openai" as const,
    response_id: null,
    requested_model: input.model,
    model: input.model,
    service_tier: null,
  };
  return quoteAnalysisUsage([
    {
      ...base,
      stage: "parse",
      web_search_tool: null,
      web_searches: 0,
      usage: {
        input: parseInputTokens,
        cached_input: 0,
        cache_write_input: 0,
        output: MAX_PARSE_OUTPUT_TOKENS,
        reasoning: 0,
        total: parseInputTokens + MAX_PARSE_OUTPUT_TOKENS,
      },
    },
    {
      ...base,
      stage: "research",
      web_search_tool: "web_search" as const,
      web_searches: maximumWebSearchCalls,
      usage: {
        input: researchInputTokens,
        cached_input: 0,
        cache_write_input: 0,
        output: MAX_RESEARCH_OUTPUT_TOKENS,
        reasoning: 0,
        total: researchInputTokens + MAX_RESEARCH_OUTPUT_TOKENS,
      },
    },
  ]);
}

function nonNegativeSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BillingError(`${field} negatif olmayan güvenli bir integer olmalı.`, "invalid_usage");
  }
  return value;
}

function safeMultiply(a: number, b: number, field: string): number {
  if (a !== 0 && b > Math.floor(Number.MAX_SAFE_INTEGER / a)) {
    throw new BillingError(`${field} güvenli integer aralığını aşıyor.`, "amount_overflow");
  }
  return a * b;
}

function safeAdd(values: readonly number[], field: string): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new BillingError(`${field} güvenli integer aralığını aşıyor.`, "amount_overflow");
  }
  return total;
}

function ceilDiv(numerator: number, denominator: number, field: string): number {
  const result = Math.ceil(numerator / denominator);
  if (!Number.isSafeInteger(result)) {
    throw new BillingError(`${field} güvenli integer aralığını aşıyor.`, "amount_overflow");
  }
  return result;
}

/** Tek, tamamlanmış OpenAI çağrısı için deterministik Fitcoin tahmini üretir. */
export function quoteOpenAIReceipt(receipt: Pick<
  OpenAIUsageReceipt,
  "stage" | "response_id" | "model" | "web_search_tool" | "web_searches" | "usage"
>): ReceiptBillingQuote {
  const rateCard = getOpenAIRateCard(receipt.model);
  if (!rateCard) throw new UnsupportedOpenAIRateCardError(receipt.model);

  const input = nonNegativeSafeInteger(receipt.usage.input, "input_tokens");
  const cachedInput = nonNegativeSafeInteger(receipt.usage.cached_input, "cached_input_tokens");
  const cacheWriteInput = nonNegativeSafeInteger(receipt.usage.cache_write_input, "cache_write_input_tokens");
  const output = nonNegativeSafeInteger(receipt.usage.output, "output_tokens");
  const searches = nonNegativeSafeInteger(receipt.web_searches, "web_searches");

  if (cachedInput > input) {
    throw new BillingError("cached_input_tokens input_tokens değerini aşamaz.", "invalid_usage");
  }
  if (cacheWriteInput > input) {
    throw new BillingError("cache_write_input_tokens input_tokens değerini aşamaz.", "invalid_usage");
  }

  const uncachedInput = input - cachedInput;
  const inputCost = safeMultiply(uncachedInput, rateCard.input_nano_usd_per_token, "input maliyeti");
  const cachedInputCost = safeMultiply(cachedInput, rateCard.cached_input_nano_usd_per_token, "cached input maliyeti");
  const outputCost = safeMultiply(output, rateCard.output_nano_usd_per_token, "output maliyeti");

  let webSearchCost = 0;
  if (searches > 0) {
    const tool = receipt.web_search_tool;
    const pricePerCall = tool ? rateCard.web_search_nano_usd_per_call[tool] : undefined;
    if (pricePerCall === undefined) {
      throw new BillingError("Çalışmış web araması için fiyatlı araç türü yok.", "unsupported_web_search_tool");
    }
    webSearchCost = safeMultiply(searches, pricePerCall, "web search maliyeti");
  }

  const cost = safeAdd([inputCost, cachedInputCost, outputCost, webSearchCost], "toplam maliyet");
  return {
    stage: receipt.stage,
    response_id: receipt.response_id,
    model: receipt.model,
    rate_card_version: rateCard.version,
    input_tokens: input,
    cached_input_tokens: cachedInput,
    cache_write_input_tokens: cacheWriteInput,
    output_tokens: output,
    web_searches: searches,
    input_nano_usd: inputCost,
    cached_input_nano_usd: cachedInputCost,
    output_nano_usd: outputCost,
    web_search_nano_usd: webSearchCost,
    cost_nano_usd: cost,
    fitcoin: ceilDiv(cost, NANO_USD_PER_FITCOIN, "Fitcoin tutarı"),
  };
}

/** Bir analizdeki parse + research çağrılarını tek tahsilat özeti hâline getirir. */
export function quoteAnalysisUsage(receipts: readonly OpenAIUsageReceipt[]): AnalysisBillingQuote {
  const independentlyQuoted = receipts.map((receipt) => quoteOpenAIReceipt(receipt));
  const cost = safeAdd(independentlyQuoted.map((receipt) => receipt.cost_nano_usd), "analiz maliyeti");
  const fitcoin = ceilDiv(cost, NANO_USD_PER_FITCOIN, "analiz Fitcoin tutarı");

  // A ledger settles once per analysis, so individual immutable receipt
  // allocations must add up to that exact amount. Do not independently round
  // each stage — two fractional stages otherwise overstate the debit.
  const baseAllocations = independentlyQuoted.map((receipt) => Math.floor(receipt.cost_nano_usd / NANO_USD_PER_FITCOIN));
  let remainder = fitcoin - safeAdd(baseAllocations, "makbuz Fitcoin tabanı");
  const allocationOrder = independentlyQuoted
    .map((receipt, index) => ({
      index,
      fractional: receipt.cost_nano_usd % NANO_USD_PER_FITCOIN,
    }))
    .sort((a, b) => b.fractional - a.fractional || a.index - b.index);
  for (const item of allocationOrder) {
    if (remainder <= 0) break;
    baseAllocations[item.index] += 1;
    remainder -= 1;
  }
  const quotedReceipts = independentlyQuoted.map((receipt, index) => ({ ...receipt, fitcoin: baseAllocations[index] }));

  return {
    currency: "USD",
    fitcoin_per_usd: FITCOIN_PER_USD,
    rate_card_versions: [...new Set(quotedReceipts.map((receipt) => receipt.rate_card_version))],
    receipts: quotedReceipts,
    cost_nano_usd: cost,
    fitcoin,
  };
}

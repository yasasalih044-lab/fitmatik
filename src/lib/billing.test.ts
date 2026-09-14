import { describe, expect, it } from "vitest";
import {
  FITCOIN_PER_USD,
  NANO_USD_PER_FITCOIN,
  quoteAnalysisReservation,
  quoteAnalysisUsage,
  quoteOpenAIReceipt,
} from "./billing";
import type { OpenAIUsageReceipt } from "./types";

function receipt(overrides: Partial<OpenAIUsageReceipt> = {}): OpenAIUsageReceipt {
  return {
    provider: "openai",
    stage: "parse",
    response_id: "resp-parse",
    requested_model: "gpt-5-mini",
    model: "gpt-5-mini",
    service_tier: null,
    web_search_tool: null,
    web_searches: 0,
    usage: {
      input: 0,
      cached_input: 0,
      cache_write_input: 0,
      output: 0,
      reasoning: 0,
      total: 0,
    },
    ...overrides,
  };
}

describe("Fitcoin rate card", () => {
  it("uses the stated 10,000 FC = $1 scale for GPT-5 mini input", () => {
    const quote = quoteOpenAIReceipt(
      receipt({
        usage: {
          input: 1_000_000,
          cached_input: 0,
          cache_write_input: 0,
          output: 0,
          reasoning: 0,
          total: 1_000_000,
        },
      }),
    );

    expect(FITCOIN_PER_USD).toBe(10_000);
    expect(NANO_USD_PER_FITCOIN).toBe(100_000);
    expect(quote.cost_nano_usd).toBe(250_000_000);
    expect(quote.fitcoin).toBe(2_500);
  });

  it("includes cached input, output, and actual web-search calls", () => {
    const quote = quoteOpenAIReceipt(
      receipt({
        stage: "research",
        response_id: "resp-research",
        web_search_tool: "web_search",
        web_searches: 1,
        usage: {
          input: 1_000_000,
          cached_input: 1_000_000,
          cache_write_input: 0,
          output: 1_000_000,
          reasoning: 0,
          total: 2_000_000,
        },
      }),
    );

    // $0.025 cached input + $2 output + $0.01 web search.
    expect(quote.cost_nano_usd).toBe(2_035_000_000);
    expect(quote.fitcoin).toBe(20_350);
  });

  it("rounds the analysis once, then allocates the exact settled amount across receipts", () => {
    const quote = quoteAnalysisUsage([
      receipt({
        usage: { input: 0, cached_input: 0, cache_write_input: 0, output: 1, reasoning: 0, total: 1 },
      }),
      receipt({
        stage: "research",
        response_id: "resp-research",
        usage: { input: 0, cached_input: 0, cache_write_input: 0, output: 1, reasoning: 0, total: 1 },
      }),
    ]);

    expect(quote.fitcoin).toBe(1);
    expect(quote.receipts.reduce((sum, item) => sum + item.fitcoin, 0)).toBe(quote.fitcoin);
  });

  it("reserves a larger bounded maximum for an image than a short text meal", () => {
    const text = quoteAnalysisReservation({
      model: "gpt-5-mini",
      source: "text",
      textCharacters: 20,
      maximumWebSearchCalls: 1,
    });
    const image = quoteAnalysisReservation({
      model: "gpt-5-mini",
      source: "image",
      textCharacters: 20,
      maximumWebSearchCalls: 1,
    });

    expect(image.fitcoin).toBeGreaterThan(text.fitcoin);
  });

  it("fails closed for an unpriced model", () => {
    expect(() => quoteOpenAIReceipt(receipt({ model: "not-priced" }))).toThrow(/Fiyat kartı/i);
  });
});

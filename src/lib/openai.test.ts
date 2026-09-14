import { describe, expect, it } from "vitest";
import { extractOpenAIResponse, OpenAIError } from "./openai";

const context = {
  stage: "research" as const,
  requested_model: "gpt-5-mini",
  web_search_tool: "web_search" as const,
};

describe("OpenAI usage receipt extraction", () => {
  it("records only completed web-search actions and preserves token detail", () => {
    const extracted = extractOpenAIResponse(
      {
        id: "resp-123",
        model: "gpt-5-mini-2025-08-07",
        output: [
          {
            type: "web_search_call",
            action: { type: "search" },
          },
          {
            type: "web_search_call",
            action: { type: "open_page" },
          },
          {
            type: "message",
            content: [{ type: "output_text", text: "{}", annotations: [] }],
          },
        ],
        usage: {
          input_tokens: 120,
          output_tokens: 40,
          total_tokens: 160,
          input_tokens_details: { cached_tokens: 20 },
          output_tokens_details: { reasoning_tokens: 5 },
        },
      },
      context,
    );

    expect(extracted.receipt.web_searches).toBe(1);
    expect(extracted.receipt.usage).toMatchObject({
      input: 120,
      cached_input: 20,
      output: 40,
      reasoning: 5,
      total: 160,
    });
  });

  it("fails closed when a successful provider response lacks usage", () => {
    expect(() =>
      extractOpenAIResponse(
        {
          id: "resp-usage-missing",
          output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
        },
        context,
      ),
    ).toThrow(OpenAIError);
  });
});

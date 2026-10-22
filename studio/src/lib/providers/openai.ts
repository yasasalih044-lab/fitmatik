import {
  DIRECTIONS_INSTRUCTIONS, DIRECTIONS_SCHEMA, PLAN_SCHEMA, briefText, directionText, planInstructions,
} from "../prompts";
import type { Brief, CampaignPlan, Direction } from "../types";
import { StudioError, type Orientation, type StudioProvider } from "./types";

const API = "https://api.openai.com/v1";

const TEXT_MODEL = () => process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const IMAGE_MODEL = () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const IMAGE_QUALITY = () => process.env.OPENAI_IMAGE_QUALITY || "medium";

type InputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" };

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new StudioError("OPENAI_API_KEY tanımlı değil.", 500);
  return key;
}

async function post(path: string, body: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new StudioError(`OpenAI geçersiz yanıt döndü (HTTP ${res.status}).`);
  }
  const err = data.error as { message?: string; code?: string } | undefined;
  if (err || !res.ok) {
    const status = res.status === 429 ? 429 : res.status === 400 ? 400 : 502;
    throw new StudioError(`OpenAI: ${err?.message || `HTTP ${res.status}`}`, status);
  }
  return data;
}

/** Responses API'dan şemaya uygun JSON alır. */
async function structured<T>(instructions: string, content: InputContent[], name: string, schema: unknown, maxTokens: number): Promise<T> {
  const model = TEXT_MODEL();
  const body: Record<string, unknown> = {
    model,
    instructions,
    input: [{ role: "user", content }],
    text: { format: { type: "json_schema", name, schema, strict: true } },
    max_output_tokens: maxTokens,
  };
  // Akıl yürütme ayarı yalnız bunu destekleyen model ailelerine gönderilir.
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning = { effort: "low" };

  const data = await post("/responses", body, 240_000);
  if (data.status === "incomplete") {
    throw new StudioError("Model yanıtı yarıda kaldı; tekrar deneyin.");
  }
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content as Array<Record<string, unknown>>) {
      if (part.type === "refusal") throw new StudioError("Model bu isteği reddetti.", 422);
      if (part.type === "output_text" && typeof part.text === "string") {
        try {
          return JSON.parse(part.text) as T;
        } catch {
          throw new StudioError("Model geçersiz JSON döndürdü.");
        }
      }
    }
  }
  throw new StudioError("Model boş yanıt döndürdü.");
}

/** Brif metni + yalnız marka/görsel referansları modele gider; logo ve kanıt dosyaları gitmez. */
function briefContent(brief: Brief, extra?: string): InputContent[] {
  const content: InputContent[] = [{ type: "input_text", text: briefText(brief) }];
  for (const ref of brief.references) {
    if (ref.role !== "brand_reference" && ref.role !== "visual_reference") continue;
    content.push({ type: "input_text", text: `Image "${ref.name}" (${ref.role}):` });
    content.push({ type: "input_image", image_url: ref.dataUrl, detail: "low" });
  }
  if (extra) content.push({ type: "input_text", text: extra });
  return content;
}

export const openaiProvider: StudioProvider = {
  name: "openai",

  async directions(brief) {
    const out = await structured<{ directions: Direction[] }>(
      DIRECTIONS_INSTRUCTIONS, briefContent(brief), "jett_directions", DIRECTIONS_SCHEMA, 12_000,
    );
    return out.directions;
  },

  async plan(brief, direction) {
    return structured<CampaignPlan>(
      planInstructions(brief), briefContent(brief, directionText(direction)), "jett_plan", PLAN_SCHEMA, 24_000,
    );
  },

  async image(prompt: string, orientation: Orientation) {
    const data = await post("/images/generations", {
      model: IMAGE_MODEL(),
      prompt,
      size: orientation === "portrait" ? "1024x1536" : "1536x1024",
      quality: IMAGE_QUALITY(),
      output_format: "jpeg",
      output_compression: 92,
      n: 1,
    }, 300_000);
    const first = Array.isArray(data.data) ? (data.data[0] as Record<string, unknown> | undefined) : undefined;
    const b64 = first?.b64_json;
    if (typeof b64 !== "string" || !b64) throw new StudioError("Görsel modeli boş yanıt döndürdü.");
    return { dataUrl: `data:image/jpeg;base64,${b64}` };
  },
};

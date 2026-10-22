import {
  DIRECTIONS_INSTRUCTIONS, DIRECTIONS_SCHEMA, PLAN_SCHEMA, briefText, directionText, planInstructions,
} from "../prompts";
import type { CampaignPlan, Direction } from "../types";
import { StudioError, type Orientation, type StudioProvider } from "./types";

/**
 * Hermes köprüsü. Hermes, Codex aboneliğiyle jett-social-media skill'ini
 * çalıştırır. Talimat ve JSON şeması istekle birlikte gider; Hermes'in
 * istemleri kopyalaması gerekmez. Sözleşme: docs/hermes-contract.md
 */
async function call<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const base = process.env.HERMES_URL?.replace(/\/+$/, "");
  const token = process.env.HERMES_TOKEN;
  if (!base || !token) throw new StudioError("HERMES_URL ve HERMES_TOKEN tanımlı olmalı.", 500);

  let res: Response;
  try {
    res = await fetch(`${base}/jett/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw err;
    throw new StudioError("Hermes'e ulaşılamadı.", 503);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    throw new StudioError(`Hermes: ${data?.error || `HTTP ${res.status}`}`, res.status === 429 ? 429 : 502);
  }
  return data;
}

export const hermesProvider: StudioProvider = {
  name: "hermes",

  async directions(brief) {
    const out = await call<{ directions: Direction[] }>("directions", {
      brief,
      briefText: briefText(brief),
      instructions: DIRECTIONS_INSTRUCTIONS,
      schema: DIRECTIONS_SCHEMA,
    }, 600_000);
    return out.directions;
  },

  async plan(brief, direction) {
    const out = await call<{ plan: CampaignPlan }>("plan", {
      brief,
      direction,
      briefText: `${briefText(brief)}\n\n${directionText(direction)}`,
      instructions: planInstructions(brief),
      schema: PLAN_SCHEMA,
    }, 600_000);
    return out.plan;
  },

  async image(prompt: string, orientation: Orientation) {
    const out = await call<{ dataUrl: string }>("image", { prompt, orientation }, 900_000);
    if (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(out.dataUrl ?? "")) {
      throw new StudioError("Hermes görsel döndürmedi.");
    }
    return { dataUrl: out.dataUrl };
  },
};

import type { Brief, CampaignPlan, Direction } from "../types";

export type Orientation = "portrait" | "landscape";

/**
 * Üretici sözleşmesi. Arayüz yalnız bunu bilir; OpenAI'dan Hermes'e geçmek
 * için STUDIO_PROVIDER değişkenini değiştirmek yeterli.
 */
export interface StudioProvider {
  readonly name: string;
  directions(brief: Brief): Promise<Direction[]>;
  plan(brief: Brief, direction: Direction): Promise<CampaignPlan>;
  image(prompt: string, orientation: Orientation): Promise<{ dataUrl: string }>;
}

export class StudioError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

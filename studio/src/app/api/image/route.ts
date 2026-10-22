import { buildBannerImagePrompt, buildPostImagePrompt } from "@/lib/jett";
import { errorResponse, getProvider, StudioError } from "@/lib/providers";
import { parseBannerCopy, parseBrief, parseDirection, parsePost, readJson } from "@/lib/parse";

/**
 * Tek bir yazısız arka plan üretir. Son istemi sunucu kurar; böylece her
 * görselde Jett'in negatif alan ve "yazı yok" kuralları aynı kalır.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const brief = parseBrief(body.brief);
    const direction = parseDirection(body.direction);
    const kind = body.kind;

    let prompt: string;
    let orientation: "portrait" | "landscape";
    if (kind === "post") {
      prompt = buildPostImagePrompt(parsePost(body.post), direction, brief);
      orientation = "portrait";
    } else if (kind === "banner-triple" || kind === "banner-cover") {
      const copy = parseBannerCopy(body.copy);
      if (!copy) throw new StudioError("Banner metni eksik.", 400);
      prompt = buildBannerImagePrompt(kind, copy, direction, brief);
      orientation = "landscape";
    } else {
      throw new StudioError("Bilinmeyen görsel türü.", 400);
    }

    const { dataUrl } = await getProvider().image(prompt, orientation);
    return Response.json({ dataUrl, prompt });
  } catch (err) {
    return errorResponse(err);
  }
}

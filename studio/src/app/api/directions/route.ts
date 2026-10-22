import { errorResponse, getProvider } from "@/lib/providers";
import { parseBrief, parseDirection, readJson } from "@/lib/parse";

/** Brife göre 3 farklı sanat yönü önerir (referans yoksa da, varsa da). */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const brief = parseBrief(body.brief);
    const raw = await getProvider().directions(brief);
    const directions = raw.slice(0, 3).map(parseDirection);
    return Response.json({ directions });
  } catch (err) {
    return errorResponse(err);
  }
}

import { normalizePlan, validatePlan } from "@/lib/jett";
import { errorResponse, getProvider } from "@/lib/providers";
import { parseBannerCopy, parseBrief, parseDirection, parsePost, readJson } from "@/lib/parse";
import type { CampaignPlan } from "@/lib/types";

/** Seçilen yönle 12 postluk metin planını (ve istenen banner'ları) üretir. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const brief = parseBrief(body.brief);
    const direction = parseDirection(body.direction);
    const raw = await getProvider().plan(brief, direction);
    const parsed: CampaignPlan = {
      campaignSlug: typeof raw.campaignSlug === "string" ? raw.campaignSlug : "",
      directionBrief: typeof raw.directionBrief === "string" ? raw.directionBrief : "",
      posts: (Array.isArray(raw.posts) ? raw.posts : []).map(parsePost),
      banner: {
        triple: parseBannerCopy(raw.banner?.triple),
        cover: parseBannerCopy(raw.banner?.cover),
      },
    };
    const plan = normalizePlan(parsed, brief);
    return Response.json({ plan, issues: validatePlan(plan, brief) });
  } catch (err) {
    return errorResponse(err);
  }
}

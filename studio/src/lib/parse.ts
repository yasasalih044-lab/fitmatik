/**
 * İstemciden gelen gövdeyi güvenli sınırlarla Brief/Direction/Post tiplerine
 * oturtur. Bilinmeyen alanlar düşer; uzun metinler kırpılır.
 */
import { ORDERED_ANCHORS, CLAIMS, ROLES, SCALES } from "./jett";
import { StudioError } from "./providers/types";
import type {
  BannerCopy, BannerKind, Brief, CoverPlatform, Direction, LogoAnchor, Post, ReferenceImage, RefRole, Status,
} from "./types";

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const s = (v: unknown, max = 400): string => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown, max = 200, count = 12): string[] => arr(v).slice(0, count).map((x) => s(x, max));
const int = (v: unknown, fallback: number): number => (Number.isInteger(v) ? (v as number) : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : fallback;
const hex = (v: unknown, fallback: string): string => (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback);

const STATUS: Status[] = ["approved", "proposed"];
const REF_ROLES: RefRole[] = ["brand_reference", "visual_reference", "logo_asset", "proof_asset"];
const MAX_REF_BYTES = 1_500_000;

function parseRefs(v: unknown): ReferenceImage[] {
  return arr(v).slice(0, 6).flatMap((raw, i) => {
    const r = obj(raw);
    const dataUrl = typeof r.dataUrl === "string" ? r.dataUrl : "";
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) || dataUrl.length > MAX_REF_BYTES) return [];
    return [{ id: s(r.id, 40) || `ref-${i}`, name: s(r.name, 80) || `görsel-${i + 1}`, role: oneOf(r.role, REF_ROLES, "visual_reference"), dataUrl }];
  });
}

export function parseBrief(v: unknown): Brief {
  const b = obj(v);
  const colors = obj(b.colors);
  const typo = obj(b.typography);
  const logo = obj(b.logo);
  const banner = obj(b.banner);
  const brief: Brief = {
    businessType: s(b.businessType, 200),
    packageKind: oneOf(b.packageKind, ["campaign", "full", "banner"] as const, "campaign"),
    brandName: s(b.brandName, 80),
    personName: s(b.personName, 80),
    sector: s(b.sector, 120),
    offer: s(b.offer, 600),
    targetAudience: s(b.targetAudience, 400),
    campaignGoal: s(b.campaignGoal, 200),
    language: oneOf(b.language, ["tr", "en"] as const, "tr"),
    voice: s(b.voice, 300),
    cta: s(b.cta, 160),
    ctaDestination: s(b.ctaDestination, 200),
    proofNotes: s(b.proofNotes, 1200),
    prohibited: s(b.prohibited, 400),
    colors: {
      background: hex(colors.background, "#101014"),
      text: hex(colors.text, "#F4F2F6"),
      accent: hex(colors.accent, "#7452A8"),
      status: oneOf(colors.status, STATUS, "proposed"),
    },
    typography: {
      headline: s(typo.headline, 60) || "Inter",
      body: s(typo.body, 60) || "Inter",
      status: oneOf(typo.status, STATUS, "proposed"),
    },
    references: parseRefs(b.references),
    logo: {
      enabled: logo.enabled === true,
      anchor: oneOf(logo.anchor, ["bottom-left", "bottom-right", "top-left", "top-right"] as LogoAnchor[], "bottom-left"),
    },
    banner: {
      kind: oneOf(banner.kind, ["instagram-triple", "platform-cover", "both"] as BannerKind[], "both"),
      platform: oneOf(banner.platform, ["linkedin", "x", "youtube", "facebook"] as CoverPlatform[], "linkedin"),
    },
  };
  if (!brief.brandName.trim() || !brief.offer.trim()) {
    throw new StudioError("Brifte marka adı ve teklif zorunlu.", 400);
  }
  return brief;
}

export function parseDirection(v: unknown): Direction {
  const d = obj(v);
  const sc = obj(d.suggestedColors);
  const direction: Direction = {
    id: s(d.id, 60),
    name: s(d.name, 120),
    centralIdea: s(d.centralIdea, 800),
    imageWorld: s(d.imageWorld, 1500),
    palette: arr(d.palette).slice(0, 6).map((p) => {
      const c = obj(p);
      return { hex: hex(c.hex, "#888888"), role: s(c.role, 80), reason: s(c.reason, 300) };
    }),
    suggestedColors: {
      background: hex(sc.background, "#101014"),
      text: hex(sc.text, "#F4F2F6"),
      accent: hex(sc.accent, "#7452A8"),
    },
    materials: strs(d.materials),
    lighting: s(d.lighting, 400),
    invariants: strs(d.invariants),
    sceneVocabulary: strs(d.sceneVocabulary, 300, 14),
    avoid: strs(d.avoid),
    typographyNote: s(d.typographyNote, 300),
    copyDensity: s(d.copyDensity, 300),
  };
  if (!direction.imageWorld.trim()) throw new StudioError("Seçili tasarım yönü eksik.", 400);
  return direction;
}

export function parsePost(v: unknown, i = 0): Post {
  const p = obj(v);
  return {
    index: int(p.index, i + 1),
    slug: s(p.slug, 60),
    role: oneOf(p.role, ROLES, "education"),
    eyebrow: s(p.eyebrow, 60),
    headlineLines: strs(p.headlineLines, 60, 3),
    accentLine: int(p.accentLine, -1),
    subtext: s(p.subtext, 240),
    anchor: oneOf(p.anchor, ORDERED_ANCHORS, ORDERED_ANCHORS[i % 12]),
    headlineScale: oneOf(p.headlineScale, SCALES, "standard"),
    claimType: oneOf(p.claimType, CLAIMS, "none"),
    proofSource: s(p.proofSource, 300),
    backgroundPrompt: s(p.backgroundPrompt, 1200),
  };
}

export function parseBannerCopy(v: unknown): BannerCopy | null {
  if (!v || typeof v !== "object") return null;
  const c = obj(v);
  return {
    eyebrow: s(c.eyebrow, 60),
    headlineLines: strs(c.headlineLines, 60, 3),
    accentLine: int(c.accentLine, -1),
    subtext: s(c.subtext, 240),
    backgroundPrompt: s(c.backgroundPrompt, 1200),
  };
}

export async function readJson(req: Request): Promise<Obj> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw new StudioError("Geçersiz istek gövdesi.", 400);
  return body as Obj;
}

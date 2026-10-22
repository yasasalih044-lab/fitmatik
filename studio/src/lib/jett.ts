/**
 * Jett Social Media skill kuralları (omerucan0/jett-social-media).
 * Hem istemci hem sunucu kullanır; burada yalnızca saf fonksiyonlar var.
 */
import type {
  Anchor, BannerCopy, Brief, CampaignPlan, ClaimType, CoverPlatform,
  Direction, HeadlineScale, Post, PostRole,
} from "./types";

export const POST_SIZE = { width: 1080, height: 1350 } as const;

/** balanced-orderly yerleşim matrisi: sırası değişmez. */
export const ORDERED_ANCHORS: Anchor[] = [
  "left-top", "center-top", "right-top", "left-bottom", "center",
  "right-bottom", "left-top", "center-bottom", "right-top",
  "left-bottom", "center-top", "right-bottom",
];

export const ROLES: PostRole[] = [
  "problem", "aspiration", "education", "process", "authority",
  "differentiation", "proof", "faq", "cta",
];
export const CLAIMS: ClaimType[] = ["none", "narrative", "process", "proof", "result", "guarantee"];
export const PROOF_REQUIRED: ClaimType[] = ["proof", "result", "guarantee"];
export const SCALES: HeadlineScale[] = ["compact", "standard", "display"];

/** Platform kapak ölçüleri; YouTube'da metin yalnız orta güvenli alana yazılır. */
export const COVER_SIZES: Record<CoverPlatform, { width: number; height: number; label: string; safe?: { width: number; height: number } }> = {
  linkedin: { width: 1584, height: 396, label: "LinkedIn" },
  x: { width: 1500, height: 500, label: "X (Twitter)" },
  youtube: { width: 2560, height: 1440, label: "YouTube", safe: { width: 1546, height: 423 } },
  facebook: { width: 1640, height: 624, label: "Facebook" },
};

/** Üçlü Instagram sırası: üç 1080×1350 kare yan yana tek bir panorama. */
export const TRIPLE_SIZE = { width: POST_SIZE.width * 3, height: POST_SIZE.height } as const;

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function slugify(value: string, fallback = "post"): string {
  const slug = value
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (c) => TR_MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || fallback;
}

export const needsPosts = (brief: Pick<Brief, "packageKind">) => brief.packageKind !== "banner";
export const needsBanner = (brief: Pick<Brief, "packageKind">) => brief.packageKind !== "campaign";
export const wantsTriple = (brief: Pick<Brief, "packageKind" | "banner">) =>
  needsBanner(brief) && brief.banner.kind !== "platform-cover";
export const wantsCover = (brief: Pick<Brief, "packageKind" | "banner">) =>
  needsBanner(brief) && brief.banner.kind !== "instagram-triple";

/** Zorunlu intake alanları; boşsa sihirbaz bir sonraki adıma geçmez. */
export function missingBriefFields(brief: Brief): string[] {
  const missing: string[] = [];
  if (!brief.businessType.trim()) missing.push("Ne yaptığınız");
  if (!brief.brandName.trim()) missing.push("Marka / kişi adı");
  if (!brief.sector.trim()) missing.push("Sektör");
  if (!brief.offer.trim()) missing.push("Teklif / hizmet");
  if (!brief.targetAudience.trim()) missing.push("Hedef kitle");
  if (!brief.campaignGoal.trim()) missing.push("Kampanya amacı");
  for (const key of ["background", "text", "accent"] as const) {
    if (!HEX_RE.test(brief.colors[key])) missing.push(`Renk (${key})`);
  }
  return missing;
}

/** Model çıktısını Jett sözleşmesine oturtur: sıra, yerleşim ve slug'lar sabitlenir. */
export function normalizePlan(plan: CampaignPlan, brief: Brief): CampaignPlan {
  const used = new Set<string>();
  const posts = needsPosts(brief)
    ? plan.posts.slice(0, 12).map((post, i): Post => {
        let slug = slugify(post.slug || post.headlineLines.join(" "), `post-${i + 1}`);
        while (used.has(slug)) slug = `${slug}-${i + 1}`;
        used.add(slug);
        const lines = post.headlineLines.map((l) => l.trim()).filter(Boolean).slice(0, 3);
        return {
          ...post,
          index: i + 1,
          slug,
          anchor: ORDERED_ANCHORS[i],
          headlineLines: lines,
          accentLine: post.accentLine >= -1 && post.accentLine < lines.length ? post.accentLine : -1,
          proofSource: post.proofSource ?? "",
        };
      })
    : [];
  return {
    campaignSlug: slugify(plan.campaignSlug || `${brief.brandName} kampanya`, "kampanya"),
    directionBrief: plan.directionBrief,
    posts,
    banner: {
      triple: wantsTriple(brief) ? plan.banner.triple : null,
      cover: wantsCover(brief) ? plan.banner.cover : null,
    },
  };
}

/** validate_manifest.py kurallarının TypeScript karşılığı (Türkçe mesajlarla). */
export function validatePlan(plan: CampaignPlan, brief: Brief): string[] {
  const errors: string[] = [];
  if (!SLUG_RE.test(plan.campaignSlug)) errors.push("Kampanya kısa adı küçük harf ve tire olmalı.");

  if (needsPosts(brief)) {
    const posts = plan.posts;
    if (posts.length !== 12) errors.push(`Tam 12 post gerekli, ${posts.length} var.`);
    const slugs = new Set<string>();
    posts.forEach((post, i) => {
      const p = `Post ${String(i + 1).padStart(2, "0")}`;
      if (post.index !== i + 1) errors.push(`${p}: sıra numarası hatalı.`);
      if (!SLUG_RE.test(post.slug)) errors.push(`${p}: dosya adı geçersiz.`);
      if (slugs.has(post.slug)) errors.push(`${p}: dosya adı tekrar ediyor.`);
      slugs.add(post.slug);
      if (!ROLES.includes(post.role)) errors.push(`${p}: rol geçersiz.`);
      if (!post.eyebrow.trim()) errors.push(`${p}: üst etiket boş.`);
      if (!post.subtext.trim()) errors.push(`${p}: alt metin boş.`);
      if (post.backgroundPrompt.trim().length < 40) errors.push(`${p}: görsel tarifi çok kısa.`);
      const lines = post.headlineLines;
      if (lines.length < 1 || lines.length > 3 || lines.some((l) => !l.trim())) {
        errors.push(`${p}: başlık 1–3 dolu satır olmalı.`);
      }
      if (post.accentLine < -1 || post.accentLine >= lines.length) errors.push(`${p}: vurgu satırı geçersiz.`);
      if (post.anchor !== ORDERED_ANCHORS[i]) errors.push(`${p}: yerleşim sabit düzene uymuyor.`);
      if (!SCALES.includes(post.headlineScale)) errors.push(`${p}: başlık boyu geçersiz.`);
      if (!CLAIMS.includes(post.claimType)) errors.push(`${p}: iddia türü geçersiz.`);
      if (PROOF_REQUIRED.includes(post.claimType) && !post.proofSource.trim()) {
        errors.push(`${p}: "${post.claimType}" iddiası için kanıt kaynağı yazılmalı.`);
      }
    });
  }

  const banners: [string, BannerCopy | null, boolean][] = [
    ["Üçlü Instagram sırası", plan.banner.triple, wantsTriple(brief)],
    ["Platform kapağı", plan.banner.cover, wantsCover(brief)],
  ];
  for (const [label, copy, wanted] of banners) {
    if (!wanted) continue;
    if (!copy) { errors.push(`${label}: metin planı yok.`); continue; }
    if (copy.headlineLines.length < 1 || copy.headlineLines.some((l) => !l.trim())) errors.push(`${label}: başlık boş.`);
    if (copy.backgroundPrompt.trim().length < 40) errors.push(`${label}: görsel tarifi çok kısa.`);
  }
  return errors;
}

const ANCHOR_SPACE: Record<Anchor, string> = {
  "left-top": "upper-left",
  "center-top": "upper-center",
  "right-top": "upper-right",
  "left-bottom": "lower-left",
  center: "central",
  "right-bottom": "lower-right",
  "center-bottom": "lower-center",
};

const NO_TEXT = "No text, letters, numbers, logo, watermark, signature, interface, border, or frame.";

function world(direction: Direction, brief: Brief): string {
  const palette = direction.palette.map((c) => c.hex).join(", ");
  return [
    `Shared visual world: ${direction.imageWorld.trim()}`,
    `Color palette to grade toward: ${palette}.`,
    `Brand context: ${brief.sector}; offer: ${brief.offer}; audience: ${brief.targetAudience}.`,
  ].join(" ");
}

/** image-generation.md iskeleti: dünya + sahne + negatif alan + çıktı + yasaklar. */
export function buildPostImagePrompt(post: Post, direction: Direction, brief: Brief): string {
  return [
    `Create one premium vertical 4:5 campaign photograph for a ${brief.sector} brand.`,
    post.backgroundPrompt.trim(),
    world(direction, brief),
    `Keep the ${ANCHOR_SPACE[post.anchor]} region calm, low-detail and uncluttered for later typography; place the main subject away from it.`,
    "One continuous scene, no collage.",
    NO_TEXT,
  ].join(" ");
}

export function buildBannerImagePrompt(kind: "banner-triple" | "banner-cover", copy: BannerCopy, direction: Direction, brief: Brief): string {
  const shape = kind === "banner-triple"
    ? "Create one wide panoramic campaign photograph that will be split into three side-by-side vertical Instagram posts; keep the composition continuous across the full width with no seams, and keep the central third calm and uncluttered for later typography."
    : "Create one wide horizontal cover photograph for a social platform header; keep the left half calm, low-detail and uncluttered for later typography and place the main subject on the right.";
  return [
    shape,
    `Brand: ${brief.sector}.`,
    copy.backgroundPrompt.trim(),
    world(direction, brief),
    "One continuous scene, no collage, no grid, no panels.",
    NO_TEXT,
  ].join(" ");
}

/** Jett `brand/brand.json` biçiminde dışa aktarım (Hermes/Codex render'ı için). */
export function toJettBrand(brief: Brief, plan: CampaignPlan) {
  return {
    brandName: brief.brandName,
    campaignSlug: plan.campaignSlug,
    sector: brief.sector,
    offer: brief.offer,
    targetAudience: brief.targetAudience,
    campaignGoal: brief.campaignGoal,
    language: brief.language,
    colors: { ...brief.colors },
    typography: { ...brief.typography },
    layoutMode: "balanced-orderly",
    output: { ...POST_SIZE },
    logo: {
      enabled: brief.logo.enabled,
      file: brief.logo.enabled ? "assets/logo.png" : "",
      anchor: brief.logo.anchor,
      width: 160,
    },
  };
}

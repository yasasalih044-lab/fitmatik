/**
 * Jett skill'inin intake, sanat yönetimi ve içerik mimarisi kurallarını
 * model talimatına çevirir. Sağlayıcıdan bağımsızdır: OpenAI de Hermes de
 * aynı talimat ve şemaları kullanabilir.
 */
import { ORDERED_ANCHORS, needsPosts, wantsCover, wantsTriple } from "./jett";
import type { Brief, Direction } from "./types";

const LANG: Record<Brief["language"], string> = { tr: "Turkish", en: "English" };

const ROLE_LABEL: Record<string, string> = {
  brand_reference: "brand reference (identity evidence: palette, type, existing posts)",
  visual_reference: "visual reference (mood, composition, lighting only — never palette, logo or facts)",
  logo_asset: "logo asset (rendered later as-is; do not redraw)",
  proof_asset: "proof asset (supports a concrete claim)",
};

/** Brifi modele okunur bir metin olarak sunar; önerilen kararlar açıkça işaretlenir. */
export function briefText(brief: Brief): string {
  const refs = brief.references.length
    ? brief.references.map((r, i) => `  ${i + 1}. ${r.name} — ${ROLE_LABEL[r.role]}`).join("\n")
    : "  none supplied";
  return [
    `What we are promoting: ${brief.businessType}`,
    `Brand name: ${brief.brandName}`,
    brief.personName ? `Person behind the brand: ${brief.personName}` : "",
    `Sector: ${brief.sector}`,
    `Offer / service: ${brief.offer}`,
    `Target audience: ${brief.targetAudience}`,
    `Campaign goal: ${brief.campaignGoal}`,
    `Copy language: ${LANG[brief.language]}`,
    `Brand voice: ${brief.voice || "not given — keep it clear and confident"}`,
    `CTA: ${brief.cta || "not given — propose a transparent next step"}${brief.ctaDestination ? ` → ${brief.ctaDestination}` : ""}`,
    `Brand colors (${brief.colors.status}): background ${brief.colors.background}, text ${brief.colors.text}, accent ${brief.colors.accent}`,
    `Typography (${brief.typography.status}): headline ${brief.typography.headline}, body ${brief.typography.body}`,
    `Approved proof sources: ${brief.proofNotes.trim() || "NONE — do not make proof, result or guarantee claims"}`,
    `Prohibited words / subjects: ${brief.prohibited || "none"}`,
    `Supplied images:\n${refs}`,
  ].filter(Boolean).join("\n");
}

const CORE_RULES = `
You work for the Jett Social Media studio. Non-negotiable rules:
- Use only the current brand's inputs and the images explicitly supplied. Never borrow another client's identity.
- Never invent metrics, customers, results, guarantees, testimonials, certifications, prices or proof.
- A visual reference sets mood or composition only; it never becomes the palette, logo or a factual claim.
- If a brand decision is marked "proposed", it is a reversible suggestion, not an approved brand fact.
- Avoid default luxury shorthand (beige/black/gold, marble, linen, fruit, sculptural bottles, cinematic shadows) unless the topic justifies it.
- Ask yourself: if the logo disappeared, would the imagery still belong to this topic? If not, make it more specific.
`.trim();

export const DIRECTIONS_INSTRUCTIONS = `
${CORE_RULES}

Task: derive exactly 3 genuinely different art-direction candidates for this brand's social media campaign.
Candidates must differ in visual idea, materials, light and photographic grammar — not just colors.
Derive imagery from the real product, service, process, tools, setting or a clear conceptual metaphor.
If brand colors are "approved", every candidate must build on them; if "proposed", each candidate suggests its own restrained brand colors.

Field rules:
- id: short lowercase slug.
- name, centralIdea, typographyNote, copyDensity, palette[].role, palette[].reason, materials, invariants, sceneVocabulary, avoid: write in Turkish for the client.
- imageWorld: ONE English paragraph for an image model describing the shared visual world (central idea, materials, environment, lens feel, lighting, contrast, color treatment). No text or logos in it.
- palette: 3–4 colors as #RRGGBB with a reason for each.
- suggestedColors: background, text and accent as #RRGGBB with strong text/background contrast (approved colors when they are approved).
- sceneVocabulary: 6–10 distinct, topic-specific scene ideas with varied scale and viewpoint.
`.trim();

export function planInstructions(brief: Brief): string {
  const parts = [CORE_RULES, ""];
  if (needsPosts(brief)) {
    parts.push(`
Task: write the production plan for exactly 12 Instagram posts (1080×1350, 4:5) in the chosen visual direction.

Story (default 12-post architecture):
- Posts 01–03: problem, tension or aspiration. Suggested roles: problem, aspiration, problem.
- Posts 04–06: education, solution mechanics or process. Roles: education, process, process.
- Posts 07–09: authority and differentiation without unsupported claims. Roles: authority, differentiation, differentiation.
- Posts 10–11: sourced proof only when approved proof sources exist; otherwise faq or process. Roles: proof|faq, faq.
- Post 12: clear CTA and next step. Role: cta.

Fixed anchors (text position) in order: ${ORDERED_ANCHORS.join(", ")}.

Per post:
- eyebrow: short context label, max 26 characters.
- headlineLines: 1–3 exact lines, each max 18 characters. Never ask the image model to draw them.
- accentLine: zero-based index of the line shown in the accent color, or -1.
- subtext: one supporting sentence, max 110 characters.
- headlineScale: display for hooks and the CTA, otherwise standard; compact for long lines.
- claimType: none | narrative | process | proof | result | guarantee. proof/result/guarantee require proofSource quoting an approved proof source exactly; with no approved proof never use them. Avoid guarantee.
- proofSource: exact source note or empty string.
- backgroundPrompt: ENGLISH, 2–3 sentences: the post-specific subject and scene, camera position, lens feel, light and materials. Put the main subject away from the post's anchor region and keep that region calm. Adjacent posts must change scale or viewpoint while staying in one visual world. Never mention text, letters, logos or UI.
- slug: short lowercase hyphenated ASCII token.
The final post uses the supplied CTA and destination exactly when given.`.trim());
  } else {
    parts.push("Task: this request is banner-only. Return an empty posts array.");
  }

  const banners: string[] = [];
  if (wantsTriple(brief)) {
    banners.push("banner.triple: copy for one panoramic image split into three side-by-side Instagram posts. The text sits in the middle tile: headlineLines 1–2 lines, each max 18 characters; subtext max 90 characters. backgroundPrompt in ENGLISH describes one continuous wide scene that reads across all three tiles.");
  }
  if (wantsCover(brief)) {
    banners.push("banner.cover: copy for a wide platform cover/header. headlineLines 1–2 lines, each max 26 characters; subtext max 80 characters. backgroundPrompt in ENGLISH with the subject on the right and a calm left half.");
  }
  parts.push("", banners.length
    ? `Banners:\n- ${banners.join("\n- ")}\nSet any banner that is not listed to null.`
    : "Set banner.triple and banner.cover to null.");

  parts.push("", `All copy (eyebrow, headlines, subtext) is written in ${LANG[brief.language]} with correct grammar and characters. directionBrief: 2–4 Turkish sentences summarising the chosen direction for the client.`);
  return parts.join("\n");
}

export function directionText(direction: Direction): string {
  return `Chosen art direction (follow it):\n${JSON.stringify(direction, null, 2)}`;
}

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const hex = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" } as const;

const directionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id", "name", "centralIdea", "imageWorld", "palette", "suggestedColors", "materials",
    "lighting", "invariants", "sceneVocabulary", "avoid", "typographyNote", "copyDensity",
  ],
  properties: {
    id: str,
    name: str,
    centralIdea: str,
    imageWorld: str,
    palette: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hex", "role", "reason"],
        properties: { hex, role: str, reason: str },
      },
    },
    suggestedColors: {
      type: "object",
      additionalProperties: false,
      required: ["background", "text", "accent"],
      properties: { background: hex, text: hex, accent: hex },
    },
    materials: strArr,
    lighting: str,
    invariants: strArr,
    sceneVocabulary: strArr,
    avoid: strArr,
    typographyNote: str,
    copyDensity: str,
  },
} as const;

export const DIRECTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["directions"],
  properties: { directions: { type: "array", items: directionSchema } },
} as const;

const bannerCopySchema = {
  type: "object",
  additionalProperties: false,
  required: ["eyebrow", "headlineLines", "accentLine", "subtext", "backgroundPrompt"],
  properties: {
    eyebrow: str,
    headlineLines: strArr,
    accentLine: { type: "integer" },
    subtext: str,
    backgroundPrompt: str,
  },
} as const;

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["campaignSlug", "directionBrief", "posts", "banner"],
  properties: {
    campaignSlug: str,
    directionBrief: str,
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "index", "slug", "role", "eyebrow", "headlineLines", "accentLine", "subtext",
          "anchor", "headlineScale", "claimType", "proofSource", "backgroundPrompt",
        ],
        properties: {
          index: { type: "integer" },
          slug: str,
          role: { type: "string", enum: ["problem", "aspiration", "education", "process", "authority", "differentiation", "proof", "faq", "cta"] },
          eyebrow: str,
          headlineLines: strArr,
          accentLine: { type: "integer" },
          subtext: str,
          anchor: { type: "string", enum: ["left-top", "center-top", "right-top", "left-bottom", "center", "right-bottom", "center-bottom"] },
          headlineScale: { type: "string", enum: ["compact", "standard", "display"] },
          claimType: { type: "string", enum: ["none", "narrative", "process", "proof", "result", "guarantee"] },
          proofSource: str,
          backgroundPrompt: str,
        },
      },
    },
    banner: {
      type: "object",
      additionalProperties: false,
      required: ["triple", "cover"],
      properties: {
        triple: { anyOf: [bannerCopySchema, { type: "null" }] },
        cover: { anyOf: [bannerCopySchema, { type: "null" }] },
      },
    },
  },
} as const;

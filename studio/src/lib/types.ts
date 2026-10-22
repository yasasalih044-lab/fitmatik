/** Stüdyonun istemci ve sunucu arasında paylaştığı veri sözleşmesi. */

export type Status = "approved" | "proposed";

/** "Ne yapıyoruz?" sorusunun cevabı: hangi paketi üretiyoruz. */
export type PackageKind = "campaign" | "full" | "banner";

/** Tam pakette banner türü: üçlü Instagram sırası, platform kapağı veya ikisi. */
export type BannerKind = "instagram-triple" | "platform-cover" | "both";
export type CoverPlatform = "linkedin" | "x" | "youtube" | "facebook";

export type RefRole = "brand_reference" | "visual_reference" | "logo_asset" | "proof_asset";

export type ReferenceImage = {
  id: string;
  name: string;
  role: RefRole;
  /** İstemcide küçültülmüş data URL. */
  dataUrl: string;
};

export type BrandColors = { background: string; text: string; accent: string; status: Status };
export type Typography = { headline: string; body: string; status: Status };

export type Brief = {
  businessType: string;
  packageKind: PackageKind;
  brandName: string;
  personName: string;
  sector: string;
  offer: string;
  targetAudience: string;
  campaignGoal: string;
  language: "tr" | "en";
  voice: string;
  cta: string;
  ctaDestination: string;
  proofNotes: string;
  prohibited: string;
  colors: BrandColors;
  typography: Typography;
  references: ReferenceImage[];
  logo: { enabled: boolean; anchor: LogoAnchor };
  banner: { kind: BannerKind; platform: CoverPlatform };
};

export type LogoAnchor = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export type Direction = {
  id: string;
  name: string;
  centralIdea: string;
  /** Görsel modeline giden, İngilizce tek paragraflık görsel dünya tarifi. */
  imageWorld: string;
  palette: { hex: string; role: string; reason: string }[];
  suggestedColors: { background: string; text: string; accent: string };
  materials: string[];
  lighting: string;
  invariants: string[];
  sceneVocabulary: string[];
  avoid: string[];
  typographyNote: string;
  copyDensity: string;
};

export type Anchor =
  | "left-top" | "center-top" | "right-top"
  | "left-bottom" | "center" | "right-bottom" | "center-bottom";

export type PostRole =
  | "problem" | "aspiration" | "education" | "process" | "authority"
  | "differentiation" | "proof" | "faq" | "cta";

export type ClaimType = "none" | "narrative" | "process" | "proof" | "result" | "guarantee";
export type HeadlineScale = "compact" | "standard" | "display";

/** Jett `content/posts.json` öğesiyle birebir aynı alanlar. */
export type Post = {
  index: number;
  slug: string;
  role: PostRole;
  eyebrow: string;
  headlineLines: string[];
  accentLine: number;
  subtext: string;
  anchor: Anchor;
  headlineScale: HeadlineScale;
  claimType: ClaimType;
  proofSource: string;
  backgroundPrompt: string;
};

export type BannerCopy = {
  eyebrow: string;
  headlineLines: string[];
  accentLine: number;
  subtext: string;
  backgroundPrompt: string;
};

export type CampaignPlan = {
  campaignSlug: string;
  directionBrief: string;
  posts: Post[];
  banner: { triple: BannerCopy | null; cover: BannerCopy | null };
};

/** Görsel üretim isteği: sunucu son istemi kendisi kurar. */
export type ImageJob =
  | { kind: "post"; post: Post; direction: Direction; brief: Brief }
  | { kind: "banner-triple" | "banner-cover"; copy: BannerCopy; direction: Direction; brief: Brief };

export type ImageResult = { dataUrl: string };

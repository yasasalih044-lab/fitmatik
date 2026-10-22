import type { Brief, CampaignPlan, Direction } from "@/lib/types";

export type StepId = "is" | "marka" | "renk" | "referans" | "banner" | "yon" | "plan" | "uret";

export type ImgState = {
  status: "idle" | "loading" | "done" | "error";
  dataUrl?: string;
  prompt?: string;
  error?: string;
};

export type Review = { status: "UNVERIFIED" | "PASS" | "FAIL"; notes: string };

export type Draft = {
  step: StepId;
  brief: Brief;
  directions: Direction[];
  direction: Direction | null;
  plan: CampaignPlan | null;
};

export const DEFAULT_BRIEF: Brief = {
  businessType: "",
  packageKind: "campaign",
  brandName: "",
  personName: "",
  sector: "",
  offer: "",
  targetAudience: "",
  campaignGoal: "",
  language: "tr",
  voice: "",
  cta: "",
  ctaDestination: "",
  proofNotes: "",
  prohibited: "",
  colors: { background: "#101014", text: "#F4F2F6", accent: "#9D8CFF", status: "approved" },
  typography: { headline: "Space Grotesk", body: "Inter", status: "proposed" },
  references: [],
  logo: { enabled: false, anchor: "bottom-left" },
  banner: { kind: "both", platform: "linkedin" },
};

export const DEFAULT_DRAFT: Draft = { step: "is", brief: DEFAULT_BRIEF, directions: [], direction: null, plan: null };

const KEY = "mavros-studio:draft:v1";

/** Görseller tarayıcı belleğinde kalır; taslağa yalnız metin kaydedilir. */
export function loadDraft(): Draft {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_DRAFT;
    const saved = JSON.parse(raw) as Partial<Draft>;
    return {
      ...DEFAULT_DRAFT,
      ...saved,
      brief: { ...DEFAULT_BRIEF, ...saved.brief, references: [] },
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

export function saveDraft(draft: Draft) {
  try {
    const { references: _refs, ...brief } = draft.brief;
    void _refs;
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, brief }));
  } catch {
    // Gizli sekme veya dolu depolama: taslak kaydı isteğe bağlı.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // yok say
  }
}

export async function api<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Sunucuya ulaşılamadı.");
  }
  if (res.status === 401) throw new Error("Oturumun süresi doldu; sayfayı yenileyip yeniden giriş yap.");
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error || `İstek başarısız (HTTP ${res.status}).`);
  return data;
}

/** Görsel isteklerinde referans görselleri taşımaya gerek yok. */
export const leanBrief = (brief: Brief): Brief => ({ ...brief, references: [] });

/** Dosyayı küçültüp data URL'e çevirir (logo için PNG, diğerleri JPEG). */
export async function fileToDataUrl(file: File, maxSide: number, keepAlpha: boolean): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`${file.name} okunamadı.`));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

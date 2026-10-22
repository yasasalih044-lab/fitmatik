import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORDERED_ANCHORS, buildPostImagePrompt, normalizePlan, slugify, validatePlan } from "./jett";
import type { Brief, CampaignPlan, Direction, Post } from "./types";
import { buildZip, crc32 } from "./zip";

const brief: Brief = {
  businessType: "Ajans hizmeti",
  packageKind: "campaign",
  brandName: "Mavros",
  personName: "",
  sector: "Dijital ajans",
  offer: "Yapay zekâ destekli sosyal medya yönetimi",
  targetAudience: "KOBİ sahipleri",
  campaignGoal: "Bilinirlik",
  language: "tr",
  voice: "",
  cta: "",
  ctaDestination: "",
  proofNotes: "",
  prohibited: "",
  colors: { background: "#0B0B0F", text: "#F4F2F6", accent: "#8C7CFF", status: "approved" },
  typography: { headline: "Inter", body: "Inter", status: "proposed" },
  references: [],
  logo: { enabled: false, anchor: "bottom-left" },
  banner: { kind: "both", platform: "linkedin" },
};

const post = (i: number, extra: Partial<Post> = {}): Post => ({
  index: 99,
  slug: "Aynı Başlık",
  role: "process",
  eyebrow: "Adım",
  headlineLines: ["Önce dinle", "sonra üret", "", "fazla"],
  accentLine: 1,
  subtext: "Süreci şeffaf anlatırız.",
  anchor: "center",
  headlineScale: "standard",
  claimType: "process",
  proofSource: "",
  backgroundPrompt: `Scene ${i}: a studio desk with sketches and soft window light, subject on the right side.`,
  ...extra,
});

const plan = (posts: Post[]): CampaignPlan => ({
  campaignSlug: "Mavros Lansman!",
  directionBrief: "",
  posts,
  banner: { triple: null, cover: null },
});

describe("slugify", () => {
  it("Türkçe karakterleri ASCII'ye çevirir", () => {
    expect(slugify("Şık Çözüm Ağı")).toBe("sik-cozum-agi");
    expect(slugify("!!!")).toBe("post");
  });
});

describe("normalizePlan", () => {
  it("sırayı, sabit yerleşimi ve benzersiz slug'ları zorlar", () => {
    const out = normalizePlan(plan(Array.from({ length: 13 }, (_, i) => post(i))), brief);
    expect(out.posts).toHaveLength(12);
    expect(out.posts.map((p) => p.index)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(out.posts.map((p) => p.anchor)).toEqual(ORDERED_ANCHORS);
    expect(new Set(out.posts.map((p) => p.slug)).size).toBe(12);
    expect(out.posts[0].headlineLines).toEqual(["Önce dinle", "sonra üret", "fazla"]);
    expect(out.campaignSlug).toBe("mavros-lansman");
    expect(validatePlan(out, brief)).toEqual([]);
  });

  it("istenmeyen banner'ları düşürür", () => {
    const copy = { eyebrow: "", headlineLines: ["x"], accentLine: -1, subtext: "", backgroundPrompt: "y".repeat(50) };
    const out = normalizePlan({ ...plan([]), banner: { triple: copy, cover: copy } }, { ...brief, packageKind: "banner", banner: { kind: "platform-cover", platform: "x" } });
    expect(out.posts).toEqual([]);
    expect(out.banner.triple).toBeNull();
    expect(out.banner.cover).toEqual(copy);
  });
});

describe("validatePlan", () => {
  it("kanıtsız sonuç iddiasını reddeder", () => {
    const out = normalizePlan(plan(Array.from({ length: 12 }, (_, i) => post(i, i === 9 ? { claimType: "result" } : {}))), brief);
    expect(validatePlan(out, brief)).toEqual(['Post 10: "result" iddiası için kanıt kaynağı yazılmalı.']);
  });

  it("eksik post sayısını ve eksik banner'ı yakalar", () => {
    const out = normalizePlan(plan([post(0)]), { ...brief, packageKind: "full" });
    const issues = validatePlan(out, { ...brief, packageKind: "full" });
    expect(issues).toContain("Tam 12 post gerekli, 1 var.");
    expect(issues).toContain("Üçlü Instagram sırası: metin planı yok.");
    expect(issues).toContain("Platform kapağı: metin planı yok.");
  });
});

describe("buildPostImagePrompt", () => {
  it("negatif alanı ve yazı yasağını her istemde taşır", () => {
    const direction = { imageWorld: "Paper craft studio.", palette: [{ hex: "#112233", role: "", reason: "" }] } as Direction;
    const p = normalizePlan(plan(Array.from({ length: 12 }, (_, i) => post(i))), brief).posts[0];
    const prompt = buildPostImagePrompt(p, direction, brief);
    expect(prompt).toContain("upper-left region calm");
    expect(prompt).toContain("No text, letters, numbers, logo");
    expect(prompt).toContain("#112233");
  });
});

describe("buildZip", () => {
  it("bilinen CRC32 değerini üretir", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("standart araçlarla açılabilen arşiv yazar", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const file = join(dir, "t.zip");
    const enc = new TextEncoder();
    writeFileSync(file, buildZip([
      { name: "Marka - 12 Post/01-ilk.txt", data: enc.encode("merhaba") },
      { name: "Marka - 12 Post/preview/şema.json", data: enc.encode("{}") },
    ]));
    const listing = execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print('\\n'.join(z.namelist()));print(z.read(z.namelist()[0]).decode())", file]).toString();
    expect(listing).toContain("Marka - 12 Post/preview/şema.json");
    expect(listing).toContain("merhaba");
  });
});

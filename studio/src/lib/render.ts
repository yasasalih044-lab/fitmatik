/**
 * Deterministik yazı katmanı. Jett'in templates/post.html şablonunu canvas'a
 * taşır: görsel modeli asla yazı çizmez, metin ve logo burada basılır.
 */
import { POST_SIZE, TRIPLE_SIZE } from "./jett";
import type { Anchor, BannerCopy, LogoAnchor, Post } from "./types";

export type Theme = {
  background: string;
  text: string;
  accent: string;
  headlineFamily: string;
  headlineWeight: number;
  bodyFamily: string;
  lang: string;
};

export type Logo = { img: HTMLImageElement; anchor: LogoAnchor } | null;

type Ctx = CanvasRenderingContext2D;
type Align = "left" | "center" | "right";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi."));
    img.src = src;
  });
}

/**
 * Canvas, yüklenmemiş fontu sessizce yedek fontla çizer; önce asıl aileyi yükleriz.
 * Yığının yalnız ilk ailesi istenir: yerel yedek (ör. Arial) yoksa tüm yükleme reddedilmesin.
 */
export async function ensureFonts(theme: Theme): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const primary = (stack: string) => stack.split(",")[0].trim();
  const sample = "ÇĞİÖŞÜçğıöşü Aa";
  await Promise.all([
    [theme.headlineWeight, theme.headlineFamily],
    [600, theme.bodyFamily],
    [500, theme.bodyFamily],
    [400, theme.bodyFamily],
  ].map(async ([weight, family]) => {
    const font = `${weight} 64px ${primary(String(family))}`;
    // Stil dosyası yenilenirse yüz nesneleri değişebilir; çizimden önce bir kez daha doğrula.
    for (let i = 0; i < 2 && !document.fonts.check(font, sample); i++) {
      await document.fonts.load(font, sample).catch(() => []);
    }
  }));
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Okunurluk perdesi: Jett'te siyahtır; açık temalı markada zemin rengiyle yapılır. */
function washColor(theme: Theme, alpha: number): string {
  const [r, g, b] = luminance(theme.text) > 0.4 ? rgb(theme.background).map((v) => Math.min(v, 40)) : rgb(theme.background);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawCover(ctx: Ctx, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function wash(ctx: Ctx, theme: Theme, anchor: Anchor, w: number, h: number) {
  let g: CanvasGradient;
  if (anchor.startsWith("left") || anchor.startsWith("right")) {
    g = anchor.startsWith("left") ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(w, 0, 0, 0);
    g.addColorStop(0, washColor(theme, 0.68));
    g.addColorStop(0.6, washColor(theme, 0.22));
    g.addColorStop(1, washColor(theme, 0.06));
  } else if (anchor.endsWith("top")) {
    g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, washColor(theme, 0.62));
    g.addColorStop(0.62, washColor(theme, 0.1));
    g.addColorStop(1, washColor(theme, 0.1));
  } else if (anchor.endsWith("bottom")) {
    g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, washColor(theme, 0.68));
    g.addColorStop(0.68, washColor(theme, 0.1));
    g.addColorStop(1, washColor(theme, 0.1));
  } else {
    g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w / 2, h / 2));
    g.addColorStop(0, washColor(theme, 0.55));
    g.addColorStop(0.72, washColor(theme, 0.12));
    g.addColorStop(1, washColor(theme, 0.12));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function spacing(ctx: Ctx, px: number) {
  if ("letterSpacing" in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type Copy = { eyebrow: string; headlineLines: string[]; accentLine: number; subtext: string };

type BlockSpec = {
  x: number;              // hizalama noktası (sol kenar / orta / sağ kenar)
  top: number; bottom: number;
  vertical: "top" | "center" | "bottom";
  align: Align;
  maxWidth: number;
  headlineSize: number;
  eyebrowSize: number;
  subtextSize: number;
  subtextWidth: number;
};

/** Kural çizgisi + üst etiket + başlık + alt metin bloğunu çizer. */
function drawCopy(ctx: Ctx, theme: Theme, copy: Copy, spec: BlockSpec) {
  const upper = (s: string) => s.toLocaleUpperCase(theme.lang === "tr" ? "tr" : "en");

  // Başlık satırlarını genişliğe sığdır (tek ölçek, satırlar korunur).
  let hs = spec.headlineSize;
  const setHeadline = (size: number) => {
    ctx.font = `${theme.headlineWeight} ${size}px ${theme.headlineFamily}`;
    spacing(ctx, -0.048 * size);
  };
  setHeadline(hs);
  const widest = Math.max(1, ...copy.headlineLines.map((l) => ctx.measureText(l).width));
  if (widest > spec.maxWidth) hs = Math.max(spec.headlineSize * 0.55, hs * (spec.maxWidth / widest));
  const lineH = hs * 0.96;

  ctx.font = `400 ${spec.subtextSize}px ${theme.bodyFamily}`;
  spacing(ctx, -0.01 * spec.subtextSize);
  const subLines = copy.subtext.trim() ? wrap(ctx, copy.subtext.trim(), spec.subtextWidth) : [];
  const subLineH = spec.subtextSize * 1.45;

  const ruleH = Math.max(3, spec.eyebrowSize * 0.18);
  const eyebrowH = copy.eyebrow.trim() ? spec.eyebrowSize * 1.2 + spec.eyebrowSize * 1.09 : 0;
  const blockH = ruleH + spec.eyebrowSize + eyebrowH + copy.headlineLines.length * lineH
    + (subLines.length ? spec.subtextSize * 1.2 + subLines.length * subLineH : 0);

  let y = spec.vertical === "top" ? spec.top
    : spec.vertical === "bottom" ? spec.bottom - blockH
    : spec.top + (spec.bottom - spec.top - blockH) / 2;

  ctx.textAlign = spec.align;
  ctx.textBaseline = "top";

  // Vurgu çizgisi
  const ruleW = spec.eyebrowSize * 2.9;
  const ruleX = spec.align === "left" ? spec.x : spec.align === "center" ? spec.x - ruleW / 2 : spec.x - ruleW;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.roundRect(ruleX, y, ruleW, ruleH, ruleH / 2);
  ctx.fill();
  y += ruleH + spec.eyebrowSize;

  if (copy.eyebrow.trim()) {
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = theme.text;
    ctx.font = `600 ${spec.eyebrowSize}px ${theme.bodyFamily}`;
    spacing(ctx, spec.eyebrowSize * 0.32);
    ctx.fillText(upper(copy.eyebrow.trim()), spec.x, y);
    ctx.globalAlpha = 1;
    y += eyebrowH;
  }

  setHeadline(hs);
  copy.headlineLines.forEach((line, i) => {
    ctx.fillStyle = i === copy.accentLine ? theme.accent : theme.text;
    ctx.fillText(line, spec.x, y + (lineH - hs) / 2);
    y += lineH;
  });

  if (subLines.length) {
    y += spec.subtextSize * 1.2;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = theme.text;
    ctx.font = `400 ${spec.subtextSize}px ${theme.bodyFamily}`;
    spacing(ctx, -0.01 * spec.subtextSize);
    for (const line of subLines) {
      ctx.fillText(line, spec.x, y);
      y += subLineH;
    }
    ctx.globalAlpha = 1;
  }
  spacing(ctx, 0);
}

function drawLogo(ctx: Ctx, logo: Logo, box: { left: number; right: number; top: number; bottom: number }, maxW: number, maxH: number) {
  if (!logo) return;
  const scale = Math.min(maxW / logo.img.naturalWidth, maxH / logo.img.naturalHeight);
  const w = logo.img.naturalWidth * scale;
  const h = logo.img.naturalHeight * scale;
  const x = logo.anchor.endsWith("left") ? box.left : box.right - w;
  const y = logo.anchor.startsWith("top") ? box.top : box.bottom - h;
  ctx.drawImage(logo.img, x, y, w, h);
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas desteklenmiyor.");
  return [c, ctx];
}

const HEADLINE_PX = { display: 88, standard: 76, compact: 66 } as const;

/** 1080×1350 production post — Jett post.html ile aynı ölçüler. */
export function renderPost(bg: HTMLImageElement, post: Post, theme: Theme, logo: Logo): HTMLCanvasElement {
  const { width: W, height: H } = POST_SIZE;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, bg, W, H);
  wash(ctx, theme, post.anchor, W, H);

  // Sağ üstte sıra numarası (logo oradaysa çakışmasın diye çizilmez)
  if (logo?.anchor !== "top-right") {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = theme.text;
    ctx.font = `500 18px ${theme.bodyFamily}`;
    spacing(ctx, 5);
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(String(post.index).padStart(2, "0"), W - 52, 44);
    ctx.globalAlpha = 1;
  }

  const safe = { left: 72, right: W - 72, top: 80, bottom: H - 80 };
  const [h, v] = post.anchor === "center" ? ["center", "center"] : post.anchor.split("-");
  const align = h as Align;
  // Metin bloğu logoyla aynı kenardaysa logonun yüksekliği kadar içeri çekilir.
  if (logo) {
    const logoH = logo.img.naturalHeight * Math.min(160 / logo.img.naturalWidth, 100 / logo.img.naturalHeight);
    if (v === "bottom" && logo.anchor.startsWith("bottom")) safe.bottom = H - 58 - logoH - 28;
    if (v === "top" && logo.anchor.startsWith("top")) safe.top = 58 + logoH + 28;
  }
  drawCopy(ctx, theme, post, {
    x: align === "left" ? safe.left : align === "center" ? W / 2 : safe.right,
    top: safe.top,
    bottom: safe.bottom,
    vertical: v as BlockSpec["vertical"],
    align,
    maxWidth: 820,
    headlineSize: HEADLINE_PX[post.headlineScale],
    eyebrowSize: 22,
    subtextSize: 25,
    subtextWidth: 650,
  });
  drawLogo(ctx, logo, { left: 72, right: W - 72, top: 58, bottom: H - 58 }, 160, 100);
  return c;
}

/** Üçlü Instagram sırası: 3240×1350 panorama, metin ortadaki karede. Sonra üçe bölünür. */
export function renderTriple(bg: HTMLImageElement, copy: BannerCopy, theme: Theme, logo: Logo): HTMLCanvasElement[] {
  const { width: W, height: H } = TRIPLE_SIZE;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, bg, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, POST_SIZE.width * 0.95);
  g.addColorStop(0, washColor(theme, 0.6));
  g.addColorStop(1, washColor(theme, 0.08));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const mid = POST_SIZE.width;
  drawCopy(ctx, theme, copy, {
    x: W / 2, top: 80, bottom: H - 80, vertical: "center", align: "center",
    maxWidth: 860, headlineSize: 92, eyebrowSize: 22, subtextSize: 26, subtextWidth: 680,
  });
  drawLogo(ctx, logo && { ...logo, anchor: "bottom-left" }, { left: W / 2 - 80, right: W / 2 + 80, top: 58, bottom: H - 58 }, 160, 100);

  return [0, 1, 2].map((i) => {
    const [tile, tctx] = canvas(mid, H);
    tctx.drawImage(c, i * mid, 0, mid, H, 0, 0, mid, H);
    return tile;
  });
}

/** Platform kapağı: metin solda güvenli alanda, konu sağda. */
export function renderCover(
  bg: HTMLImageElement, copy: BannerCopy, theme: Theme, logo: Logo,
  size: { width: number; height: number; safe?: { width: number; height: number } },
): HTMLCanvasElement {
  const { width: W, height: H } = size;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, bg, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, washColor(theme, 0.72));
  g.addColorStop(0.65, washColor(theme, 0.12));
  g.addColorStop(1, washColor(theme, 0.04));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const area = size.safe
    ? { left: (W - size.safe.width) / 2, top: (H - size.safe.height) / 2, width: size.safe.width, height: size.safe.height }
    : { left: W * 0.06, top: H * 0.14, width: W * 0.88, height: H * 0.72 };
  const lines = Math.max(1, copy.headlineLines.length);
  const headline = Math.min(area.height / (lines + 1.6), area.width * 0.075);
  drawCopy(ctx, theme, copy, {
    x: area.left, top: area.top, bottom: area.top + area.height, vertical: "center", align: "left",
    maxWidth: area.width * 0.6, headlineSize: headline, eyebrowSize: Math.max(12, headline * 0.24),
    subtextSize: Math.max(13, headline * 0.3), subtextWidth: area.width * 0.55,
  });
  drawLogo(ctx, logo && { ...logo, anchor: "bottom-right" },
    { left: area.left, right: area.left + area.width, top: area.top, bottom: area.top + area.height },
    area.width * 0.14, area.height * 0.24);
  return c;
}

/** Yazısız arka planı Jett ölçüsüne (1080×1350) kırpar. */
export function renderBackground(bg: HTMLImageElement): HTMLCanvasElement {
  const [c, ctx] = canvas(POST_SIZE.width, POST_SIZE.height);
  drawCover(ctx, bg, POST_SIZE.width, POST_SIZE.height);
  return c;
}

/** 3×4 kontak sayfası (1296×2160), Jett verify betiğiyle aynı ızgara. */
export function renderContactSheet(tiles: HTMLImageElement[], background: string): HTMLCanvasElement {
  const [c, ctx] = canvas(1296, 2160);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1296, 2160);
  tiles.forEach((img, i) => {
    ctx.drawImage(img, (i % 3) * 432, Math.floor(i / 3) * 540, 432, 540);
  });
  return c;
}

export function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG oluşturulamadı."))), "image/png");
  });
}

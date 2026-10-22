"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, FileArchive, Loader2, RefreshCw, Wand2 } from "lucide-react";
import { fontByName } from "@/lib/fonts";
import { COVER_SIZES, POST_SIZE, toJettBrand, validatePlan, wantsCover, wantsTriple } from "@/lib/jett";
import {
  ensureFonts, loadImage, renderBackground, renderContactSheet, renderCover, renderPost, renderTriple, toBlob,
  type Logo, type Theme,
} from "@/lib/render";
import type { Brief, CampaignPlan, Direction } from "@/lib/types";
import { buildZip, type ZipEntry } from "@/lib/zip";
import { Badge, Button, Notice, TextArea, cx } from "../ui";
import type { ImgState, Review } from "./state";

type Rendered = { name: string; blob: Blob; url: string; width: number; height: number; hash: string };

export const imageKeys = (brief: Brief, plan: CampaignPlan): string[] => [
  ...plan.posts.map((p) => `post-${p.index}`),
  ...(wantsTriple(brief) && plan.banner.triple ? ["triple"] : []),
  ...(wantsCover(brief) && plan.banner.cover ? ["cover"] : []),
];

const pad = (n: number) => String(n).padStart(2, "0");

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").trim() || "Marka";

const VISUAL_CHECKS = [
  "3×4 akış tek bir kampanya gibi okunuyor, dağınık değil",
  "Yazı blokları güvenli kenar boşluklarında ve hizalı",
  "Başlıklar okunaklı, önemli nesnelerle çakışmıyor",
  "Arka planlarda üretilmiş yazı, logo, filigran veya bozuk detay yok",
  "Metinler birebir doğru, dil bilgisi düzgün, kaynaksız iddia yok",
  "Başka bir markanın kimliği görünmüyor",
];

export function StepProduce({ brief, direction, plan, images, review, onGenerate, onReview }: {
  brief: Brief;
  direction: Direction;
  plan: CampaignPlan;
  images: Record<string, ImgState>;
  review: Review;
  onGenerate: (keys: string[]) => void;
  onReview: (r: Review) => void;
}) {
  const [renders, setRenders] = useState<Record<string, Rendered[]>>({});
  const [renderError, setRenderError] = useState("");
  const [zipping, setZipping] = useState(false);
  const cache = useRef(new Map<string, Rendered[]>());

  const keys = useMemo(() => imageKeys(brief, plan), [brief, plan]);
  const pending = keys.filter((k) => images[k]?.status !== "done" && images[k]?.status !== "loading");
  const loading = keys.filter((k) => images[k]?.status === "loading").length;
  const done = keys.filter((k) => images[k]?.status === "done").length;

  const head = fontByName(brief.typography.headline);
  const body = fontByName(brief.typography.body);
  const theme: Theme = useMemo(() => ({
    background: brief.colors.background,
    text: brief.colors.text,
    accent: brief.colors.accent,
    headlineFamily: head.family,
    headlineWeight: head.weight,
    bodyFamily: body.family,
    lang: brief.language,
  }), [brief.colors, brief.language, head, body]);

  const logoRef = brief.logo.enabled ? brief.references.find((r) => r.role === "logo_asset") : undefined;
  const cover = COVER_SIZES[brief.banner.platform];

  // Hazır her arka planın üstüne metni deterministik olarak basar; değişmeyenler önbellekten gelir.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureFonts(theme);
        const logoImg = logoRef ? await loadImage(logoRef.dataUrl) : null;
        const logo: Logo = logoImg ? { img: logoImg, anchor: brief.logo.anchor } : null;
        const base = JSON.stringify([theme, logoRef?.id, brief.logo.anchor]);
        const next: Record<string, Rendered[]> = {};
        const used = new Set<string>();

        const make = async (canvas: HTMLCanvasElement, name: string): Promise<Rendered> => {
          const blob = await toBlob(canvas);
          return { name, blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, hash: await sha256(blob) };
        };

        for (const key of keys) {
          const img = images[key];
          if (img?.status !== "done" || !img.dataUrl) continue;
          const post = key.startsWith("post-") ? plan.posts.find((p) => `post-${p.index}` === key) : undefined;
          const copy = key === "triple" ? plan.banner.triple : key === "cover" ? plan.banner.cover : null;
          const cacheKey = `${key}|${img.dataUrl.length}|${img.dataUrl.slice(-64)}|${base}|${JSON.stringify(post ?? copy)}|${brief.banner.platform}`;
          used.add(cacheKey);
          const hit = cache.current.get(cacheKey);
          if (hit) { next[key] = hit; continue; }

          const bg = await loadImage(img.dataUrl);
          let out: Rendered[] = [];
          if (post) {
            out = [await make(renderPost(bg, post, theme, logo), `${pad(post.index)}-${post.slug}.png`)];
          } else if (key === "triple" && copy) {
            const tiles = renderTriple(bg, copy, theme, logo);
            out = await Promise.all(tiles.map((t, i) => make(t, `instagram-sira-${i + 1}.png`)));
          } else if (key === "cover" && copy) {
            out = [await make(renderCover(bg, copy, theme, logo, cover), `kapak-${brief.banner.platform}-${cover.width}x${cover.height}.png`)];
          }
          if (cancelled) { out.forEach((r) => URL.revokeObjectURL(r.url)); return; }
          cache.current.set(cacheKey, out);
          next[key] = out;
        }
        if (cancelled) return;
        // Artık kullanılmayan çizimleri bellekten at.
        for (const [k, list] of cache.current) {
          if (!used.has(k)) {
            list.forEach((r) => URL.revokeObjectURL(r.url));
            cache.current.delete(k);
          }
        }
        setRenders(next);
        setRenderError("");
      } catch (e) {
        if (!cancelled) setRenderError(e instanceof Error ? e.message : "Çizim başarısız.");
      }
    })();
    return () => { cancelled = true; };
  }, [images, plan, keys, theme, logoRef, brief.logo.anchor, brief.banner.platform, cover]);

  useEffect(() => {
    const store = cache.current;
    return () => {
      for (const list of store.values()) list.forEach((r) => URL.revokeObjectURL(r.url));
      store.clear();
    };
  }, []);

  const postRenders = useMemo(
    () => plan.posts.map((p) => renders[`post-${p.index}`]?.[0]).filter(Boolean) as Rendered[],
    [plan.posts, renders],
  );

  // Teknik QA: Jett verify betiğinin tarayıcıdaki karşılığı.
  const technical = useMemo(() => {
    const errors = [...validatePlan(plan, brief)];
    if (plan.posts.length) {
      if (postRenders.length !== plan.posts.length) errors.push(`${plan.posts.length - postRenders.length} post henüz çizilmedi.`);
      for (const r of postRenders) {
        if (r.width !== POST_SIZE.width || r.height !== POST_SIZE.height) errors.push(`${r.name} ${r.width}×${r.height} boyutunda.`);
      }
      const hashes = new Set(postRenders.map((r) => r.hash));
      if (hashes.size !== postRenders.length) errors.push("Birebir aynı iki post var.");
    }
    if (wantsTriple(brief) && !renders.triple) errors.push("Üçlü sıra henüz çizilmedi.");
    if (wantsCover(brief) && !renders.cover) errors.push("Kapak henüz çizilmedi.");
    return { status: errors.length ? "FAIL" : "PASS", errors } as const;
  }, [plan, brief, postRenders, renders]);

  async function contactSheet(): Promise<Blob> {
    const tiles = await Promise.all(postRenders.map((r) => loadImage(r.url)));
    return toBlob(renderContactSheet(tiles, brief.colors.background));
  }

  async function downloadZip() {
    setZipping(true);
    try {
      const root = `${safeName(brief.brandName)} - ${plan.posts.length ? "12 Post Final" : "Banner"}`;
      const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
      const enc = new TextEncoder();
      const json = (v: unknown) => enc.encode(JSON.stringify(v, null, 2) + "\n");
      const entries: ZipEntry[] = [];

      for (const r of postRenders) entries.push({ name: `${root}/${r.name}`, data: await bytes(r.blob) });
      for (const r of renders.triple ?? []) entries.push({ name: `${root}/banner/${r.name}`, data: await bytes(r.blob) });
      for (const r of renders.cover ?? []) entries.push({ name: `${root}/banner/${r.name}`, data: await bytes(r.blob) });
      if (postRenders.length === 12) entries.push({ name: `${root}/preview/contact-sheet.png`, data: await bytes(await contactSheet()) });

      const now = new Date().toISOString();
      entries.push({
        name: `${root}/preview/qa-report.json`,
        data: json({
          campaign: plan.campaignSlug,
          generatedAt: now,
          technical,
          visualReview: { ...review, inspectedAt: review.status === "UNVERIFIED" ? null : now },
          browserRuntime: { status: "PASS", note: "Yazı katmanı tarayıcı canvas'ında deterministik olarak basıldı." },
          publication: { status: "UNVERIFIED", note: "Hiçbir platforma yüklenmedi veya planlanmadı." },
          proposed: {
            colors: brief.colors.status === "proposed",
            typography: brief.typography.status === "proposed",
          },
        }),
      });
      // Jett manifest'i: Hermes/Codex aynı kampanyayı kendi render'ıyla yeniden üretebilir.
      entries.push({ name: `${root}/jett/brand/brand.json`, data: json(toJettBrand(brief, plan)) });
      if (plan.posts.length) entries.push({ name: `${root}/jett/content/posts.json`, data: json(plan.posts) });
      for (const p of plan.posts) {
        const img = images[`post-${p.index}`];
        if (!img?.dataUrl) continue;
        // Jett normalize betiğinin beklediği gibi 1080×1350 PNG.
        const bg = await toBlob(renderBackground(await loadImage(img.dataUrl)));
        entries.push({ name: `${root}/jett/assets/backgrounds/${pad(p.index)}-${p.slug}.png`, data: await bytes(bg) });
      }
      if (logoRef) entries.push({ name: `${root}/jett/assets/logo.png`, data: await bytes(await (await fetch(logoRef.dataUrl)).blob()) });
      entries.push({
        name: `${root}/preview/recipe.json`,
        data: json({
          direction,
          prompts: Object.fromEntries(keys.map((k) => [k, images[k]?.prompt ?? null])),
        }),
      });

      download(new Blob([buildZip(entries) as BlobPart], { type: "application/zip" }), `${plan.campaignSlug}.zip`);
    } finally {
      setZipping(false);
    }
  }

  const tile = (key: string, label: string, aspect: string, r?: Rendered) => {
    const img = images[key];
    return (
      <figure key={key + label} className="group relative overflow-hidden rounded-xl border border-line bg-panel" style={{ aspectRatio: aspect }}>
        {r ? (
          // eslint-disable-next-line @next/next/no-img-element -- yerel blob önizlemesi
          <img src={r.url} alt={label} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center p-3 text-center text-xs text-faint">
            {img?.status === "loading" ? <Loader2 className="size-5 animate-spin text-accent" aria-label="Üretiliyor" />
              : img?.status === "error" ? <span className="text-bad"><AlertTriangle className="mx-auto mb-1 size-4" aria-hidden />{img.error}</span>
              : label}
          </div>
        )}
        <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <span className="hidden truncate text-[11px] font-semibold text-white/90 sm:inline">{label}</span>
          <span className="flex gap-1">
            {r && (
              <button type="button" onClick={() => download(r.blob, r.name)} aria-label={`${label} indir`} className="rounded-md bg-black/50 p-1.5 text-white hover:bg-black/80">
                <Download className="size-3.5" aria-hidden />
              </button>
            )}
            {img?.status !== "loading" && (
              <button type="button" onClick={() => onGenerate([key])} aria-label={`${label} yeniden üret`} className="rounded-md bg-black/50 p-1.5 text-white hover:bg-black/80">
                <RefreshCw className="size-3.5" aria-hidden />
              </button>
            )}
          </span>
        </figcaption>
      </figure>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => onGenerate(pending)} disabled={!pending.length || loading > 0}>
          <Wand2 className="size-4" aria-hidden />
          {done === 0 ? `Görselleri üret (${keys.length})` : pending.length ? `Eksikleri üret (${pending.length})` : "Hepsi hazır"}
        </Button>
        <span className="text-sm text-muted">
          {done}/{keys.length} arka plan hazır{loading > 0 && ` · ${loading} üretiliyor`}
        </span>
        <span className="text-xs text-faint">Her görsel 20–90 sn sürebilir; sayfayı kapatma.</span>
      </div>
      {renderError && <Notice tone="bad">{renderError}</Notice>}

      {plan.posts.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-lg font-bold">Instagram akışı · 3×4</h3>
          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1.5">
            {plan.posts.map((p) => tile(`post-${p.index}`, `${pad(p.index)} · ${p.headlineLines[0] ?? ""}`, "4 / 5", renders[`post-${p.index}`]?.[0]))}
          </div>
        </section>
      )}

      {wantsTriple(brief) && plan.banner.triple && (
        <section className="space-y-3">
          <h3 className="font-display text-lg font-bold">Üçlü Instagram sırası</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => tile("triple", `Sıra ${i + 1}`, "4 / 5", renders.triple?.[i]))}
          </div>
          <p className="text-xs text-faint">Instagram en yeni postu sola koyar: önce <b>3</b>, sonra <b>2</b>, en son <b>1</b> numarayı paylaş.</p>
        </section>
      )}

      {wantsCover(brief) && plan.banner.cover && (
        <section className="space-y-3">
          <h3 className="font-display text-lg font-bold">{cover.label} kapağı · {cover.width}×{cover.height}</h3>
          {tile("cover", `${cover.label} kapağı`, `${cover.width} / ${cover.height}`, renders.cover?.[0])}
          {cover.safe && <p className="text-xs text-faint">YouTube her cihazda yalnız ortadaki {cover.safe.width}×{cover.safe.height} alanı gösterir; metin oraya yerleştirildi.</p>}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            Teknik kontrol <Badge tone={technical.status === "PASS" ? "ok" : "bad"}>{technical.status}</Badge>
          </h3>
          {technical.errors.length ? (
            <ul className="list-inside list-disc text-sm text-muted">{technical.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          ) : (
            <p className="text-sm text-muted">Boyutlar, sıra, sabit yerleşim, benzersiz görseller ve kanıt kuralları tamam.</p>
          )}
          <p className="text-xs text-faint">Teknik geçiş görsel kaliteyi kanıtlamaz; aşağıdaki gözle kontrol ayrıca gerekir.</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            Gözle kontrol
            <Badge tone={review.status === "PASS" ? "ok" : review.status === "FAIL" ? "bad" : "warn"}>
              {review.status === "UNVERIFIED" ? "DOĞRULANMADI" : review.status}
            </Badge>
          </h3>
          <ul className="space-y-1 text-xs text-muted">{VISUAL_CHECKS.map((c) => <li key={c}>· {c}</li>)}</ul>
          <TextArea aria-label="Kontrol notu" rows={2} placeholder="Ne kontrol ettin? Örn. kontak sayfası + 01, 04, 08, 12" value={review.notes} onChange={(e) => onReview({ ...review, notes: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            {(["PASS", "FAIL", "UNVERIFIED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onReview({ ...review, status: s })}
                className={cx("rounded-full border px-3 py-1 text-xs font-semibold", review.status === s ? "border-accent text-accent-strong" : "border-line text-muted")}
              >
                {s === "PASS" ? "Geçti" : s === "FAIL" ? "Kusur var" : "Henüz bakmadım"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel-2 p-4">
        <Button onClick={downloadZip} busy={zipping} disabled={!done}>
          <FileArchive className="size-4" aria-hidden /> Paketi indir (ZIP)
        </Button>
        {postRenders.length === 12 && (
          <Button variant="outline" onClick={async () => download(await contactSheet(), "contact-sheet.png")}>
            <Download className="size-4" aria-hidden /> Kontak sayfası
          </Button>
        )}
        <p className="text-xs text-faint">
          Paket: postlar, banner’lar, kontak sayfası, QA raporu ve Jett manifest’i (Hermes/Codex ile yeniden render için).
          {review.status !== "PASS" && " Gözle kontrol geçmeden yayına hazır sayılmaz."}
        </p>
      </section>
    </div>
  );
}

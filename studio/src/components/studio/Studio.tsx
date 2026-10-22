"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, LogOut, RotateCcw } from "lucide-react";
import Wordmark from "@/components/Wordmark";
import { missingBriefFields, needsBanner, validatePlan } from "@/lib/jett";
import type { Brief, CampaignPlan, Direction } from "@/lib/types";
import { Button, Notice, cx } from "../ui";
import { StepProduce, imageKeys } from "./Produce";
import { StepDirection, StepPlan } from "./steps-ai";
import { StepBanner, StepBrand, StepColors, StepRefs, StepWhat } from "./steps-intake";
import {
  DEFAULT_DRAFT, api, clearDraft, leanBrief, loadDraft, saveDraft,
  type Draft, type ImgState, type Review, type StepId,
} from "./state";

const STEPS: { id: StepId; label: string; title: string; sub: string }[] = [
  { id: "is", label: "Ne yapıyoruz?", title: "Ne yapıyoruz?", sub: "Önce neyi tanıttığımızı ve ne üreteceğimizi netleştirelim." },
  { id: "marka", label: "Marka / kişi", title: "Kim için üretiyoruz?", sub: "Marka ya da kişi bilgileri. Boş bıraktığın yerleri uydurmayız." },
  { id: "renk", label: "Renk ve yazı", title: "Marka rengi ve yazı tipi", sub: "Rengin yoksa sorun değil; önerir ve 'önerilen' diye işaretleriz." },
  { id: "referans", label: "Referanslar", title: "Görsel referanslar", sub: "Logo, marka görselleri ve beğendiğin örnekler — varsa." },
  { id: "banner", label: "Banner türü", title: "Hangi banner?", sub: "Pakette banner'ı netleştirelim." },
  { id: "yon", label: "Tasarım yönü", title: "Tasarım yönü", sub: "Konuna özel bir görsel dünya seç." },
  { id: "plan", label: "Metin planı", title: "Metin planı", sub: "Görsel üretmeden önce metinleri gözden geçir ve düzenle." },
  { id: "uret", label: "Üret ve indir", title: "Üret ve indir", sub: "Yazısız arka planlar üretilir; metin ve logo sonradan, birebir basılır." },
];

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const subscribeNoop = () => () => {};

/** Taslak localStorage'dan okunacağı için stüdyo yalnız tarayıcıda kurulur. */
export default function Studio() {
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  if (!hydrated) return <div className="min-h-dvh" />;
  return <StudioApp initial={loadDraft()} />;
}

function StudioApp({ initial }: { initial: Draft }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [images, setImages] = useState<Record<string, ImgState>>({});
  const [review, setReview] = useState<Review>({ status: "UNVERIFIED", notes: "" });
  const [busy, setBusy] = useState({ directions: false, plan: false });
  const [errors, setErrors] = useState({ directions: "", plan: "", step: "" });

  const { brief, step, directions, direction, plan } = draft;
  useEffect(() => saveDraft(draft), [draft]);

  const steps = useMemo(() => STEPS.filter((s) => s.id !== "banner" || needsBanner(brief)), [brief]);
  const index = Math.max(0, steps.findIndex((s) => s.id === step));
  const current = steps[index];
  const issues = useMemo(() => (plan ? validatePlan(plan, brief) : []), [plan, brief]);

  const patch = (p: Partial<Brief>) => setDraft((d) => ({ ...d, brief: { ...d.brief, ...p } }));
  const setPlan = (next: CampaignPlan | null) => setDraft((d) => ({ ...d, plan: next }));

  /** Adımdan çıkmak için eksik ne var? */
  function blocker(id: StepId): string {
    if (id === "is") {
      return brief.businessType.trim() ? "" : "Önce neyi tanıttığımızı seç.";
    }
    if (id === "marka") {
      const missing = missingBriefFields(brief).filter((m) => !m.startsWith("Renk") && m !== "Ne yaptığınız");
      return missing.length ? `Eksik: ${missing.join(", ")}.` : "";
    }
    if (id === "yon") return direction ? "" : "Devam etmek için bir tasarım yönü seç.";
    if (id === "plan") return !plan ? "Önce metin planını oluştur." : issues.length ? "Plandaki uyarıları düzelt." : "";
    return "";
  }

  async function loadDirections() {
    setBusy((b) => ({ ...b, directions: true }));
    setErrors((e) => ({ ...e, directions: "" }));
    try {
      const out = await api<{ directions: Direction[] }>("/api/directions", { brief });
      setDraft((d) => ({ ...d, directions: out.directions }));
    } catch (e) {
      setErrors((x) => ({ ...x, directions: e instanceof Error ? e.message : "Yönler alınamadı." }));
    } finally {
      setBusy((b) => ({ ...b, directions: false }));
    }
  }

  async function makePlan(dir = direction) {
    if (!dir) return;
    if (Object.values(images).some((i) => i.status === "done") && !window.confirm("Yeni plan mevcut görselleri silecek. Devam edilsin mi?")) return;
    setBusy((b) => ({ ...b, plan: true }));
    setErrors((e) => ({ ...e, plan: "" }));
    try {
      const out = await api<{ plan: CampaignPlan }>("/api/plan", { brief, direction: dir });
      setPlan(out.plan);
      setImages({});
      setReview({ status: "UNVERIFIED", notes: "" });
    } catch (e) {
      setErrors((x) => ({ ...x, plan: e instanceof Error ? e.message : "Plan oluşturulamadı." }));
    } finally {
      setBusy((b) => ({ ...b, plan: false }));
    }
  }

  function selectDirection(d: Direction) {
    setDraft((prev) => ({
      ...prev,
      direction: d,
      // Renk önerisi istenmişse yönün renkleri "önerilen" olarak markaya işlenir.
      brief: prev.brief.colors.status === "proposed"
        ? { ...prev.brief, colors: { ...d.suggestedColors, status: "proposed" } }
        : prev.brief,
    }));
  }

  async function generate(keys: string[]) {
    if (!plan || !direction || !keys.length) return;
    const lean = leanBrief(brief);
    setReview((r) => ({ ...r, status: "UNVERIFIED" }));
    setImages((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = { ...next[k], status: "loading", error: undefined };
      return next;
    });
    await pool(keys, 3, async (key) => {
      const post = plan.posts.find((p) => `post-${p.index}` === key);
      const body = post
        ? { kind: "post", post, direction, brief: lean }
        : { kind: key === "triple" ? "banner-triple" : "banner-cover", copy: key === "triple" ? plan.banner.triple : plan.banner.cover, direction, brief: lean };
      try {
        const out = await api<{ dataUrl: string; prompt: string }>("/api/image", body);
        setImages((prev) => ({ ...prev, [key]: { status: "done", dataUrl: out.dataUrl, prompt: out.prompt } }));
      } catch (e) {
        setImages((prev) => ({ ...prev, [key]: { ...prev[key], status: "error", error: e instanceof Error ? e.message : "Üretilemedi." } }));
      }
    });
  }

  function go(to: StepId) {
    setErrors((e) => ({ ...e, step: "" }));
    setDraft((d) => ({ ...d, step: to }));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (to === "yon" && !directions.length && !busy.directions) void loadDirections();
    if (to === "plan" && !plan && !busy.plan) void makePlan();
  }

  function next() {
    const why = blocker(current.id);
    if (why) {
      setErrors((e) => ({ ...e, step: why }));
      return;
    }
    const target = steps[index + 1];
    if (target) go(target.id);
  }

  /** Önceki adımların hepsi tamamsa o adıma tıklanabilir. */
  const reachable = (i: number) => steps.slice(0, i).every((s) => !blocker(s.id));

  function reset() {
    if (!window.confirm("Tüm proje bilgileri ve görseller silinsin mi?")) return;
    clearDraft();
    setDraft(DEFAULT_DRAFT);
    setImages({});
    setReview({ status: "UNVERIFIED", notes: "" });
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
    router.replace("/giris");
  }

  const pendingImages = plan ? imageKeys(brief, plan).some((k) => images[k]?.status === "loading") : false;
  useEffect(() => {
    if (!pendingImages && !Object.keys(images).length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pendingImages, images]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <Wordmark />
        <div className="flex items-center gap-1">
          <Button variant="ghost" onClick={reset}><RotateCcw className="size-4" aria-hidden /><span className="hidden sm:inline">Yeni proje</span></Button>
          <Button variant="ghost" onClick={logout} aria-label="Çıkış"><LogOut className="size-4" aria-hidden /></Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-6 pb-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Adımlar" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <ol className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {steps.map((s, i) => {
              const active = s.id === current.id;
              const doneStep = i < index;
              const can = reachable(i);
              return (
                <li key={s.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => can && go(s.id)}
                    disabled={!can}
                    aria-current={active ? "step" : undefined}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition",
                      active ? "bg-panel-2 text-ink" : "text-muted hover:text-ink",
                      !can && "cursor-not-allowed opacity-40 hover:text-muted",
                    )}
                  >
                    <span className={cx(
                      "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold",
                      active ? "border-accent bg-accent text-on-accent" : doneStep ? "border-accent-border text-accent" : "border-line",
                    )}>
                      {doneStep ? <Check className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="min-w-0 rounded-3xl border border-line bg-panel/60 p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Adım {index + 1} / {steps.length}</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{current.title}</h1>
          <p className="mt-2 text-muted">{current.sub}</p>

          <div className="mt-8">
            {current.id === "is" && <StepWhat brief={brief} patch={patch} />}
            {current.id === "marka" && <StepBrand brief={brief} patch={patch} />}
            {current.id === "renk" && <StepColors brief={brief} patch={patch} />}
            {current.id === "referans" && <StepRefs brief={brief} patch={patch} />}
            {current.id === "banner" && <StepBanner brief={brief} patch={patch} />}
            {current.id === "yon" && (
              <StepDirection
                brief={brief}
                directions={directions}
                selected={direction}
                busy={busy.directions}
                error={errors.directions}
                onReload={loadDirections}
                onSelect={selectDirection}
              />
            )}
            {current.id === "plan" && (
              <StepPlan
                brief={brief}
                plan={plan}
                issues={issues}
                busy={busy.plan}
                error={errors.plan}
                onRegenerate={() => void makePlan()}
                onChange={setPlan}
              />
            )}
            {current.id === "uret" && plan && direction && (
              <StepProduce
                brief={brief}
                direction={direction}
                plan={plan}
                images={images}
                review={review}
                onGenerate={(keys) => void generate(keys)}
                onReview={setReview}
              />
            )}
          </div>

          {errors.step && <div className="mt-6"><Notice tone="warn">{errors.step}</Notice></div>}

          <footer className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
            <Button variant="ghost" onClick={() => index > 0 && go(steps[index - 1].id)} disabled={index === 0}>
              <ArrowLeft className="size-4" aria-hidden /> Geri
            </Button>
            {index < steps.length - 1 && (
              <Button onClick={next}>
                Devam <ArrowRight className="size-4" aria-hidden />
              </Button>
            )}
          </footer>
        </main>
      </div>
    </div>
  );
}

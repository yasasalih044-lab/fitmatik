"use client";

import { useRef, useState } from "react";
import {
  Columns3, ImagePlus, LayoutGrid, Package, PanelTop, Palette, Sparkles, Trash2, Upload,
} from "lucide-react";
import { FONT_OPTIONS, fontByName } from "@/lib/fonts";
import { COVER_SIZES } from "@/lib/jett";
import { contrastRatio } from "@/lib/render";
import type { BannerKind, Brief, CoverPlatform, LogoAnchor, ReferenceImage, RefRole } from "@/lib/types";
import { Badge, Chips, Field, Notice, OptionCard, TextArea, TextInput, cx } from "../ui";
import { fileToDataUrl } from "./state";

type StepProps = { brief: Brief; patch: (p: Partial<Brief>) => void };

const BUSINESS = [
  "Ajans hizmeti",
  "Ürün / e-ticaret",
  "Kişisel marka",
  "Yerel işletme",
  "Uygulama / SaaS",
  "Eğitim / etkinlik",
];

export function StepWhat({ brief, patch }: StepProps) {
  const preset = BUSINESS.includes(brief.businessType);
  const [other, setOther] = useState(!preset && !!brief.businessType);
  const chip = other ? "__other" : preset ? brief.businessType : "";

  return (
    <div className="space-y-8">
      <Field label="Neyi tanıtıyoruz?" hint="Ajans mı satıyoruz, bir ürün mü, kişisel marka mı? Üretilen her şey buna göre şekillenir.">
        <Chips
          label="Neyi tanıtıyoruz?"
          value={chip}
          onChange={(v) => {
            if (v === "__other") {
              setOther(true);
              patch({ businessType: "" });
            } else {
              setOther(false);
              patch({ businessType: v });
            }
          }}
          options={[...BUSINESS.map((b) => ({ value: b, label: b })), { value: "__other", label: "Başka bir şey" }]}
        />
        {other && (
          <TextInput
            autoFocus
            placeholder="Örn. mimarlık ofisi, podcast, yoga stüdyosu…"
            value={brief.businessType}
            onChange={(e) => patch({ businessType: e.target.value })}
          />
        )}
      </Field>

      <Field label="Ne üretelim?">
        <div role="radiogroup" aria-label="Ne üretelim?" className="grid gap-3 sm:grid-cols-3">
          <OptionCard
            icon={LayoutGrid}
            title="12 postluk kampanya"
            desc="Aynı görsel dünyada 12 Instagram postu (1080×1350), 3×4 akışta uyumlu."
            selected={brief.packageKind === "campaign"}
            onClick={() => patch({ packageKind: "campaign" })}
          />
          <OptionCard
            icon={Package}
            title="Tam sosyal medya paketi"
            desc="12 post + banner: üçlü Instagram sırası, platform kapağı veya ikisi."
            selected={brief.packageKind === "full"}
            onClick={() => patch({ packageKind: "full" })}
          />
          <OptionCard
            icon={PanelTop}
            title="Sadece banner"
            desc="Profil için üçlü sıra ya da LinkedIn/X/YouTube kapağı."
            selected={brief.packageKind === "banner"}
            onClick={() => patch({ packageKind: "banner" })}
          />
        </div>
      </Field>
    </div>
  );
}

const GOALS = ["Bilinirlik", "Lansman", "Satış / talep toplama", "Randevu / başvuru", "Etkileşim / topluluk"];

export function StepBrand({ brief, patch }: StepProps) {
  const personal = brief.businessType === "Kişisel marka";
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={personal ? "Hesap / marka adı" : "Marka adı"} htmlFor="brandName">
          <TextInput id="brandName" value={brief.brandName} onChange={(e) => patch({ brandName: e.target.value })} placeholder="Örn. Mavros" />
        </Field>
        {personal ? (
          <Field label="Kişinin adı soyadı" htmlFor="personName">
            <TextInput id="personName" value={brief.personName} onChange={(e) => patch({ personName: e.target.value })} />
          </Field>
        ) : (
          <Field label="Sektör" htmlFor="sector">
            <TextInput id="sector" value={brief.sector} onChange={(e) => patch({ sector: e.target.value })} placeholder="Örn. dijital pazarlama ajansı" />
          </Field>
        )}
      </div>
      {personal && (
        <Field label="Alan / sektör" htmlFor="sector">
          <TextInput id="sector" value={brief.sector} onChange={(e) => patch({ sector: e.target.value })} placeholder="Örn. fitness koçluğu" />
        </Field>
      )}
      <Field label="Ne satıyoruz / ne sunuyoruz?" htmlFor="offer" hint="Somut yaz: hizmetin ne, nasıl çalışıyor, neyi farklı yapıyor?">
        <TextArea id="offer" value={brief.offer} onChange={(e) => patch({ offer: e.target.value })} />
      </Field>
      <Field label="Hedef kitle" htmlFor="audience" hint="Kime konuşuyoruz? Yaş, meslek, ihtiyaç, nerede yaşıyor…">
        <TextArea id="audience" rows={2} value={brief.targetAudience} onChange={(e) => patch({ targetAudience: e.target.value })} />
      </Field>
      <Field label="Kampanyanın amacı">
        <Chips label="Kampanyanın amacı" value={GOALS.includes(brief.campaignGoal) ? brief.campaignGoal : ""} onChange={(v) => patch({ campaignGoal: v })} options={GOALS.map((g) => ({ value: g, label: g }))} />
        <TextInput aria-label="Amacı kendin yaz" value={brief.campaignGoal} onChange={(e) => patch({ campaignGoal: e.target.value })} placeholder="ya da kendin yaz" />
      </Field>
      <Field label="Post dili">
        <Chips label="Post dili" value={brief.language} onChange={(v) => patch({ language: v })} options={[{ value: "tr", label: "Türkçe" }, { value: "en", label: "İngilizce" }]} />
      </Field>

      <details className="group rounded-2xl border border-line bg-panel p-4 open:pb-5">
        <summary className="cursor-pointer list-none text-sm font-semibold text-muted group-open:text-ink">
          + Ses tonu, CTA, kanıtlar ve yasaklar <span className="font-normal text-faint">(isteğe bağlı)</span>
        </summary>
        <div className="mt-5 space-y-5">
          <Field label="Marka ses tonu" optional htmlFor="voice">
            <TextInput id="voice" value={brief.voice} onChange={(e) => patch({ voice: e.target.value })} placeholder="Örn. samimi ama net, esprili değil" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Çağrı (CTA)" optional htmlFor="cta">
              <TextInput id="cta" value={brief.cta} onChange={(e) => patch({ cta: e.target.value })} placeholder="Örn. Ücretsiz ön görüşme al" />
            </Field>
            <Field label="CTA adresi" optional htmlFor="ctaDest">
              <TextInput id="ctaDest" value={brief.ctaDestination} onChange={(e) => patch({ ctaDestination: e.target.value })} placeholder="Örn. mavrosai.site/iletisim" />
            </Field>
          </div>
          <Field label="Onaylı kanıtlar" optional htmlFor="proof" hint="Gerçek rakam, müşteri yorumu veya sertifika varsa kaynağıyla yaz. Boşsa postlarda kanıt iddiası kullanmayız — uydurmayız.">
            <TextArea id="proof" rows={2} value={brief.proofNotes} onChange={(e) => patch({ proofNotes: e.target.value })} />
          </Field>
          <Field label="Kullanılmayacak kelime / konular" optional htmlFor="prohibited">
            <TextInput id="prohibited" value={brief.prohibited} onChange={(e) => patch({ prohibited: e.target.value })} />
          </Field>
        </div>
      </details>
    </div>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  // Yazılırken yarım kalan hex burada bekler; geçerli olunca markaya işlenir.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-field p-1.5 pr-3 focus-within:border-accent">
        <input
          type="color"
          aria-label={`${label} rengi`}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input
          aria-label={`${label} hex kodu`}
          value={draft ?? value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(v)) {
              setDraft(null);
              onChange(v.toUpperCase());
            } else {
              setDraft(v);
            }
          }}
          onBlur={() => setDraft(null)}
          className="w-full bg-transparent font-mono text-sm uppercase outline-none"
        />
      </div>
    </Field>
  );
}

export function StepColors({ brief, patch }: StepProps) {
  const { colors, typography } = brief;
  const ratio = contrastRatio(colors.text, colors.background);
  const head = fontByName(typography.headline);
  const body = fontByName(typography.body);
  const setColor = (key: "background" | "text" | "accent") => (v: string) => patch({ colors: { ...colors, [key]: v } });

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <div className="space-y-6">
        <div role="radiogroup" aria-label="Marka renkleri" className="grid gap-3 sm:grid-cols-2">
          <OptionCard icon={Palette} title="Marka renklerim var" desc="Zemin, yazı ve vurgu rengini gir." selected={colors.status === "approved"} onClick={() => patch({ colors: { ...colors, status: "approved" } })} />
          <OptionCard icon={Sparkles} title="Renkleri sen öner" desc="Tasarım yönüyle birlikte önerilir, 'önerilen' diye işaretlenir." selected={colors.status === "proposed"} onClick={() => patch({ colors: { ...colors, status: "proposed" } })} />
        </div>

        {colors.status === "approved" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorInput label="Zemin" value={colors.background} onChange={setColor("background")} />
              <ColorInput label="Yazı" value={colors.text} onChange={setColor("text")} />
              <ColorInput label="Vurgu" value={colors.accent} onChange={setColor("accent")} />
            </div>
            <p className="flex items-center gap-2 text-sm text-muted">
              Yazı / zemin kontrastı: <span className="font-mono">{ratio.toFixed(1)}:1</span>
              <Badge tone={ratio >= 4.5 ? "ok" : ratio >= 3 ? "warn" : "bad"}>{ratio >= 4.5 ? "iyi" : ratio >= 3 ? "sınırda" : "okunmaz"}</Badge>
            </p>
          </>
        ) : (
          <Notice>Tasarım yönü adımında her yön kendi renk önerisiyle gelir. Seçtiğin yönün renkleri kullanılır ve teslimde <b>önerilen</b> olarak işaretlenir; onaylı marka rengi gibi davranmayız.</Notice>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Başlık fontu" htmlFor="headFont">
            <select id="headFont" value={typography.headline} onChange={(e) => patch({ typography: { ...typography, headline: e.target.value } })} className="h-11 w-full rounded-xl border border-line bg-field px-3 outline-none focus:border-accent">
              {FONT_OPTIONS.map((f) => <option key={f.name} value={f.name}>{f.name} · {f.kind}</option>)}
            </select>
          </Field>
          <Field label="Metin fontu" htmlFor="bodyFont">
            <select id="bodyFont" value={typography.body} onChange={(e) => patch({ typography: { ...typography, body: e.target.value } })} className="h-11 w-full rounded-xl border border-line bg-field px-3 outline-none focus:border-accent">
              {FONT_OPTIONS.map((f) => <option key={f.name} value={f.name}>{f.name} · {f.kind}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-muted">
          <input type="checkbox" checked={typography.status === "approved"} onChange={(e) => patch({ typography: { ...typography, status: e.target.checked ? "approved" : "proposed" } })} className="size-4 accent-[var(--accent)]" />
          Bunlar markamın resmi fontları (değilse öneri olarak işaretlenir)
        </label>
      </div>

      <div aria-label="Önizleme" className="mx-auto w-full max-w-[260px]">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-line p-5" style={{ background: colors.background, color: colors.text }}>
          <div className="h-1 w-8 rounded-full" style={{ background: colors.accent }} />
          <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.3em] opacity-80" style={{ fontFamily: body.family }}>{brief.sector || "Sektör"}</p>
          <p className="mt-3 text-[30px] leading-[0.96] tracking-tight" style={{ fontFamily: head.family, fontWeight: head.weight }}>
            {brief.brandName || "Marka"}<br /><span style={{ color: colors.accent }}>tek dünya.</span>
          </p>
          <p className="mt-3 text-[11px] leading-snug opacity-80" style={{ fontFamily: body.family }}>Renkler ve fontlar postlara böyle basılır.</p>
          <span className="absolute right-3 top-3 text-[9px] tracking-[0.3em] opacity-50">01</span>
        </div>
        {colors.status === "proposed" && <p className="mt-2 text-center text-xs text-faint">Renkler yön seçilince güncellenir.</p>}
      </div>
    </div>
  );
}

const ROLE_OPTIONS: { value: RefRole; label: string }[] = [
  { value: "visual_reference", label: "Görsel ilham" },
  { value: "brand_reference", label: "Marka referansı" },
  { value: "logo_asset", label: "Logo" },
  { value: "proof_asset", label: "Kanıt" },
];

const LOGO_ANCHORS: { value: LogoAnchor; label: string }[] = [
  { value: "bottom-left", label: "Sol alt" },
  { value: "bottom-right", label: "Sağ alt" },
  { value: "top-left", label: "Sol üst" },
  { value: "top-right", label: "Sağ üst" },
];

export function StepRefs({ brief, patch }: StepProps) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = brief.references;
  const hasLogo = refs.some((r) => r.role === "logo_asset");

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    const room = 6 - refs.length;
    const picked = Array.from(files).filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type)).slice(0, room);
    if (files.length > room) setError("En fazla 6 görsel ekleyebilirsin.");
    const added: ReferenceImage[] = [];
    for (const file of picked) {
      try {
        const isLogo = /logo/i.test(file.name);
        let dataUrl = await fileToDataUrl(file, isLogo ? 600 : 1024, file.type !== "image/jpeg");
        if (dataUrl.length > 1_400_000) dataUrl = await fileToDataUrl(file, 1024, false);
        added.push({ id: crypto.randomUUID(), name: file.name, role: isLogo ? "logo_asset" : "visual_reference", dataUrl });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Görsel okunamadı.");
      }
    }
    const next = [...refs, ...added];
    patch({ references: next, logo: { ...brief.logo, enabled: brief.logo.enabled || added.some((r) => r.role === "logo_asset") } });
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  const update = (id: string, role: RefRole) => patch({ references: refs.map((r) => (r.id === id ? { ...r, role } : r)) });
  const remove = (id: string) => patch({ references: refs.filter((r) => r.id !== id) });

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files); }}
        disabled={busy || refs.length >= 6}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong bg-panel px-6 py-10 text-center transition hover:border-accent disabled:opacity-50"
      >
        {busy ? <Upload className="size-6 animate-pulse text-accent" aria-hidden /> : <ImagePlus className="size-6 text-accent" aria-hidden />}
        <span className="font-semibold">Görsel ekle ya da sürükle bırak</span>
        <span className="text-sm text-muted">Logo, marka görselleri, beğendiğin post örnekleri · PNG/JPG/WebP · en fazla 6</span>
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => void add(e.target.files)} />
      {error && <Notice tone="warn">{error}</Notice>}

      {refs.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {refs.map((r) => (
            <li key={r.id} className="flex gap-3 rounded-2xl border border-line bg-panel p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- yerel data URL önizlemesi */}
              <img src={r.dataUrl} alt="" className={cx("size-20 shrink-0 rounded-lg object-cover", r.role === "logo_asset" && "bg-panel-2 object-contain p-1")} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <select aria-label={`${r.name} rolü`} value={r.role} onChange={(e) => update(r.id, e.target.value as RefRole)} className="h-9 w-full rounded-lg border border-line bg-field px-2 text-sm outline-none focus:border-accent">
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => remove(r.id)} aria-label={`${r.name} sil`} className="self-start rounded-lg p-1.5 text-faint hover:bg-panel-2 hover:text-bad">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Notice>Referans yoksa sorun değil: bir sonraki adımda markana uygun <b>3 farklı tasarım yönü</b> önereceğiz, sen seçeceksin.</Notice>
      )}

      <dl className="grid gap-x-6 gap-y-2 text-xs text-faint sm:grid-cols-2">
        <div><dt className="inline font-semibold text-muted">Marka referansı: </dt><dd className="inline">mevcut postların, marka kitabın — kimliği belirler.</dd></div>
        <div><dt className="inline font-semibold text-muted">Görsel ilham: </dt><dd className="inline">yalnız atmosfer/kompozisyon; rengi veya logoyu buradan almayız.</dd></div>
        <div><dt className="inline font-semibold text-muted">Logo: </dt><dd className="inline">aynen basılır, yapay zekâ yeniden çizmez.</dd></div>
        <div><dt className="inline font-semibold text-muted">Kanıt: </dt><dd className="inline">bir iddiayı destekleyen belge (yorum, rapor).</dd></div>
      </dl>

      {hasLogo && (
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-4">
          <label className="flex items-center gap-2.5 text-sm font-medium">
            <input type="checkbox" checked={brief.logo.enabled} onChange={(e) => patch({ logo: { ...brief.logo, enabled: e.target.checked } })} className="size-4 accent-[var(--accent)]" />
            Logoyu postlara ekle
          </label>
          {brief.logo.enabled && (
            <Chips label="Logo konumu" value={brief.logo.anchor} onChange={(v) => patch({ logo: { ...brief.logo, anchor: v } })} options={LOGO_ANCHORS} />
          )}
        </div>
      )}
    </div>
  );
}

const PLATFORMS = Object.entries(COVER_SIZES).map(([value, s]) => ({ value: value as CoverPlatform, label: `${s.label} · ${s.width}×${s.height}` }));

export function StepBanner({ brief, patch }: StepProps) {
  const set = (kind: BannerKind) => patch({ banner: { ...brief.banner, kind } });
  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="Banner türü" className="grid gap-3 sm:grid-cols-3">
        <OptionCard icon={Columns3} title="Üçlü Instagram sırası" desc="Profilde yan yana duran 3 post, tek bir panorama oluşturur." selected={brief.banner.kind === "instagram-triple"} onClick={() => set("instagram-triple")} />
        <OptionCard icon={PanelTop} title="Platform kapağı" desc="LinkedIn, X, YouTube veya Facebook başlık görseli." selected={brief.banner.kind === "platform-cover"} onClick={() => set("platform-cover")} />
        <OptionCard icon={Package} title="İkisi de" desc="Hem üçlü sıra hem platform kapağı." selected={brief.banner.kind === "both"} onClick={() => set("both")} />
      </div>
      {brief.banner.kind !== "instagram-triple" && (
        <Field label="Kapak hangi platform için?">
          <Chips label="Platform" value={brief.banner.platform} onChange={(v) => patch({ banner: { ...brief.banner, platform: v } })} options={PLATFORMS} />
        </Field>
      )}
    </div>
  );
}

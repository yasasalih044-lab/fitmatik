"use client";

import { RefreshCw } from "lucide-react";
import { COVER_SIZES, PROOF_REQUIRED, wantsCover, wantsTriple } from "@/lib/jett";
import type { BannerCopy, Brief, CampaignPlan, ClaimType, Direction, Post } from "@/lib/types";
import { Badge, Button, Field, Notice, OptionCard, TextArea, TextInput, cx } from "../ui";

function Loading({ text }: { text: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-64 animate-pulse rounded-2xl border border-line bg-panel" />
      ))}
      <p className="text-sm text-muted sm:col-span-3">{text}</p>
    </div>
  );
}

export function StepDirection({ brief, directions, selected, busy, error, onReload, onSelect }: {
  brief: Brief;
  directions: Direction[];
  selected: Direction | null;
  busy: boolean;
  error: string;
  onReload: () => void;
  onSelect: (d: Direction) => void;
}) {
  const hasRefs = brief.references.some((r) => r.role === "brand_reference" || r.role === "visual_reference");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {hasRefs
            ? "Referanslarından ve brifinden yola çıkarak 3 farklı görsel dünya çıkardık."
            : "Referans yüklemedin; konuna özel 3 farklı tasarım yönü önerdik."}
        </p>
        <Button variant="outline" onClick={onReload} busy={busy}>
          <RefreshCw className="size-4" aria-hidden /> {directions.length ? "Yeniden öner" : "Yönleri öner"}
        </Button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {busy && !directions.length && <Loading text="Sanat yönetmeni çalışıyor… (20–60 sn)" />}

      <div role="radiogroup" aria-label="Tasarım yönleri" className={cx("grid gap-4 lg:grid-cols-3", busy && "opacity-60")}>
        {directions.map((d) => (
          <OptionCard key={d.id + d.name} title={d.name} selected={selected?.id === d.id && selected.name === d.name} onClick={() => onSelect(d)}>
            <p className="text-sm leading-relaxed text-muted">{d.centralIdea}</p>
            <div className="flex gap-1.5 pt-1">
              {d.palette.map((c) => (
                <span key={c.hex + c.role} title={`${c.role}: ${c.reason}`} className="h-7 flex-1 rounded-md border border-white/10" style={{ background: c.hex }} />
              ))}
            </div>
            <ul className="space-y-1 pt-1 text-xs text-muted">
              {d.sceneVocabulary.slice(0, 4).map((s) => <li key={s}>· {s}</li>)}
            </ul>
            <p className="pt-1 text-xs text-faint"><b className="text-muted">Işık:</b> {d.lighting}</p>
            {d.avoid.length > 0 && <p className="text-xs text-faint"><b className="text-muted">Kaçınılacak:</b> {d.avoid.join(", ")}</p>}
            <p className="text-xs text-faint"><b className="text-muted">Yazı:</b> {d.typographyNote}</p>
          </OptionCard>
        ))}
      </div>
      {selected && brief.colors.status === "proposed" && (
        <Notice>Bu yönün renkleri markaya uygulandı ve <b>önerilen</b> olarak işaretlendi: zemin {brief.colors.background}, yazı {brief.colors.text}, vurgu {brief.colors.accent}.</Notice>
      )}
    </div>
  );
}

const ROLE_TR: Record<string, string> = {
  problem: "sorun", aspiration: "hedef", education: "bilgi", process: "süreç", authority: "uzmanlık",
  differentiation: "fark", proof: "kanıt", faq: "SSS", cta: "çağrı",
};

const CLAIM_OPTIONS: { value: ClaimType; label: string }[] = [
  { value: "none", label: "İddia yok" },
  { value: "narrative", label: "Anlatı" },
  { value: "process", label: "Süreç" },
  { value: "proof", label: "Kanıt (kaynak şart)" },
  { value: "result", label: "Sonuç (kaynak şart)" },
  { value: "guarantee", label: "Garanti (kaynak şart)" },
];

type CopyLike = Pick<Post, "eyebrow" | "headlineLines" | "accentLine" | "subtext" | "backgroundPrompt">;

function CopyEditor<T extends CopyLike>({ value, onChange, idPrefix }: { value: T; onChange: (v: T) => void; idPrefix: string }) {
  const lines = value.headlineLines;
  return (
    <div className="space-y-3">
      <Field label="Üst etiket" htmlFor={`${idPrefix}-eyebrow`}>
        <TextInput id={`${idPrefix}-eyebrow`} value={value.eyebrow} onChange={(e) => onChange({ ...value, eyebrow: e.target.value })} />
      </Field>
      <Field label="Başlık (her satır ayrı, en fazla 3)" htmlFor={`${idPrefix}-headline`}>
        <TextArea
          id={`${idPrefix}-headline`}
          rows={3}
          value={lines.join("\n")}
          onChange={(e) => {
            const next = e.target.value.split("\n").slice(0, 3);
            onChange({ ...value, headlineLines: next, accentLine: value.accentLine < next.length ? value.accentLine : -1 });
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Vurgu rengi:
        {[-1, ...lines.map((_, i) => i)].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange({ ...value, accentLine: i })}
            className={cx("rounded-full border px-2.5 py-1", value.accentLine === i ? "border-accent text-accent-strong" : "border-line")}
          >
            {i === -1 ? "yok" : `${i + 1}. satır`}
          </button>
        ))}
      </div>
      <Field label="Alt metin" htmlFor={`${idPrefix}-sub`}>
        <TextArea id={`${idPrefix}-sub`} rows={2} value={value.subtext} onChange={(e) => onChange({ ...value, subtext: e.target.value })} />
      </Field>
      <details>
        <summary className="cursor-pointer text-xs text-faint hover:text-muted">Görsel tarifi (İngilizce, yazısız arka plan için)</summary>
        <TextArea aria-label="Görsel tarifi" className="mt-2 text-sm" rows={4} value={value.backgroundPrompt} onChange={(e) => onChange({ ...value, backgroundPrompt: e.target.value })} />
      </details>
    </div>
  );
}

export function StepPlan({ brief, plan, issues, busy, error, onRegenerate, onChange }: {
  brief: Brief;
  plan: CampaignPlan | null;
  issues: string[];
  busy: boolean;
  error: string;
  onRegenerate: () => void;
  onChange: (plan: CampaignPlan) => void;
}) {
  if (!plan) {
    return (
      <div className="space-y-4">
        {error && <Notice tone="bad">{error}</Notice>}
        {busy ? <Loading text="12 postun metinleri ve görsel tarifleri yazılıyor… (30–90 sn)" /> : <Button onClick={onRegenerate}>Planı oluştur</Button>}
      </div>
    );
  }

  const setPost = (i: number, post: Post) => onChange({ ...plan, posts: plan.posts.map((p, j) => (j === i ? post : p)) });
  const setBanner = (key: "triple" | "cover", copy: BannerCopy) => onChange({ ...plan, banner: { ...plan.banner, [key]: copy } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">{plan.directionBrief}</p>
        <Button variant="outline" onClick={onRegenerate} busy={busy}>
          <RefreshCw className="size-4" aria-hidden /> Yeniden planla
        </Button>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {issues.length > 0 && (
        <Notice tone="warn">
          <b>Üretimden önce düzeltilmesi gerekenler:</b>
          <ul className="mt-1 list-inside list-disc">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </Notice>
      )}

      {plan.posts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plan.posts.map((post, i) => (
            <article key={post.index} className="space-y-3 rounded-2xl border border-line bg-panel p-4">
              <header className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-bold">{String(post.index).padStart(2, "0")}</span>
                <span className="flex gap-1.5">
                  <Badge tone="accent">{ROLE_TR[post.role] ?? post.role}</Badge>
                  <Badge>{post.anchor}</Badge>
                </span>
              </header>
              <CopyEditor idPrefix={`p${post.index}`} value={post} onChange={(p) => setPost(i, p)} />
              <div className="grid gap-2">
                <select
                  aria-label="İddia türü"
                  value={post.claimType}
                  onChange={(e) => setPost(i, { ...post, claimType: e.target.value as ClaimType })}
                  className="h-9 rounded-lg border border-line bg-field px-2 text-sm outline-none focus:border-accent"
                >
                  {CLAIM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {(PROOF_REQUIRED.includes(post.claimType) || post.proofSource) && (
                  <TextInput aria-label="Kanıt kaynağı" placeholder="Kanıtın tam kaynağı" value={post.proofSource} onChange={(e) => setPost(i, { ...post, proofSource: e.target.value })} />
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {(wantsTriple(brief) || wantsCover(brief)) && (
        <div className="grid gap-4 md:grid-cols-2">
          {wantsTriple(brief) && plan.banner.triple && (
            <article className="space-y-3 rounded-2xl border border-line bg-panel p-4">
              <h3 className="font-display font-bold">Üçlü Instagram sırası</h3>
              <CopyEditor idPrefix="triple" value={plan.banner.triple} onChange={(c) => setBanner("triple", c)} />
            </article>
          )}
          {wantsCover(brief) && plan.banner.cover && (
            <article className="space-y-3 rounded-2xl border border-line bg-panel p-4">
              <h3 className="font-display font-bold">{COVER_SIZES[brief.banner.platform].label} kapağı</h3>
              <CopyEditor idPrefix="cover" value={plan.banner.cover} onChange={(c) => setBanner("cover", c)} />
            </article>
          )}
        </div>
      )}
    </div>
  );
}

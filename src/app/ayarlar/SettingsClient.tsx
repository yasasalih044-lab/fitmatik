"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forgetTheme, previewTheme, rememberTheme, THEMES, type ThemeId } from "@/lib/theme";
import type { PublicAccount } from "@/lib/accounts";
import { GOALS, type Goal, type TrainingMode } from "@/lib/goals";
import { GoalRuler } from "@/components/ui/goal-ruler";
import { IntelligenceBar } from "@/components/ui/intelligence-bar";

const GOAL_KEY = "fitmatik.goal.v1";
const GOAL_MODE_KEY = "fitmatik.goal-mode.v1";
const RESEARCH_KEY = "fitmatik.research-depth.v1";

function readGoal(): Goal {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    return GOALS.some((g) => g.id === raw) ? (raw as Goal) : "koru_kas";
  } catch {
    return "koru_kas";
  }
}

function readMode(): TrainingMode {
  try {
    const raw = localStorage.getItem(GOAL_MODE_KEY);
    return raw === "bulk" || raw === "definasyon" ? raw : null;
  } catch {
    return null;
  }
}

function readResearchLevel(): 0 | 1 | 2 {
  try {
    const raw = Number(localStorage.getItem(RESEARCH_KEY));
    return raw === 0 || raw === 1 || raw === 2 ? raw : 1;
  } catch {
    return 1;
  }
}

type Draft = { name: string; age: string; heightCm: string; weightKg: string; gender: string };
type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
type Wallet = {
  available_fitcoin: number;
  reserved_fitcoin: number;
  lifetime_spent_fitcoin: number;
};
type LedgerItem = {
  id: string;
  kind: "initial_grant" | "reservation" | "settlement" | "release" | "adjustment";
  available_delta_fitcoin: number;
  reserved_delta_fitcoin: number;
  created_at: string;
};

const GENDERS = [
  { id: "kadin", label: "Kadın" },
  { id: "erkek", label: "Erkek" },
  { id: "belirtmek-istemiyorum", label: "Belirtmek istemiyorum" },
] as const;

const THEME_DESCRIPTIONS: Record<ThemeId, string> = {
  siyah: "Neon yeşil",
  kirmizi: "Açık turuncu",
  mor: "Neon pembe",
  pembe: "Beyaz ve mor",
};

const fitcoin = (value: number) => value.toLocaleString("tr-TR");
const ledgerLabel: Record<LedgerItem["kind"], string> = {
  initial_grant: "Başlangıç bakiyesi",
  reservation: "Analiz için ayrıldı",
  settlement: "Analiz harcaması",
  release: "Rezervasyon iadesi",
  adjustment: "Bakiye düzeltmesi",
};

function ledgerChange(item: LedgerItem): number {
  return item.available_delta_fitcoin + item.reserved_delta_fitcoin;
}

function Field({
  label, value, onChange, suffix, inputMode = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  suffix?: string; inputMode?: "text" | "numeric" | "decimal";
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-1.5 flex items-center gap-2">
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-[16px]"
        />
        {suffix && <span className="mono shrink-0 text-[12px] text-[var(--faint)]">{suffix}</span>}
      </span>
    </label>
  );
}

export default function SettingsClient() {
  const router = useRouter();
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [theme, setTheme] = useState<ThemeId | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [walletError, setWalletError] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // draft/targets/theme henüz gelmediyse alt bileşenler zaten "Yükleniyor…" ile
  // gizleniyor, o yüzden localStorage'ı doğrudan ilk render'da okumak SSR/hydrate
  // uyumsuzluğu yaratmıyor.
  const [goal, setGoal] = useState<Goal>(() => (typeof window === "undefined" ? "koru_kas" : readGoal()));
  const [trainingMode, setTrainingMode] = useState<TrainingMode>(() => (typeof window === "undefined" ? null : readMode()));
  const [researchLevel, setResearchLevel] = useState<0 | 1 | 2>(() => (typeof window === "undefined" ? 1 : readResearchLevel()));
  // Kullanıcı temaya dokunduysa geç düşen yükleme cevabı seçimini ezmesin.
  const touchedTheme = useRef(false);
  // Bir seçim yalnızca Kaydet başarılı olduğunda hesap ayarı olur. Sayfadan
  // ayrılırken kaydedilmemiş önizlemeyi eski, sunucu tarafındaki temaya çevir.
  const savedTheme = useRef<ThemeId | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/me", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Oturum yok."))))
      .then(({ account }: { account: PublicAccount }) => {
        setAccount(account);
        setDraft({
          name: account.profile.name,
          age: String(account.profile.age),
          heightCm: String(account.profile.heightCm),
          weightKg: String(account.profile.weightKg),
          gender: account.profile.gender,
        });
        setTargets(account.targets);
        if (!touchedTheme.current) {
          setTheme(account.theme);
          savedTheme.current = account.theme;
          rememberTheme(account.theme, account.updated_at, account.id);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        router.replace("/login");
      });
    return () => ctrl.abort();
  }, [router]);

  useEffect(() => {
    return () => {
      if (touchedTheme.current && savedTheme.current) previewTheme(savedTheme.current);
    };
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/fitcoin?limit=8", { cache: "no-store", signal: ctrl.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Fitcoin okunamadı."))))
      .then(({ wallet: nextWallet, ledger: nextLedger }: { wallet: Wallet; ledger: LedgerItem[] }) => {
        setWallet(nextWallet);
        setLedger(nextLedger);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setWalletError("Fitcoin bakiyesi şu an okunamıyor.");
      });
    return () => ctrl.abort();
  }, []);

  function updateGoal(next: Goal) {
    setGoal(next);
    try {
      localStorage.setItem(GOAL_KEY, next);
    } catch {
      /* özel sekmede hatırlanmaz */
    }
  }

  function updateMode(next: TrainingMode) {
    setTrainingMode(next);
    try {
      if (next) localStorage.setItem(GOAL_MODE_KEY, next);
      else localStorage.removeItem(GOAL_MODE_KEY);
    } catch {
      /* özel sekmede hatırlanmaz */
    }
  }

  function updateResearchLevel(next: 0 | 1 | 2) {
    setResearchLevel(next);
    try {
      localStorage.setItem(RESEARCH_KEY, String(next));
    } catch {
      /* özel sekmede hatırlanmaz */
    }
  }

  function applyTheme(id: ThemeId) {
    touchedTheme.current = true;
    setTheme(id);
    previewTheme(id);
  }

  async function save(retarget = false) {
    if (!draft || !targets || !theme) return;
    setSaving(true);
    setStatus(null);

    const res = await fetch("/api/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: {
          name: draft.name,
          age: Number(draft.age),
          heightCm: Number(draft.heightCm),
          weightKg: Number(draft.weightKg.replace(",", ".")),
          gender: draft.gender,
        },
        theme,
        targets: retarget ? undefined : targets,
        retarget,
        goal,
        trainingMode,
      }),
    }).catch(() => null);

    setSaving(false);
    if (!res?.ok) {
      const msg = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : null;
      setStatus({ kind: "err", text: msg || "Kaydedilemedi." });
      return;
    }
    const { account } = (await res.json()) as { account: PublicAccount };
    setAccount(account);
    setTargets(account.targets);
    savedTheme.current = account.theme;
    touchedTheme.current = false;
    // Sunucunun taze damgasını işaretle: bir sonraki eşitleme bunu eskitemez.
    rememberTheme(account.theme, account.updated_at, account.id);
    setStatus({ kind: "ok", text: retarget ? "Hedefler yeniden hesaplandı." : "Kaydedildi." });
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    // Unmount temizliği, çıkıştaki varsayılan temayı eski önizlemeyle ezmesin.
    touchedTheme.current = false;
    forgetTheme();
    router.replace("/login");
  }

  if (!draft || !targets || !theme) {
    return <p className="mono pt-8 text-center text-[13px] text-[var(--faint)]">Yükleniyor…</p>;
  }

  return (
    <div className="space-y-5 pb-12">
      {/* --- Kimlik --- */}
      <section className="card space-y-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Hesap</p>
          <p className="mono text-[11px] text-[var(--faint)]">{account?.phone}</p>
        </div>

        <Field label="İsim" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Yaş" value={draft.age} inputMode="numeric" onChange={(v) => setDraft({ ...draft, age: v })} />
          <Field label="Boy" suffix="cm" value={draft.heightCm} inputMode="numeric" onChange={(v) => setDraft({ ...draft, heightCm: v })} />
          <Field label="Kilo" suffix="kg" value={draft.weightKg} inputMode="decimal" onChange={(v) => setDraft({ ...draft, weightKg: v })} />
        </div>

        <div>
          <span className="eyebrow">Cinsiyet</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <button
                key={g.id}
                onClick={() => setDraft({ ...draft, gender: g.id })}
                className={`btn px-3 py-2 text-[13px] ${
                  draft.gender === g.id
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "btn-ghost text-[var(--muted)]"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* --- Fitcoin --- */}
      <section className="card space-y-4 p-4" aria-labelledby="fitcoin-title">
        <div className="space-y-1">
          <p id="fitcoin-title" className="eyebrow">Fitcoin</p>
          <p className="text-[13px] leading-snug text-[var(--muted)]">
            10.000 Fitcoin = $1. Satın alma henüz açık değil; bakiye ve harcamaların burada görünür.
          </p>
        </div>

        {wallet ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-[var(--rule)] bg-[var(--accent-wash)] p-3">
                <p className="eyebrow">Kullanılabilir</p>
                <p className="figure mt-1 text-[30px] leading-none text-[var(--accent-ink)]">{fitcoin(wallet.available_fitcoin)} FC</p>
              </div>
              <div className="rounded-md border border-[var(--rule)] p-3">
                <p className="eyebrow">Toplam harcama</p>
                <p className="figure mt-1 text-[30px] leading-none">{fitcoin(wallet.lifetime_spent_fitcoin)} FC</p>
              </div>
            </div>
            {wallet.reserved_fitcoin > 0 && (
              <p className="rounded-md border border-[var(--accent-border)] bg-[var(--accent-wash)] px-3 py-2 text-[12px] text-[var(--muted)]">
                {fitcoin(wallet.reserved_fitcoin)} FC devam eden analiz için ayrıldı.
              </p>
            )}
            {ledger.length > 0 && (
              <div className="space-y-2 border-t border-[var(--rule)] pt-3">
                <p className="eyebrow">Son hareketler</p>
                <ol className="space-y-2">
                  {ledger.slice(0, 5).map((item) => {
                    const change = ledgerChange(item);
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="min-w-0 truncate text-[var(--muted)]">{ledgerLabel[item.kind]}</span>
                        <span className={change < 0 ? "mono shrink-0 text-[var(--red-ink)]" : "mono shrink-0 text-[var(--accent-ink)]"}>
                          {change > 0 ? "+" : ""}{fitcoin(change)} FC
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </>
        ) : (
          <p className="mono text-[12px] text-[var(--faint)]">{walletError || "Fitcoin bakiyesi yükleniyor…"}</p>
        )}
      </section>

      {/* --- Tema --- */}
      <section className="card space-y-3 p-4">
        <div className="space-y-1">
          <p className="eyebrow">Tema</p>
          <p className="text-[13px] leading-snug text-[var(--muted)]">Seçimini önizle; Kaydet&apos;e bastığında tüm cihazlarında kalır.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              aria-pressed={theme === t.id}
              data-theme-option={t.id}
              data-selected={theme === t.id}
              className="theme-option"
            >
              <span className="theme-option__swatch" aria-hidden="true" />
              <span className="theme-option__copy">
                <strong>{t.label}</strong>
                <small>{THEME_DESCRIPTIONS[t.id]}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* --- Hedef --- */}
      <section className="card space-y-3 p-4">
        <div className="space-y-1">
          <p className="eyebrow">Hedefiniz nedir?</p>
          <p className="text-[13px] leading-snug text-[var(--muted)]">Hesap kurarken de sorduk; burada değiştirebilirsin.</p>
        </div>
        <GoalRuler value={goal} onChange={updateGoal} mode={trainingMode} onModeChange={updateMode} />
      </section>

      {/* --- Zeka --- */}
      <section className="card space-y-3 p-4">
        <div className="space-y-1">
          <p className="eyebrow">Zeka</p>
          <p className="text-[13px] leading-snug text-[var(--muted)]">
            Ne kadar sıkı araştırma yapılacağını belirler. Şimdilik yalnızca görünüm — analize henüz bağlı değil.
          </p>
        </div>
        <IntelligenceBar level={researchLevel} onChange={updateResearchLevel} />
      </section>

      {/* --- Hedefler --- */}
      <section className="card space-y-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Günlük hedef</p>
          <button onClick={() => save(true)} disabled={saving} className="btn btn-quiet text-[11px]">
            Hedefe göre hesapla
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([
            ["kcal", "Kalori", "kcal"],
            ["protein_g", "Protein", "g"],
            ["carbs_g", "Karbonhidrat", "g"],
            ["fat_g", "Yağ", "g"],
          ] as const).map(([key, label, unit]) => (
            <Field
              key={key}
              label={label}
              suffix={unit}
              inputMode="numeric"
              value={String(targets[key])}
              onChange={(v) => setTargets({ ...targets, [key]: Number(v.replace(/\D/g, "")) || 0 })}
            />
          ))}
        </div>
      </section>

      {status && (
        <p
          className={`rounded-md border px-3 py-2 text-[13px] ${
            status.kind === "ok"
              ? "border-[var(--rule)] text-[var(--muted)]"
              : "border-[var(--red)]/40 text-[var(--red-ink)]"
          }`}
        >
          {status.text}
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={() => save(false)} disabled={saving} className="btn btn-primary flex-1">
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button onClick={signOut} className="btn btn-ghost px-4 text-[13px]">
          Çıkış
        </button>
      </div>
    </div>
  );
}

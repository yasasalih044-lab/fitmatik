"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { THEMES, type ThemeId, THEME_KEY } from "@/lib/theme";
import type { PublicAccount } from "@/lib/accounts";

type Draft = { name: string; age: string; heightCm: string; weightKg: string; gender: string };
type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

const GENDERS = [
  { id: "kadin", label: "Kadın" },
  { id: "erkek", label: "Erkek" },
  { id: "belirtmek-istemiyorum", label: "Belirtmek istemiyorum" },
] as const;

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
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
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
        setTheme(account.theme);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  function applyTheme(id: ThemeId) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* özel sekmede hatırlanmaz */
    }
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
    setStatus({ kind: "ok", text: retarget ? "Hedefler yeniden hesaplandı." : "Kaydedildi." });
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
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

      {/* --- Tema --- */}
      <section className="card space-y-3 p-4">
        <p className="eyebrow">Tema</p>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTheme(t.id)}
              aria-pressed={theme === t.id}
              className={`overflow-hidden rounded-md border text-left transition-transform ${
                theme === t.id ? "border-[var(--red)]" : "border-[var(--rule)] hover:scale-[1.02]"
              }`}
            >
              <span
                className="block h-16 w-full bg-cover bg-center"
                style={{ backgroundImage: `url(/auth/backgrounds/${t.id}-mobile.png)` }}
              />
              <span className="mono block px-2 py-1.5 text-[11px] text-[var(--muted)]">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* --- Hedefler --- */}
      <section className="card space-y-4 p-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Günlük hedef</p>
          <button onClick={() => save(true)} disabled={saving} className="btn btn-quiet text-[11px]">
            Boy/kiloya göre hesapla
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

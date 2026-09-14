"use client";

import { useState } from "react";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Eye, EyeOff, LockKeyhole, Smartphone, UserRound } from "lucide-react";
import TopoField from "@/components/ui/topo-field";
import { ShiningText } from "@/components/ui/shining-text";
import { GoalRuler } from "@/components/ui/goal-ruler";
import type { Goal, TrainingMode } from "@/lib/goals";

type AuthMode = "giris" | "kayit";
type SignupStep = "credentials" | "profile" | "goal";
type Gender = "kadin" | "erkek" | "belirtmek-istemiyorum" | "";

type Credentials = { phone: string; password: string };
type Profile = { name: string; age: string; heightCm: string; weightKg: string; gender: Gender };

const EMPTY_CREDENTIALS: Credentials = { phone: "", password: "" };
const EMPTY_PROFILE: Profile = { name: "", age: "", heightCm: "", weightKg: "", gender: "" };

function cleanPhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
}

/** Telefonu API'ye gitmeden önce tek bir E.164 biçimine yaklaştırır. */
function normalizePhone(phone: string): string | null {
  const raw = cleanPhone(phone);
  if (!raw) return null;

  let digits = raw.startsWith("+") ? raw.slice(1) : raw;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;

  if (!/^\d{10,15}$/.test(digits)) return null;
  if (digits.startsWith("90") && digits.length !== 12) return null;
  return `+${digits}`;
}

function hasValidPassword(password: string) {
  return /^[A-Za-z0-9]{8,128}$/.test(password);
}

function hasCompleteProfile(profile: Profile) {
  const age = Number(profile.age);
  const heightCm = Number(profile.heightCm);
  const weightKg = Number(profile.weightKg);
  return (
    profile.name.trim().length >= 2 &&
    Number.isFinite(age) &&
    age >= 10 &&
    age <= 100 &&
    Number.isFinite(heightCm) &&
    heightCm >= 100 &&
    heightCm <= 250 &&
    Number.isFinite(weightKg) &&
    weightKg >= 25 &&
    weightKg <= 350 &&
    Boolean(profile.gender)
  );
}

function safePath(value: unknown, fallback: string) {
  return typeof value === "string" && /^\/(?!\/)/.test(value) ? value : fallback;
}

async function responseBody(response: Response): Promise<{ error?: string; next?: string }> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { error?: string; next?: string };
  } catch {
    return {};
  }
}

function apiError(response: Response, body: { error?: string }) {
  if (response.status === 404) return "Giriş bağlantısı hazırlanıyor. Lütfen kısa süre sonra tekrar dene.";
  return body.error || "İşlem tamamlanamadı. Lütfen tekrar dene.";
}

export default function AuthExperience() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("giris");
  const [step, setStep] = useState<SignupStep>("credentials");
  const [credentials, setCredentials] = useState<Credentials>(EMPTY_CREDENTIALS);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [goal, setGoal] = useState<Goal>("koru_kas");
  const [trainingMode, setTrainingMode] = useState<TrainingMode>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function updateCredentials(key: keyof Credentials, value: string) {
    setCredentials((current) => ({ ...current, [key]: key === "phone" ? cleanPhone(value) : value }));
  }

  function updateProfile(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function goToCredentials() {
    setError("");
    setStep("credentials");
  }

  function goToProfile() {
    setError("");
    setStep("profile");
  }

  function continueToProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!normalizePhone(credentials.phone)) {
      setError("Geçerli bir telefon numarası yaz.");
      return;
    }
    if (!hasValidPassword(credentials.password)) {
      setError("Şifren 8–128 karakter arasında olmalı ve yalnızca harf veya rakam içermeli.");
      return;
    }
    setStep("profile");
  }

  function continueToGoal() {
    setError("");
    if (!hasCompleteProfile(profile)) {
      setError("Devam etmek için tüm bilgileri geçerli biçimde doldur.");
      return;
    }
    setStep("goal");
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const phone = normalizePhone(credentials.phone);
    if (!phone || !hasValidPassword(credentials.password)) {
      setError("Telefon numaranı ve 8–128 karakterlik harf-rakam şifreni yaz.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password: credentials.password }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(apiError(response, body));
      router.replace(safePath(body.next, "/upload"));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Giriş yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile() {
    setError("");
    if (!hasCompleteProfile(profile)) {
      setError("Devam etmek için tüm bilgileri geçerli biçimde doldur.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: normalizePhone(credentials.phone),
          password: credentials.password,
          profile: toProfilePayload(profile),
          goal,
          trainingMode,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(apiError(response, body));
      router.replace(safePath(body.next, "/upload"));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hesap oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setStep("credentials");
  }

  return (
    <main className="auth-page">
      <TopoField className="topo-field" />
      <div className="auth-page__content">
        <header className="auth-page__header">
          <Link href="/" className="auth-logo" aria-label="Fit-matik ana sayfa" />
        </header>

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-mode-switch" role="tablist" aria-label="Giriş türü">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "giris"}
              className={mode === "giris" ? "is-active" : ""}
              onClick={() => switchMode("giris")}
            >
              Giriş yap
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "kayit"}
              className={mode === "kayit" ? "is-active" : ""}
              onClick={() => switchMode("kayit")}
            >
              Hesap oluştur
            </button>
          </div>

          {mode === "giris" ? (
            <SignIn
              credentials={credentials}
              showPassword={showPassword}
              busy={busy}
              error={error}
              onCredentialsChange={updateCredentials}
              onShowPassword={() => setShowPassword((visible) => !visible)}
              onSubmit={signIn}
            />
          ) : (
            <SignUp
              step={step}
              credentials={credentials}
              profile={profile}
              goal={goal}
              trainingMode={trainingMode}
              showPassword={showPassword}
              busy={busy}
              error={error}
              onCredentialsChange={updateCredentials}
              onProfileChange={updateProfile}
              onGoalChange={setGoal}
              onModeChange={setTrainingMode}
              onShowPassword={() => setShowPassword((visible) => !visible)}
              onBackToCredentials={goToCredentials}
              onBackToProfile={goToProfile}
              onCredentialsNext={continueToProfile}
              onProfileNext={continueToGoal}
              onSubmit={submitProfile}
            />
          )}
        </section>

        <p className="auth-page__privacy">Bilgilerin güvenle işlenir; şifren cihazında saklanmaz.</p>
      </div>
    </main>
  );
}

function SignIn({
  credentials,
  showPassword,
  busy,
  error,
  onCredentialsChange,
  onShowPassword,
  onSubmit,
}: {
  credentials: Credentials;
  showPassword: boolean;
  busy: boolean;
  error: string;
  onCredentialsChange: (key: keyof Credentials, value: string) => void;
  onShowPassword: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="auth-flow">
      <div className="auth-intro">
        <h1 id="auth-title">Günlüğüne gir.</h1>
        <p>Telefon numaran ve şifrenle devam et.</p>
      </div>

      <form className="auth-form" noValidate onSubmit={onSubmit}>
        <CredentialsFields
          credentials={credentials}
          showPassword={showPassword}
          onChange={onCredentialsChange}
          onTogglePassword={onShowPassword}
          passwordAutoComplete="current-password"
        />
        <ErrorMessage error={error} />
        {busy ? <LoadingLabel /> : <SubmitButton label="Giriş yap" disabled={!normalizePhone(credentials.phone) || !hasValidPassword(credentials.password)} />}
      </form>
    </div>
  );
}

function SignUp({
  step,
  credentials,
  profile,
  goal,
  trainingMode,
  showPassword,
  busy,
  error,
  onCredentialsChange,
  onProfileChange,
  onGoalChange,
  onModeChange,
  onShowPassword,
  onBackToCredentials,
  onBackToProfile,
  onCredentialsNext,
  onProfileNext,
  onSubmit,
}: {
  step: SignupStep;
  credentials: Credentials;
  profile: Profile;
  goal: Goal;
  trainingMode: TrainingMode;
  showPassword: boolean;
  busy: boolean;
  error: string;
  onCredentialsChange: (key: keyof Credentials, value: string) => void;
  onProfileChange: (key: keyof Profile, value: string) => void;
  onGoalChange: (goal: Goal) => void;
  onModeChange: (mode: TrainingMode) => void;
  onShowPassword: () => void;
  onBackToCredentials: () => void;
  onBackToProfile: () => void;
  onCredentialsNext: (event: React.FormEvent<HTMLFormElement>) => void;
  onProfileNext: () => void;
  onSubmit: () => void;
}) {
  if (step === "credentials") {
    return (
      <div className="auth-flow">
        <Progress current={1} />
        <div className="auth-intro">
          <h1 id="auth-title">Hesap oluştur.</h1>
          <p>Telefonunla giriş yap; hesabın her cihazda seninle gelsin.</p>
        </div>
        <form className="auth-form" noValidate onSubmit={onCredentialsNext}>
          <CredentialsFields
            credentials={credentials}
            showPassword={showPassword}
            onChange={onCredentialsChange}
            onTogglePassword={onShowPassword}
            passwordAutoComplete="new-password"
          />
          <ErrorMessage error={error} />
          <SubmitButton label="Devam et" disabled={!normalizePhone(credentials.phone) || !hasValidPassword(credentials.password)} />
        </form>
      </div>
    );
  }

  if (step === "profile") {
    return (
      <div className="auth-flow">
        <Progress current={2} />
        <div className="auth-intro">
          <button type="button" className="auth-back" onClick={onBackToCredentials}>
            <ArrowLeft size={16} aria-hidden /> Geri
          </button>
          <h1 id="auth-title">Seni tanıyalım.</h1>
          <p>Bu bilgiler yalnızca sana uygun günlük hedefleri hesaplamak için kullanılır.</p>
        </div>
        <ProfileForm profile={profile} onChange={onProfileChange} onSubmit={onProfileNext} error={error} label="Devam et" busy={false} />
      </div>
    );
  }

  return (
    <div className="auth-flow">
      <Progress current={3} />
      <div className="auth-intro">
        <button type="button" className="auth-back" onClick={onBackToProfile}>
          <ArrowLeft size={16} aria-hidden /> Geri
        </button>
        <h1 id="auth-title">Hedefin ne?</h1>
        <p>Seçimine göre kalori ve makro hedeflerini ayarlarız; sonra ayarlardan değiştirebilirsin.</p>
      </div>
      <div className="auth-form">
        <GoalRuler value={goal} onChange={onGoalChange} mode={trainingMode} onModeChange={onModeChange} />
        <ErrorMessage error={error} />
        {busy ? (
          <LoadingLabel />
        ) : (
          <button type="button" className="btn btn-primary auth-submit" onClick={onSubmit}>
            Hesabımı oluştur
          </button>
        )}
      </div>
    </div>
  );
}

function CredentialsFields({
  credentials,
  showPassword,
  onChange,
  onTogglePassword,
  passwordAutoComplete,
}: {
  credentials: Credentials;
  showPassword: boolean;
  onChange: (key: keyof Credentials, value: string) => void;
  onTogglePassword: () => void;
  passwordAutoComplete: "current-password" | "new-password";
}) {
  return (
    <div className="auth-fields">
      <label className="auth-field">
        <span>Telefon numarası</span>
        <span className="auth-input-wrap">
          <Smartphone size={17} aria-hidden />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={credentials.phone}
            onChange={(event) => onChange("phone", event.target.value)}
            placeholder="05XX XXX XX XX"
            aria-describedby="phone-hint"
          />
        </span>
        <small id="phone-hint">Numaran yalnızca hesabına erişmek için kullanılır.</small>
      </label>
      <label className="auth-field">
        <span>Şifre</span>
        <span className="auth-input-wrap">
          <LockKeyhole size={17} aria-hidden />
          <input
            type={showPassword ? "text" : "password"}
            autoComplete={passwordAutoComplete}
            value={credentials.password}
            onChange={(event) => onChange("password", event.target.value)}
            placeholder="Şifreni yaz"
            minLength={8}
            pattern="[A-Za-z0-9]+"
          />
          <button type="button" className="auth-eye" onClick={onTogglePassword} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
            {showPassword ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        </span>
        <small>8–128 karakter; yalnızca harf ve rakam kullan.</small>
      </label>
    </div>
  );
}

function ProfileForm({
  profile,
  onChange,
  onSubmit,
  error,
  label,
  busy,
}: {
  profile: Profile;
  onChange: (key: keyof Profile, value: string) => void;
  onSubmit: () => void;
  error: string;
  label: string;
  busy: boolean;
}) {
  return (
    <form
      className="auth-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="auth-fields">
        <label className="auth-field">
          <span>İsmin</span>
          <span className="auth-input-wrap">
            <UserRound size={17} aria-hidden />
            <input type="text" autoComplete="name" value={profile.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Adın" />
          </span>
        </label>
        <div className="auth-field-grid">
          <label className="auth-field">
            <span>Yaş</span>
            <input type="number" inputMode="numeric" min="10" max="100" value={profile.age} onChange={(event) => onChange("age", event.target.value)} placeholder="25" />
          </label>
          <label className="auth-field">
            <span>Boy</span>
            <span className="auth-unit-input">
              <input type="number" inputMode="numeric" min="100" max="250" value={profile.heightCm} onChange={(event) => onChange("heightCm", event.target.value)} placeholder="175" />
              <span>cm</span>
            </span>
          </label>
          <label className="auth-field">
            <span>Kilo</span>
            <span className="auth-unit-input">
              <input type="number" inputMode="decimal" min="25" max="350" step="0.1" value={profile.weightKg} onChange={(event) => onChange("weightKg", event.target.value)} placeholder="72" />
              <span>kg</span>
            </span>
          </label>
        </div>
        <label className="auth-field">
          <span>Cinsiyet</span>
          <select value={profile.gender} onChange={(event) => onChange("gender", event.target.value)}>
            <option value="">Seç</option>
            <option value="kadin">Kadın</option>
            <option value="erkek">Erkek</option>
            <option value="belirtmek-istemiyorum">Belirtmek istemiyorum</option>
          </select>
        </label>
      </div>
      <ErrorMessage error={error} />
      {busy ? <LoadingLabel /> : <SubmitButton label={label} />}
    </form>
  );
}

function SubmitButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  return (
    <button type="submit" className="btn btn-primary auth-submit" disabled={disabled}>
      {label}
    </button>
  );
}

function Progress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="auth-progress" aria-label={`Hesap kurulumunun ${current}. adımı`}>
      {[1, 2, 3].map((step) => (
        <span key={step} data-active={step <= current}>
          {step < current ? <Check size={12} strokeWidth={2.5} aria-hidden /> : step}
        </span>
      ))}
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  return error ? <p className="auth-error" role="alert">{error}</p> : null;
}

function LoadingLabel() {
  return (
    <div className="auth-loading" role="status">
      <ShiningText text="Hesabın hazırlanıyor…" />
    </div>
  );
}

function toProfilePayload(profile: Profile) {
  return {
    name: profile.name.trim(),
    age: Number(profile.age),
    heightCm: Number(profile.heightCm),
    weightKg: Number(profile.weightKg),
    gender: profile.gender,
  };
}

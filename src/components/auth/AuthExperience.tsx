"use client";

import { useEffect, useState } from "react";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Check, Eye, EyeOff, LockKeyhole, Smartphone, UserRound } from "lucide-react";
import ThemeSwitch from "@/components/ThemeSwitch";
import PasswordStrength from "@/components/ui/password-strength";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
import { ShiningText } from "@/components/ui/shining-text";
import { THEME_KEY, isTheme, type ThemeId } from "@/lib/theme";

type AuthMode = "giris" | "kayit";
type SignupStep = "credentials" | "profile" | "theme";
type Experience = "auth" | "onboarding";
type Gender = "kadın" | "erkek" | "diğer" | "belirtmek_istemiyorum" | "";

type Credentials = { phone: string; password: string };
type Profile = { name: string; age: string; heightCm: string; weightKg: string; gender: Gender };

const THEME_OPTIONS: ReadonlyArray<{
  id: ThemeId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  { id: "kagit", label: "Pembe", shortLabel: "P", description: "Canlı, cesur ve sıcak." },
  { id: "pegasus", label: "Kırmızı", shortLabel: "K", description: "Ejderha gücü, altın detaylar." },
  { id: "karbon", label: "Siyah", shortLabel: "S", description: "Sessiz, sert ve net." },
];

const EMPTY_CREDENTIALS: Credentials = { phone: "", password: "" };
const EMPTY_PROFILE: Profile = { name: "", age: "", heightCm: "", weightKg: "", gender: "" };
const THEME_CHANGE_EVENT = "fitmatik:theme-change";

function cleanPhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

function hasValidPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function hasCompleteProfile(profile: Profile) {
  const age = Number(profile.age);
  const heightCm = Number(profile.heightCm);
  const weightKg = Number(profile.weightKg);
  return (
    profile.name.trim().length >= 2 &&
    Number.isFinite(age) &&
    age >= 13 &&
    age <= 120 &&
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

async function responseBody(response: Response): Promise<{ error?: string; next?: string; profileComplete?: boolean }> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { error?: string; next?: string; profileComplete?: boolean };
  } catch {
    return {};
  }
}

function apiError(response: Response, body: { error?: string }) {
  if (response.status === 404) return "Giriş bağlantısı hazırlanıyor. Lütfen kısa süre sonra tekrar dene.";
  return body.error || "İşlem tamamlanamadı. Lütfen tekrar dene.";
}

export default function AuthExperience({ experience = "auth" }: { experience?: Experience }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("giris");
  const [step, setStep] = useState<SignupStep>(experience === "onboarding" ? "profile" : "credentials");
  const [credentials, setCredentials] = useState<Credentials>(EMPTY_CREDENTIALS);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [theme, setTheme] = useState<ThemeId>("kagit");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    const timer = isTheme(current) ? window.setTimeout(() => setTheme(current), 0) : undefined;
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isTheme(next)) setTheme(next);
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    };
  }, []);

  function updateCredentials(key: keyof Credentials, value: string) {
    setCredentials((current) => ({ ...current, [key]: key === "phone" ? cleanPhone(value) : value }));
  }

  function updateProfile(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function chooseTheme(id: ThemeId) {
    document.documentElement.dataset.theme = id;
    setTheme(id);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--browser-theme").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: id }));
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      // Tema seçimi özel sekmede yalnızca açık oturum boyunca kalabilir.
    }
  }

  function openGoogle() {
    const returnTo = experience === "onboarding" || mode === "kayit" ? "/onboarding" : "/upload";
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- OAuth yönlendirmesi tam sayfa geçişi ister.
    window.location.assign(`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
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
    if (!hasValidPhone(credentials.phone)) {
      setError("Geçerli bir telefon numarası yaz.");
      return;
    }
    if (credentials.password.length < 12) {
      setError("Şifren en az 12 karakter olmalı.");
      return;
    }
    setStep("profile");
  }

  function continueToTheme(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!hasCompleteProfile(profile)) {
      setError("Devam etmek için tüm bilgileri geçerli biçimde doldur.");
      return;
    }
    const currentTheme = document.documentElement.dataset.theme;
    if (isTheme(currentTheme)) setTheme(currentTheme);
    setStep("theme");
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!hasValidPhone(credentials.phone) || !credentials.password) {
      setError("Telefon numaranı ve şifreni yaz.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(apiError(response, body));
      router.replace(safePath(body.profileComplete === false ? "/onboarding" : body.next, "/upload"));
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
      const isOnboarding = experience === "onboarding";
      const response = await fetch(isOnboarding ? "/api/auth/onboarding" : "/api/auth/sign-up", {
        method: isOnboarding ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isOnboarding
            ? { profile: toProfilePayload(profile), theme }
            : { phone: credentials.phone, password: credentials.password, profile: toProfilePayload(profile), theme },
        ),
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

  const isOnboarding = experience === "onboarding";

  return (
    <main className="auth-page">
      <div className="auth-page__content">
        <header className="auth-page__header">
          <Link href="/" className="auth-brand" aria-label="Fit-matik ana sayfa">
            <span className="auth-brand__mark" />
            <span>FIT-MATİK</span>
          </Link>
          <ThemeSwitch />
        </header>

        <section className="auth-panel" aria-labelledby="auth-title">
          {!isOnboarding && (
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
          )}

          {isOnboarding ? (
            <Onboarding
              step={step}
              profile={profile}
              theme={theme}
              busy={busy}
              error={error}
              onProfileChange={updateProfile}
              onThemeChange={chooseTheme}
              onBack={goToProfile}
              onNext={continueToTheme}
              onSubmit={submitProfile}
            />
          ) : mode === "giris" ? (
            <SignIn
              credentials={credentials}
              showPassword={showPassword}
              busy={busy}
              error={error}
              onCredentialsChange={updateCredentials}
              onShowPassword={() => setShowPassword((visible) => !visible)}
              onSubmit={signIn}
              onGoogle={openGoogle}
            />
          ) : (
            <SignUp
              step={step}
              credentials={credentials}
              profile={profile}
              theme={theme}
              showPassword={showPassword}
              busy={busy}
              error={error}
              onCredentialsChange={updateCredentials}
              onProfileChange={updateProfile}
              onThemeChange={chooseTheme}
              onShowPassword={() => setShowPassword((visible) => !visible)}
              onBack={goToCredentials}
              onThemeBack={goToProfile}
              onCredentialsNext={continueToProfile}
              onProfileNext={continueToTheme}
              onSubmit={submitProfile}
              onGoogle={openGoogle}
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
  onGoogle,
}: {
  credentials: Credentials;
  showPassword: boolean;
  busy: boolean;
  error: string;
  onCredentialsChange: (key: keyof Credentials, value: string) => void;
  onShowPassword: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogle: () => void;
}) {
  return (
    <div className="auth-flow">
      <div className="auth-intro">
        <p className="auth-kicker">RİTMİNİ YAKALA</p>
        <h1 id="auth-title">Bugün kendin için ne yaptın?</h1>
        <p>Yemeğini, hedefini ve ritmini tek yerde tut.</p>
      </div>

      <button type="button" className="auth-google-button" onClick={onGoogle}>
        <BadgeCheck size={18} strokeWidth={1.7} aria-hidden />
        Google ile devam et
      </button>

      <Separator />

      <form className="auth-form" noValidate onSubmit={onSubmit}>
        <CredentialsFields
          credentials={credentials}
          showPassword={showPassword}
          onChange={onCredentialsChange}
          onTogglePassword={onShowPassword}
          passwordAutoComplete="current-password"
        />
        <ErrorMessage error={error} />
        {busy ? <LoadingLabel /> : <LiquidMetalButton label="Giriş yap" type="submit" fullWidth disabled={!credentials.password || !credentials.phone} />}
      </form>
    </div>
  );
}

function SignUp({
  step,
  credentials,
  profile,
  theme,
  showPassword,
  busy,
  error,
  onCredentialsChange,
  onProfileChange,
  onThemeChange,
  onShowPassword,
  onBack,
  onThemeBack,
  onCredentialsNext,
  onProfileNext,
  onSubmit,
  onGoogle,
}: {
  step: SignupStep;
  credentials: Credentials;
  profile: Profile;
  theme: ThemeId;
  showPassword: boolean;
  busy: boolean;
  error: string;
  onCredentialsChange: (key: keyof Credentials, value: string) => void;
  onProfileChange: (key: keyof Profile, value: string) => void;
  onThemeChange: (theme: ThemeId) => void;
  onShowPassword: () => void;
  onBack: () => void;
  onThemeBack: () => void;
  onCredentialsNext: (event: React.FormEvent<HTMLFormElement>) => void;
  onProfileNext: (event: React.FormEvent<HTMLFormElement>) => void;
  onSubmit: () => void;
  onGoogle: () => void;
}) {
  if (step === "credentials") {
    return (
      <div className="auth-flow">
        <Progress current={1} />
        <div className="auth-intro">
          <p className="auth-kicker">İLK ADIM</p>
          <h1 id="auth-title">Kendi alanını oluştur.</h1>
          <p>Telefonunla giriş yap; hesabın her cihazda seninle gelsin.</p>
        </div>
        <button type="button" className="auth-google-button" onClick={onGoogle}>
          <BadgeCheck size={18} strokeWidth={1.7} aria-hidden />
          Google ile devam et
        </button>
        <Separator />
        <form className="auth-form" noValidate onSubmit={onCredentialsNext}>
          <CredentialsFields
            credentials={credentials}
            showPassword={showPassword}
            onChange={onCredentialsChange}
            onTogglePassword={onShowPassword}
            passwordAutoComplete="new-password"
          />
          <PasswordStrength value={credentials.password} />
          <ErrorMessage error={error} />
          <LiquidMetalButton label="Devam et" type="submit" fullWidth disabled={!credentials.phone || credentials.password.length < 12} />
        </form>
      </div>
    );
  }

  if (step === "profile") {
    return (
      <div className="auth-flow">
        <Progress current={2} />
        <div className="auth-intro">
          <button type="button" className="auth-back" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden /> Geri
          </button>
          <p className="auth-kicker">SENİ TANIYALIM</p>
          <h1 id="auth-title">Hedefini sana göre kuralım.</h1>
          <p>Bu bilgiler yalnızca sana uygun günlük hedefleri hesaplamak için kullanılır.</p>
        </div>
        <ProfileForm profile={profile} onChange={onProfileChange} onSubmit={onProfileNext} error={error} label="Tema seçimine geç" />
      </div>
    );
  }

  return (
    <div className="auth-flow">
      <Progress current={3} />
      <div className="auth-intro">
        <button type="button" className="auth-back" onClick={onThemeBack}>
          <ArrowLeft size={16} aria-hidden /> Geri
        </button>
        <p className="auth-kicker">SON DOKUNUŞ</p>
        <h1 id="auth-title">Dünyanı seç.</h1>
        <p>İstersen daha sonra tek dokunuşla değiştirebilirsin.</p>
      </div>
      <ThemeChoices theme={theme} onChange={onThemeChange} />
      <ErrorMessage error={error} />
      {busy ? <LoadingLabel /> : <LiquidMetalButton label="Hesabımı oluştur" onClick={onSubmit} fullWidth />}
    </div>
  );
}

function Onboarding({
  step,
  profile,
  theme,
  busy,
  error,
  onProfileChange,
  onThemeChange,
  onBack,
  onNext,
  onSubmit,
}: {
  step: SignupStep;
  profile: Profile;
  theme: ThemeId;
  busy: boolean;
  error: string;
  onProfileChange: (key: keyof Profile, value: string) => void;
  onThemeChange: (theme: ThemeId) => void;
  onBack: () => void;
  onNext: (event: React.FormEvent<HTMLFormElement>) => void;
  onSubmit: () => void;
}) {
  if (step === "profile") {
    return (
      <div className="auth-flow">
        <Progress current={2} />
        <div className="auth-intro">
          <p className="auth-kicker">HOŞ GELDİN</p>
          <h1 id="auth-title">Hedefini sana göre kuralım.</h1>
          <p>Son iki küçük adımda Fit-matik senin ritmine uyacak.</p>
        </div>
        <ProfileForm profile={profile} onChange={onProfileChange} onSubmit={onNext} error={error} label="Tema seçimine geç" />
      </div>
    );
  }

  return (
    <div className="auth-flow">
      <Progress current={3} />
      <div className="auth-intro">
        <button type="button" className="auth-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden /> Geri
        </button>
        <p className="auth-kicker">SON DOKUNUŞ</p>
        <h1 id="auth-title">Dünyanı seç.</h1>
        <p>Bu tema günlüğünün her yerinde seninle olacak.</p>
      </div>
      <ThemeChoices theme={theme} onChange={onThemeChange} />
      <ErrorMessage error={error} />
      {busy ? <LoadingLabel /> : <LiquidMetalButton label="Fit-matik'e gir" onClick={onSubmit} fullWidth />}
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
          />
          <button type="button" className="auth-eye" onClick={onTogglePassword} aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>
            {showPassword ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
          </button>
        </span>
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
}: {
  profile: Profile;
  onChange: (key: keyof Profile, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  error: string;
  label: string;
}) {
  return (
    <form className="auth-form" noValidate onSubmit={onSubmit}>
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
            <input type="number" inputMode="numeric" min="13" max="120" value={profile.age} onChange={(event) => onChange("age", event.target.value)} placeholder="25" />
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
            <option value="kadın">Kadın</option>
            <option value="erkek">Erkek</option>
            <option value="diğer">Diğer</option>
            <option value="belirtmek_istemiyorum">Belirtmek istemiyorum</option>
          </select>
        </label>
      </div>
      <ErrorMessage error={error} />
      <LiquidMetalButton label={label} type="submit" fullWidth />
    </form>
  );
}

function ThemeChoices({ theme, onChange }: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  return (
    <div className="auth-theme-choices" role="radiogroup" aria-label="Tema seçimi">
      {THEME_OPTIONS.map((option) => {
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className="auth-theme-choice"
            data-theme-option={option.id}
            data-selected={selected}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
          >
            <span className="auth-theme-choice__image" aria-hidden>
              <span>{option.shortLabel}</span>
            </span>
            <span className="auth-theme-choice__copy">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            <span className="auth-theme-choice__check" aria-hidden>{selected && <Check size={15} strokeWidth={2.5} />}</span>
          </button>
        );
      })}
    </div>
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

function Separator() {
  return <div className="auth-separator"><span>veya</span></div>;
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

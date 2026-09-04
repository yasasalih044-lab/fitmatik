import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getJsonObject, putJsonObject } from "./store";
import { DEFAULT_THEME, isTheme, type ThemeId } from "./theme";

/**
 * Hesaplar Supabase Storage'da JSON olarak duruyor:
 *   accounts/by-phone/<E164>.json   -> { id }        (telefon → hesap dizini)
 *   accounts/<id>.json              -> Account       (asıl kayıt)
 *
 * Şifreler scrypt ile tuzlanıp saklanıyor; düz metin hiçbir yere yazılmıyor.
 */

export type Gender = "kadin" | "erkek" | "belirtmek-istemiyorum";

export type Profile = {
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
  gender: Gender;
};

export type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type Account = {
  id: string;
  phone: string;
  password: { salt: string; hash: string };
  profile: Profile;
  theme: ThemeId;
  targets: Targets;
  created_at: string;
  updated_at: string;
};

/** Hesabın istemciye gidebilecek hâli — şifre alanı asla dışarı çıkmaz. */
export type PublicAccount = Omit<Account, "password">;

export const publicAccount = (a: Account): PublicAccount => {
  const { password: _password, ...rest } = a;
  return rest;
};

/* ------------------------------------------------------------------ */
/* Telefon                                                             */
/* ------------------------------------------------------------------ */

/**
 * Türkiye numaralarını E.164'e çevirir: "0555 123 45 67", "5551234567",
 * "+90 555 123 45 67" hepsi "+905551234567" olur.
 */
export function normalizePhone(input: string): string | null {
  const raw = (input || "").replace(/[^\d+]/g, "");
  if (!raw) return null;

  let digits = raw.startsWith("+") ? raw.slice(1) : raw;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;

  // Türkiye: 90 + 10 hane. Diğer ülkeler için makul bir aralık bırakıyoruz.
  if (!/^\d{10,15}$/.test(digits)) return null;
  if (digits.startsWith("90") && digits.length !== 12) return null;
  return `+${digits}`;
}

/* ------------------------------------------------------------------ */
/* Şifre                                                               */
/* ------------------------------------------------------------------ */

const KEYLEN = 64;

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, KEYLEN).toString("hex") };
}

export function verifyPassword(password: string, stored: Account["password"]): boolean {
  try {
    const attempt = scryptSync(password, stored.salt, KEYLEN);
    const known = Buffer.from(stored.hash, "hex");
    // Uzunluk farklıysa timingSafeEqual fırlatır; önce onu ele.
    return known.length === attempt.length && timingSafeEqual(known, attempt);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Oturum çerezi — imzalı, sunucu tarafında doğrulanıyor                */
/* ------------------------------------------------------------------ */

export const SESSION_COOKIE = "fm_session";
const SESSION_DAYS = 180;

const secret = () => process.env.APP_SECRET || "fitmatik-gelistirme";

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("hex");

export function createSession(userId: string): { value: string; maxAge: number } {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export function readSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const payload = `${userId}.${expStr}`;

  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return userId;
}

/* ------------------------------------------------------------------ */
/* Depolama                                                            */
/* ------------------------------------------------------------------ */

const accountPath = (id: string) => `accounts/${id}.json`;
const phoneIndexPath = (phone: string) => `accounts/by-phone/${encodeURIComponent(phone)}.json`;

export const DEFAULT_TARGETS: Targets = { kcal: 2400, protein_g: 150, carbs_g: 250, fat_g: 80 };

export async function findByPhone(phone: string): Promise<Account | null> {
  const idx = await getJsonObject<{ id: string }>(phoneIndexPath(phone));
  return idx?.id ? getAccount(idx.id) : null;
}

export const getAccount = (id: string) => getJsonObject<Account>(accountPath(id));

export async function saveAccount(account: Account): Promise<void> {
  await putJsonObject(accountPath(account.id), { ...account, updated_at: new Date().toISOString() });
}

export async function createAccount(input: {
  phone: string;
  password: string;
  profile: Profile;
  theme?: ThemeId;
}): Promise<Account> {
  const now = new Date().toISOString();
  const account: Account = {
    id: crypto.randomUUID(),
    phone: input.phone,
    password: hashPassword(input.password),
    profile: input.profile,
    theme: isTheme(input.theme) ? input.theme : DEFAULT_THEME,
    targets: suggestTargets(input.profile),
    created_at: now,
    updated_at: now,
  };
  await putJsonObject(accountPath(account.id), account);
  await putJsonObject(phoneIndexPath(account.phone), { id: account.id });
  return account;
}

/* ------------------------------------------------------------------ */
/* Doğrulama ve hedef önerisi                                          */
/* ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/** Girdiyi profile çevirir; hata varsa mesajını döndürür. */
export function parseProfile(raw: unknown): { profile: Profile } | { error: string } {
  const p = (raw || {}) as Record<string, unknown>;
  const name = String(p.name ?? "").trim();
  const age = num(p.age);
  const heightCm = num(p.heightCm);
  const weightKg = num(p.weightKg);
  const gender = String(p.gender ?? "");

  if (name.length < 2) return { error: "İsim en az 2 harf olmalı." };
  if (!(age >= 10 && age <= 100)) return { error: "Yaş 10 ile 100 arasında olmalı." };
  if (!(heightCm >= 100 && heightCm <= 250)) return { error: "Boy 100 ile 250 cm arasında olmalı." };
  if (!(weightKg >= 25 && weightKg <= 300)) return { error: "Kilo 25 ile 300 kg arasında olmalı." };
  if (!["kadin", "erkek", "belirtmek-istemiyorum"].includes(gender)) {
    return { error: "Cinsiyet seçilmeli." };
  }

  return {
    profile: {
      name: name.slice(0, 60),
      age: Math.round(age),
      heightCm: Math.round(heightCm),
      weightKg: Math.round(weightKg * 10) / 10,
      gender: gender as Gender,
    },
  };
}

export function parseTargets(raw: unknown): Targets {
  const t = (raw || {}) as Record<string, unknown>;
  const pick = (v: unknown, fallback: number, max: number) => {
    const n = num(v);
    return n > 0 && n <= max ? Math.round(n) : fallback;
  };
  return {
    kcal: pick(t.kcal, DEFAULT_TARGETS.kcal, 10_000),
    protein_g: pick(t.protein_g, DEFAULT_TARGETS.protein_g, 500),
    carbs_g: pick(t.carbs_g, DEFAULT_TARGETS.carbs_g, 1000),
    fat_g: pick(t.fat_g, DEFAULT_TARGETS.fat_g, 400),
  };
}

/**
 * Kayıt sırasında makul bir başlangıç hedefi üretir (Mifflin-St Jeor, hafif
 * aktif çarpanı). Kullanıcı ayarlardan değiştirebiliyor; amaç sıfırdan
 * başlatmamak.
 */
export function suggestTargets(p: Profile): Targets {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  const bmr = p.gender === "erkek" ? base + 5 : p.gender === "kadin" ? base - 161 : base - 78;
  const kcal = Math.round((bmr * 1.375) / 10) * 10;

  return {
    kcal,
    protein_g: Math.round(p.weightKg * 1.8),
    carbs_g: Math.round((kcal * 0.45) / 4),
    fat_g: Math.round((kcal * 0.28) / 9),
  };
}

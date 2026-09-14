import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { DEFAULT_THEME, isTheme, type ThemeId } from "./theme";
import { supabase } from "./store";

/** Values stored by `app_accounts`; all personal data stays server-side. */
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

/** Account data safe to send to a signed-in browser. */
export type PublicAccount = Omit<Account, "password">;

export const publicAccount = (account: Account): PublicAccount => {
  const { password, ...safe } = account;
  void password;
  return safe;
};

class AccountStoreError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "AccountStoreError";
  }
}

export class DuplicatePhoneError extends Error {
  constructor() {
    super("Bu numarayla bir hesap zaten var.");
    this.name = "DuplicatePhoneError";
  }
}

export class SignupRateLimitError extends Error {
  constructor() {
    super("Kayıt denemesi sınırına ulaşıldı. Lütfen 24 saat sonra tekrar dene.");
    this.name = "SignupRateLimitError";
  }
}

export class SignInRateLimitError extends Error {
  constructor() {
    super("Çok fazla giriş denemesi yapıldı. Lütfen 15 dakika sonra tekrar dene.");
    this.name = "SignInRateLimitError";
  }
}

/* ------------------------------------------------------------------ */
/* Phone and password validation                                       */
/* ------------------------------------------------------------------ */

/**
 * Canonicalizes Turkish phone numbers to E.164. Other valid E.164-shaped
 * numbers remain valid so that server and client never disagree about input.
 */
export function normalizePhone(input: string): string | null {
  const raw = (input || "").replace(/[^\d+]/g, "");
  if (!raw) return null;

  let digits = raw.startsWith("+") ? raw.slice(1) : raw;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;

  if (!/^\d{10,15}$/.test(digits)) return null;
  if (digits.startsWith("90") && digits.length !== 12) return null;
  return `+${digits}`;
}

/** Only ASCII letters and digits are accepted; special-character rules are deliberately absent. */
export function passwordError(password: string): string | null {
  if (!/^[A-Za-z0-9]{8,128}$/.test(password)) {
    return "Şifre 8–128 karakter arasında olmalı ve yalnızca harf ile rakam içermeli.";
  }
  return null;
}

const KEYLEN = 64;

export function hashPassword(password: string): { salt: string; hash: string } {
  const invalid = passwordError(password);
  if (invalid) throw new Error(invalid);
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, KEYLEN).toString("hex") };
}

export function verifyPassword(password: string, stored: Account["password"]): boolean {
  if (passwordError(password)) return false;
  try {
    const attempt = scryptSync(password, stored.salt, KEYLEN);
    const known = Buffer.from(stored.hash, "hex");
    return known.length === attempt.length && timingSafeEqual(known, attempt);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Signed session                                                      */
/* ------------------------------------------------------------------ */

export const SESSION_COOKIE = "fm_session";
const SESSION_DAYS = 180;
const DEVELOPMENT_SECRET = "fitmatik-development-session-secret-not-for-production";

export class SessionConfigurationError extends Error {
  constructor() {
    super("APP_SECRET üretimde en az 32 baytlık sabit bir değer olmalı.");
    this.name = "SessionConfigurationError";
  }
}

function sessionSecret(): string {
  const configured = process.env.APP_SECRET?.trim();
  if (configured && Buffer.byteLength(configured, "utf8") >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new SessionConfigurationError();
  return DEVELOPMENT_SECRET;
}

/** Use in authentication routes before mutating an account in production. */
export function assertSessionConfiguration(): void {
  sessionSecret();
}

/** HMAC keys let Postgres enforce a durable limit without retaining raw IPs. */
export function signupRateKey(subject: string): string {
  return createHmac("sha256", sessionSecret())
    .update(`fitmatik:signup-rate-limit:v1:${subject}`)
    .digest("hex");
}

const sign = (payload: string) => createHmac("sha256", sessionSecret()).update(payload).digest("hex");

export function createSession(userId: string): { value: string; maxAge: number } {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_DAYS * 24 * 60 * 60 };
}

export function readSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  try {
    const parts = cookie.split(".");
    if (parts.length !== 3) return null;
    const [userId, expStr, signature] = parts;
    // Account IDs are UUIDs. Rejecting malformed claims also prevents an
    // arbitrary string from ever reaching the database query.
    if (!UUID.test(userId)) return null;
    const payload = `${userId}.${expStr}`;
    const expected = sign(payload);
    if (signature.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const exp = Number(expStr);
    return Number.isFinite(exp) && Date.now() <= exp ? userId : null;
  } catch {
    // A production server without APP_SECRET must reject rather than accept
    // any cookie. Authentication endpoints surface configuration failure.
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ------------------------------------------------------------------ */
/* Postgres account mapping                                            */
/* ------------------------------------------------------------------ */

type AccountRow = {
  id: string;
  phone: string;
  password_salt: string;
  password_hash: string;
  name: string;
  age: number | string;
  height_cm: number | string;
  weight_kg: number | string;
  gender: string;
  theme: string;
  target_kcal: number | string;
  target_protein_g: number | string;
  target_carbs_g: number | string;
  target_fat_g: number | string;
  created_at: string;
  updated_at: string;
};

const numeric = (value: number | string): number => Number(value);

function fromRow(row: AccountRow): Account {
  const gender: Gender = ["kadin", "erkek", "belirtmek-istemiyorum"].includes(row.gender)
    ? (row.gender as Gender)
    : "belirtmek-istemiyorum";
  return {
    id: row.id,
    phone: row.phone,
    password: { salt: row.password_salt, hash: row.password_hash },
    profile: {
      name: row.name,
      age: numeric(row.age),
      heightCm: numeric(row.height_cm),
      weightKg: numeric(row.weight_kg),
      gender,
    },
    theme: isTheme(row.theme) ? row.theme : DEFAULT_THEME,
    targets: {
      kcal: numeric(row.target_kcal),
      protein_g: numeric(row.target_protein_g),
      carbs_g: numeric(row.target_carbs_g),
      fat_g: numeric(row.target_fat_g),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function accountError(error: { message: string; code?: string } | null, fallback: string): never {
  throw new AccountStoreError(error?.message || fallback, error?.code);
}

export const DEFAULT_TARGETS: Targets = { kcal: 2400, protein_g: 150, carbs_g: 250, fat_g: 80 };

export async function findByPhone(phone: string): Promise<Account | null> {
  const { data, error } = await supabase()
    .from("app_accounts")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();
  if (error) accountError(error, "Hesap bulunamadı.");
  return data ? fromRow(data as AccountRow) : null;
}

export async function getAccount(id: string): Promise<Account | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase()
    .from("app_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) accountError(error, "Hesap okunamadı.");
  return data ? fromRow(data as AccountRow) : null;
}

/** Update only the account row belonging to the signed-in user. */
export async function saveAccount(account: Account): Promise<Account> {
  const { data, error } = await supabase()
    .from("app_accounts")
    .update({
      password_salt: account.password.salt,
      password_hash: account.password.hash,
      name: account.profile.name,
      age: account.profile.age,
      height_cm: account.profile.heightCm,
      weight_kg: account.profile.weightKg,
      gender: account.profile.gender,
      theme: account.theme,
      target_kcal: account.targets.kcal,
      target_protein_g: account.targets.protein_g,
      target_carbs_g: account.targets.carbs_g,
      target_fat_g: account.targets.fat_g,
    })
    .eq("id", account.id)
    .select("*")
    .single();
  if (error) accountError(error, "Hesap kaydedilemedi.");
  return fromRow(data as AccountRow);
}

/**
 * RPC performs account, wallet, and the one-time 5,000 FC grant in one
 * database transaction. A phone uniqueness race becomes a normal 409 route
 * response rather than two partially-created accounts.
 */
export async function createAccount(input: {
  phone: string;
  password: string;
  profile: Profile;
  theme?: ThemeId;
  signupIpHash: string;
}): Promise<Account> {
  const password = hashPassword(input.password);
  const targets = suggestTargets(input.profile);
  const { data, error } = await supabase()
    .rpc("create_app_account", {
      p_phone: input.phone,
      p_password_salt: password.salt,
      p_password_hash: password.hash,
      p_name: input.profile.name,
      p_age: input.profile.age,
      p_height_cm: input.profile.heightCm,
      p_weight_kg: input.profile.weightKg,
      p_gender: input.profile.gender,
      // Sign-up no longer selects a theme. New accounts always start from the
      // black/neon-green theme; users can change it later in Settings.
      p_theme: "siyah",
      p_target_kcal: targets.kcal,
      p_target_protein_g: targets.protein_g,
      p_target_carbs_g: targets.carbs_g,
      p_target_fat_g: targets.fat_g,
      p_signup_ip_hash: input.signupIpHash,
      p_phone_rate_hash: signupRateKey(`phone:${input.phone}`),
    })
    .single();
  if (error?.code === "23505") throw new DuplicatePhoneError();
  if (error?.message.includes("signup_rate_limited")) throw new SignupRateLimitError();
  if (error) accountError(error, "Hesap oluşturulamadı.");
  return fromRow(data as AccountRow);
}

/**
 * Password doğrulamasından önce çağrılan, yalnızca HMAClenmiş IP/telefon
 * anahtarları saklayan kalıcı online giriş limiti.
 */
export async function consumeSignInRateLimit(input: { ip: string; phone: string }): Promise<void> {
  const { error } = await supabase().rpc("consume_signin_rate_limit", {
    p_ip_hash: signupRateKey(`ip:${input.ip}`),
    p_phone_hash: signupRateKey(`phone:${input.phone}`),
  });
  if (error?.message.includes("signin_rate_limited")) throw new SignInRateLimitError();
  if (error) accountError(error, "Giriş denemesi kaydedilemedi.");
}

/* ------------------------------------------------------------------ */
/* Profile and target validation                                       */
/* ------------------------------------------------------------------ */

const numberValue = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : Number.NaN);

export function parseProfile(raw: unknown): { profile: Profile } | { error: string } {
  const profile = (raw || {}) as Record<string, unknown>;
  const name = String(profile.name ?? "").trim();
  const age = numberValue(profile.age);
  const heightCm = numberValue(profile.heightCm);
  const weightKg = numberValue(profile.weightKg);
  const gender = String(profile.gender ?? "");

  if (name.length < 2) return { error: "İsim en az 2 harf olmalı." };
  if (!(age >= 10 && age <= 100)) return { error: "Yaş 10 ile 100 arasında olmalı." };
  if (!(heightCm >= 100 && heightCm <= 250)) return { error: "Boy 100 ile 250 cm arasında olmalı." };
  if (!(weightKg >= 25 && weightKg <= 350)) return { error: "Kilo 25 ile 350 kg arasında olmalı." };
  if (!(["kadin", "erkek", "belirtmek-istemiyorum"] as string[]).includes(gender)) {
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
  const targets = (raw || {}) as Record<string, unknown>;
  const pick = (value: unknown, fallback: number, max: number) => {
    const parsed = numberValue(value);
    return parsed > 0 && parsed <= max ? Math.round(parsed) : fallback;
  };
  return {
    kcal: pick(targets.kcal, DEFAULT_TARGETS.kcal, 10_000),
    protein_g: pick(targets.protein_g, DEFAULT_TARGETS.protein_g, 500),
    carbs_g: pick(targets.carbs_g, DEFAULT_TARGETS.carbs_g, 1000),
    fat_g: pick(targets.fat_g, DEFAULT_TARGETS.fat_g, 400),
  };
}

export function suggestTargets(profile: Profile): Targets {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  const bmr = profile.gender === "erkek" ? base + 5 : profile.gender === "kadin" ? base - 161 : base - 78;
  const kcal = Math.round((bmr * 1.375) / 10) * 10;
  return {
    kcal,
    protein_g: Math.round(profile.weightKg * 1.8),
    carbs_g: Math.round((kcal * 0.45) / 4),
    fat_g: Math.round((kcal * 0.28) / 9),
  };
}

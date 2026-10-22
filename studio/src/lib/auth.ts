import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mavros_studio";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

const isProd = () => process.env.NODE_ENV === "production";

/** Üretimde şifre ve gizli anahtar zorunlu; geliştirmede stüdyo açık çalışır. */
export function authMode(): "open" | "locked" | "misconfigured" {
  const password = process.env.STUDIO_PASSWORD;
  const secret = process.env.STUDIO_SECRET;
  if (password && secret && Buffer.byteLength(secret) >= 32) return "locked";
  return isProd() ? "misconfigured" : "open";
}

function sign(value: string): string {
  return createHmac("sha256", process.env.STUDIO_SECRET ?? "").update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  // Uzunluk sızmasın diye iki tarafı da önce özetliyoruz.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string): boolean {
  const password = process.env.STUDIO_PASSWORD;
  return !!password && safeEqual(input, password);
}

export function createSession(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `${exp}.${sign(String(exp))}`;
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(now / 1000)) return false;
  return safeEqual(mac, sign(exp));
}

/** Basit, süreç içi deneme sınırı: IP başına 10 dakikada 10 deneme. */
const attempts = new Map<string, { count: number; reset: number }>();

export function allowAttempt(key: string, now = Date.now()): boolean {
  const slot = attempts.get(key);
  if (!slot || slot.reset < now) {
    attempts.set(key, { count: 1, reset: now + 10 * 60_000 });
    return true;
  }
  slot.count += 1;
  return slot.count <= 10;
}

export const COOKIE = "fm_session";

/** PIN tanımlı değilse uygulama açıktır (yerel geliştirme). */
export function pinRequired(): boolean {
  return !!process.env.APP_PIN;
}

export async function pinToken(pin: string): Promise<string> {
  const salt = process.env.APP_SECRET || "fitmatik";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function expectedToken(): Promise<string> {
  return pinToken(process.env.APP_PIN || "");
}

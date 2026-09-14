import { NextResponse } from "next/server";
import {
  assertSessionConfiguration, createSession, findByPhone, normalizePhone,
  consumeSignInRateLimit, passwordError, publicAccount, SESSION_COOKIE,
  SessionConfigurationError, SignInRateLimitError, verifyPassword,
} from "@/lib/accounts";
import { supabaseConfigured } from "@/lib/store";
import { requestIp } from "@/lib/request-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Depolama yapılandırılmamış." }, { status: 503 });
  }
  let body: { phone?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone || "");
  const password = String(body.password || "");
  // Numara mı şifre mi yanlış söylemiyoruz: hesap taramasını kolaylaştırır.
  const reject = () => NextResponse.json({ error: "Numara ya da şifre hatalı." }, { status: 401 });
  if (!phone || passwordError(password)) return reject();

  try {
    assertSessionConfiguration();
    // Bu RPC kendi kısa veritabanı işleminde biter; bundan sonra gelen scrypt
    // çağrısı IP ve telefon başına sınırlıdır.
    await consumeSignInRateLimit({ ip: requestIp(req), phone });
    const account = await findByPhone(phone);
    if (!account || !verifyPassword(password, account.password)) return reject();

    const session = createSession(account.id);
    const res = NextResponse.json({ ok: true, next: "/upload", account: publicAccount(account) });
    res.cookies.set(SESSION_COOKIE, session.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: session.maxAge,
    });
    return res;
  } catch (e) {
    if (e instanceof SignInRateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": "900" } });
    }
    if (e instanceof SessionConfigurationError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[fitmatik] sign-in:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Giriş yapılamadı. Tekrar dene." }, { status: 500 });
  }
}

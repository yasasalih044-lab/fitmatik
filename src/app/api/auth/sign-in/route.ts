import { NextResponse } from "next/server";
import {
  createSession, findByPhone, normalizePhone, publicAccount,
  SESSION_COOKIE, verifyPassword,
} from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
  if (!phone || !password) return reject();

  try {
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
    console.error("[fitmatik] sign-in:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Giriş yapılamadı. Tekrar dene." }, { status: 500 });
  }
}

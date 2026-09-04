import { NextResponse } from "next/server";
import {
  createAccount, createSession, findByPhone, normalizePhone,
  parseProfile, publicAccount, SESSION_COOKIE,
} from "@/lib/accounts";
import { isTheme } from "@/lib/theme";
import { supabaseConfigured } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Depolama yapılandırılmamış." }, { status: 503 });
  }

  let body: { phone?: string; password?: string; profile?: unknown; theme?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone || "");
  if (!phone) return NextResponse.json({ error: "Telefon numarası geçersiz." }, { status: 400 });

  const password = String(body.password || "");
  if (password.length < 8) {
    return NextResponse.json({ error: "Şifre en az 8 karakter olmalı." }, { status: 400 });
  }

  const parsed = parseProfile(body.profile);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    if (await findByPhone(phone)) {
      return NextResponse.json({ error: "Bu numarayla bir hesap zaten var." }, { status: 409 });
    }

    const account = await createAccount({
      phone,
      password,
      profile: parsed.profile,
      theme: isTheme(body.theme) ? body.theme : undefined,
    });

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
    console.error("[fitmatik] sign-up:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Hesap oluşturulamadı. Tekrar dene." }, { status: 500 });
  }
}

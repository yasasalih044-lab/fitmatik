import { NextResponse } from "next/server";
import {
  assertSessionConfiguration, createAccount, createSession, DuplicatePhoneError,
  normalizePhone, parseProfile, passwordError, publicAccount, SESSION_COOKIE,
  SessionConfigurationError, SignupRateLimitError, signupRateKey,
} from "@/lib/accounts";
import { isGoal, isTrainingMode } from "@/lib/goals";
import { supabaseConfigured } from "@/lib/store";
import { requestIp } from "@/lib/request-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!supabaseConfigured()) {
    return NextResponse.json({ error: "Depolama yapılandırılmamış." }, { status: 503 });
  }

  let body: { phone?: string; password?: string; profile?: unknown; goal?: unknown; trainingMode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const phone = normalizePhone(body.phone || "");
  if (!phone) return NextResponse.json({ error: "Telefon numarası geçersiz." }, { status: 400 });

  const password = String(body.password || "");
  const invalidPassword = passwordError(password);
  if (invalidPassword) return NextResponse.json({ error: invalidPassword }, { status: 400 });

  const parsed = parseProfile(body.profile);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (body.goal !== undefined && !isGoal(body.goal)) return NextResponse.json({ error: "Hedef geçersiz." }, { status: 400 });
  if (!isTrainingMode(body.trainingMode)) return NextResponse.json({ error: "Gelişmiş mod geçersiz." }, { status: 400 });

  try {
    // Fail before creating a row: a production account must never be left
    // behind without a cryptographically configured session issuer.
    assertSessionConfiguration();

    const account = await createAccount({
      phone,
      password,
      profile: parsed.profile,
      goal: isGoal(body.goal) ? body.goal : undefined,
      trainingMode: body.trainingMode ?? null,
      signupIpHash: signupRateKey(`ip:${requestIp(req)}`),
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
    if (e instanceof DuplicatePhoneError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof SignupRateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": "86400" } });
    }
    if (e instanceof SessionConfigurationError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[fitmatik] sign-up:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Hesap oluşturulamadı. Tekrar dene." }, { status: 500 });
  }
}

import { cookies } from "next/headers";
import { allowAttempt, authMode, checkPassword, createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth";

function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

export async function POST(req: Request) {
  if (authMode() !== "locked") {
    return Response.json({ error: "Giriş bu ortamda yapılandırılmamış." }, { status: 503 });
  }
  if (!allowAttempt(clientIp(req))) {
    return Response.json({ error: "Çok fazla deneme. 10 dakika sonra tekrar deneyin." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkPassword(password)) {
    return Response.json({ error: "Şifre hatalı." }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}

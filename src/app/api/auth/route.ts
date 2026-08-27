import { NextResponse } from "next/server";
import { COOKIE, expectedToken, pinRequired, pinToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!pinRequired()) return NextResponse.json({ ok: true });

  let pin = "";
  try {
    pin = String(((await req.json()) as { pin?: string }).pin ?? "");
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  if ((await pinToken(pin)) !== (await expectedToken())) {
    return NextResponse.json({ error: "PIN hatalı." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

import { NextResponse } from "next/server";
import { parseProfile, parseTargets, publicAccount, saveAccount, suggestTargets } from "@/lib/accounts";
import { currentAccount } from "@/lib/session";
import { isTheme } from "@/lib/theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });
  return NextResponse.json({ account: publicAccount(account) });
}

/** Ayarlar ekranı: profil, tema ve hedefler buradan güncelleniyor. */
export async function PUT(req: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  let body: { profile?: unknown; theme?: string; targets?: unknown; retarget?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const next = { ...account };

  if (body.profile !== undefined) {
    const parsed = parseProfile(body.profile);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    next.profile = parsed.profile;
    // Kilo/boy/yaş değişince hedefleri kullanıcı istemedikçe ezmiyoruz.
    if (body.retarget) next.targets = suggestTargets(parsed.profile);
  }
  if (body.theme !== undefined && isTheme(body.theme)) next.theme = body.theme;
  if (body.targets !== undefined) next.targets = parseTargets(body.targets);

  try {
    await saveAccount(next);
    return NextResponse.json({ ok: true, account: publicAccount(next) });
  } catch (e) {
    console.error("[fitmatik] me:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Kaydedilemedi. Tekrar dene." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/session";
import { getWallet, listLedger } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The browser can read only the wallet belonging to its verified session. */
export async function GET(req: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Oturum yok." }, { status: 401 });

  const requested = Number(new URL(req.url).searchParams.get("limit") || 50);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), 100) : 50;
  try {
    const [wallet, ledger] = await Promise.all([getWallet(account.id), listLedger(account.id, limit)]);
    return NextResponse.json({ wallet, ledger });
  } catch (error) {
    console.error("[fitmatik] fitcoin:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Fitcoin bilgileri okunamadı." }, { status: 500 });
  }
}

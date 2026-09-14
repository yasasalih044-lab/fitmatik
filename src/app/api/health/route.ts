import { NextResponse } from "next/server";
import { driver, supabaseConfigured } from "@/lib/store";
import { MODEL } from "@/lib/openai";
import { configured as fatsecretConfigured, searchFoods, FatSecretIpError } from "@/lib/fatsecret";
import { assertSessionConfiguration } from "@/lib/accounts";

/** FatSecret'e canlı bir sorgu atıp durumu döndürür — log kazmadan teşhis için. */
async function fatsecretProbe(): Promise<{ ok: boolean; detail: string }> {
  if (!fatsecretConfigured()) return { ok: false, detail: "anahtar tanımlı değil" };
  try {
    const hits = await searchFoods("ekmek", 1);
    return hits.length
      ? { ok: true, detail: `çalışıyor (örnek: ${hits[0].name})` }
      : { ok: false, detail: "istek geçti ama sonuç boş" };
  } catch (e) {
    if (e instanceof FatSecretIpError) {
      return { ok: false, detail: `IP allowlist'te yok: ${e.ip} — platform.fatsecret.com panelinde bu IP'yi ekle` };
    }
    return { ok: false, detail: e instanceof Error ? e.message : "bilinmeyen hata" };
  }
}

/** FatSecret IP allowlist'ine eklenecek adres — sunucunun dışarı çıkarken kullandığı IP. */
async function outboundIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return ((await res.json()) as { ip?: string }).ip ?? null;
  } catch {
    return null;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const store = await driver().catch(() => "unavailable" as const);
  const url = new URL(req.url);
  let sessionConfigured = true;
  try {
    assertSessionConfiguration();
  } catch {
    sessionConfigured = false;
  }
  // Canlı sorgu masraflı değil ama her sağlık kontrolünde gerekmiyor: ?probe=1 ile iste.
  const probe = Boolean(url.searchParams.get("probe"));
  const fatsecret_probe = probe ? await fatsecretProbe() : undefined;
  const outbound_ip = probe ? await outboundIp() : undefined;
  const ok = store === "postgres" && sessionConfigured;
  return NextResponse.json({
    ok,
    app: "fit-matik",
    model: MODEL,
    openai_key: !!process.env.OPENAI_API_KEY,
    supabase: supabaseConfigured(),
    store,
    session_configured: sessionConfigured,
    fatsecret: fatsecretConfigured(),
    fatsecret_probe,
    outbound_ip,
    time: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}

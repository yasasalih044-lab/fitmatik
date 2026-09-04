import { NextResponse } from "next/server";
import { driver, supabaseConfigured } from "@/lib/store";
import { MODEL } from "@/lib/openai";
import { configured as fatsecretConfigured, searchFoods, FatSecretIpError } from "@/lib/fatsecret";

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
  const store = await driver().catch(() => "memory" as const);
  const url = new URL(req.url);
  const outbound_ip = await outboundIp();
  // Canlı sorgu masraflı değil ama her sağlık kontrolünde gerekmiyor: ?probe=1 ile iste.
  const fatsecret_probe = url.searchParams.get("probe") ? await fatsecretProbe() : undefined;
  return NextResponse.json({
    ok: true,
    app: "fit-matik",
    model: MODEL,
    openai_key: !!process.env.OPENAI_API_KEY,
    supabase: supabaseConfigured(),
    store,
    fatsecret: fatsecretConfigured(),
    fatsecret_probe,
    outbound_ip,
    time: new Date().toISOString(),
  });
}

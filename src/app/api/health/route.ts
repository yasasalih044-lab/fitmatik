import { NextResponse } from "next/server";
import { driver, supabaseConfigured } from "@/lib/store";
import { MODEL } from "@/lib/openai";
import { pinRequired } from "@/lib/auth";
import { configured as fatsecretConfigured } from "@/lib/fatsecret";

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

export async function GET() {
  const store = await driver().catch(() => "memory" as const);
  const outbound_ip = await outboundIp();
  return NextResponse.json({
    ok: true,
    app: "fit-matik",
    model: MODEL,
    openai_key: !!process.env.OPENAI_API_KEY,
    supabase: supabaseConfigured(),
    store,
    fatsecret: fatsecretConfigured(),
    outbound_ip,
    pin_protected: pinRequired(),
    time: new Date().toISOString(),
  });
}

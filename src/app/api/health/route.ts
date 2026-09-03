import { NextResponse } from "next/server";
import { driver, supabaseConfigured } from "@/lib/store";
import { MODEL } from "@/lib/openai";
import { pinRequired } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await driver().catch(() => "memory" as const);
  return NextResponse.json({
    ok: true,
    app: "fit-matik",
    model: MODEL,
    openai_key: !!process.env.OPENAI_API_KEY,
    supabase: supabaseConfigured(),
    store,
    pin_protected: pinRequired(),
    time: new Date().toISOString(),
  });
}

import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { THEMES } from "@/lib/theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * public/auth/backgrounds içindeki dosyaları listeler.
 *
 * Klasörü okumak, listeyi kodda tutmaktan iyi: yeni arka plan eklemek için
 * dosyayı klasöre koyup dağıtmak yeterli, kod değişmiyor.
 * Beklenen ad: <tema>-<desktop|mobile>[-<sıra>].<uzantı>
 */
const PATTERN = /^([a-z]+)-(desktop|mobile)(?:-\d+)?\.(png|jpe?g|webp|avif)$/i;

export async function GET() {
  const dir = path.join(process.cwd(), "public", "auth", "backgrounds");
  const out: Record<string, { desktop: string[]; mobile: string[] }> = {};
  for (const t of THEMES) out[t.id] = { desktop: [], mobile: [] };

  try {
    for (const file of await readdir(dir)) {
      const m = PATTERN.exec(file);
      if (!m) continue;
      const [, theme, kind] = m;
      const bucket = out[theme.toLowerCase()];
      if (bucket) bucket[kind.toLowerCase() as "desktop" | "mobile"].push(`/auth/backgrounds/${file}`);
    }
  } catch (e) {
    console.error("[fitmatik] arka planlar okunamadı:", e instanceof Error ? e.message : e);
  }

  for (const t of THEMES) {
    out[t.id].desktop.sort();
    out[t.id].mobile.sort();
  }
  return NextResponse.json(out);
}

import { NextResponse } from "next/server";
import { clampLimit, deleteEntry, listEntries } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Geçerli bir ISO tarihse ISO metnini, değilse undefined döndürür. */
function isoOrUndefined(v: string | null): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function fail(e: unknown, fallback: string) {
  console.error("[fitmatik] entries:", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const entries = await listEntries({
      from: isoOrUndefined(url.searchParams.get("from")),
      to: isoOrUndefined(url.searchParams.get("to")),
      limit: clampLimit(url.searchParams.get("limit")),
    });
    return NextResponse.json({ entries });
  } catch (e) {
    return fail(e, "Kayıtlar okunamadı.");
  }
}

export async function DELETE(req: Request) {
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (!id || !UUID.test(id)) {
    return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  }
  const day = params.get("day");
  try {
    await deleteEntry(id, /^\d{4}-\d{2}-\d{2}$/.test(day || "") ? day! : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e, "Kayıt silinemedi.");
  }
}

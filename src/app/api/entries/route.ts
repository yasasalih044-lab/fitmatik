import { NextResponse } from "next/server";
import { deleteEntry, listEntries } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const entries = await listEntries({
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
    });
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Okuma hatası" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id gerekli." }, { status: 400 });
  try {
    await deleteEntry(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Silme hatası" }, { status: 500 });
  }
}

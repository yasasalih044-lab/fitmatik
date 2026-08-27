import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Entry } from "./types";

export const BUCKET = process.env.SUPABASE_BUCKET || "fitmatik";
const TABLE = "entries";

export function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

/* --- Supabase yokken yerel geliştirme için bellekte tutan yedek sürücü --- */
const memory: Entry[] = [];

export type NewEntry = Omit<Entry, "id" | "created_at">;

export async function insertEntry(e: NewEntry): Promise<Entry> {
  if (!supabaseConfigured()) {
    const row: Entry = { ...e, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    memory.unshift(row);
    return row;
  }
  const { data, error } = await db().from(TABLE).insert(e).select().single();
  if (error) throw new Error(`Supabase kayıt hatası: ${error.message}`);
  return data as Entry;
}

export async function listEntries(opts: { from?: string; to?: string; limit?: number } = {}): Promise<Entry[]> {
  const limit = Math.min(opts.limit ?? 500, 1000);
  if (!supabaseConfigured()) {
    return memory
      .filter((e) => (!opts.from || e.eaten_at >= opts.from) && (!opts.to || e.eaten_at <= opts.to))
      .sort((a, b) => (a.eaten_at < b.eaten_at ? 1 : -1))
      .slice(0, limit);
  }
  let q = db().from(TABLE).select("*").order("eaten_at", { ascending: false }).limit(limit);
  if (opts.from) q = q.gte("eaten_at", opts.from);
  if (opts.to) q = q.lte("eaten_at", opts.to);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase okuma hatası: ${error.message}`);
  return (data || []) as Entry[];
}

export async function deleteEntry(id: string): Promise<void> {
  if (!supabaseConfigured()) {
    const i = memory.findIndex((e) => e.id === id);
    if (i >= 0) memory.splice(i, 1);
    return;
  }
  const { error } = await db().from(TABLE).delete().eq("id", id);
  if (error) throw new Error(`Supabase silme hatası: ${error.message}`);
}

/** Görseli Supabase Storage'a yükler, public URL döndürür. Yapılandırma yoksa null. */
export async function uploadImage(dataUrl: string): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  const [, mime, b64] = m;
  const ext = mime.split("/")[1].replace("jpeg", "jpg");
  const bytes = Buffer.from(b64, "base64");
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const client = db();
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error("[fitmatik] görsel yüklenemedi:", error.message);
    return null;
  }
  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

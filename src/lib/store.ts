import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Entry } from "./types";

export const BUCKET = process.env.SUPABASE_BUCKET || "fitmatik";
const TABLE = "entries";
const LOG_PREFIX = "log";

/** Kayıtların nereye yazıldığı. */
export type Driver = "table" | "storage" | "memory";

export function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/* ------------------------------------------------------------------ */
/* Sürücü seçimi                                                       */
/*                                                                     */
/* `entries` tablosu varsa onu kullan. Tablo yoksa (SQL henüz          */
/* çalıştırılmadı) Supabase Storage'a günlük JSON dosyaları yaz —      */
/* böylece uygulama tabloya bağımlı olmadan kalıcı çalışır. Tablo      */
/* sonradan açılırsa bir sonraki yoklamada kendiliğinden ona geçer.    */
/* ------------------------------------------------------------------ */
let driverCache: { value: Driver; at: number } | null = null;
const DRIVER_TTL_MS = 60_000;

export async function driver(now = Date.now()): Promise<Driver> {
  if (!supabaseConfigured()) return "memory";
  if (driverCache && now - driverCache.at < DRIVER_TTL_MS) return driverCache.value;

  const { error } = await db().from(TABLE).select("id").limit(1);
  const value: Driver = error ? "storage" : "table";
  if (error) console.warn(`[fitmatik] '${TABLE}' tablosu kullanılamıyor (${error.code || error.message}); Storage sürücüsüne geçiliyor.`);
  driverCache = { value, at: now };
  return value;
}

/* --- Yerel geliştirme yedeği (Supabase yapılandırılmamışsa) --------- */
const memory: Entry[] = [];

export type NewEntry = Omit<Entry, "id" | "created_at">;

/* ------------------------------------------------------------------ */
/* Storage sürücüsü — kayıt başına tek dosya: log/<gün>/<id>.json      */
/*                                                                     */
/* Gün başına tek dosya tutup oku-değiştir-yaz yapmak cazip ama        */
/* nesne depoları üzerine yazmada bayat okuma döndürebilir: araya      */
/* giren bir kayıt sessizce kaybolur. Değişmez tek-kayıt dosyaları     */
/* bu sınıfı tamamen ortadan kaldırır.                                 */
/* ------------------------------------------------------------------ */

const DAY_SCAN_LIMIT = 400;
const FETCH_CHUNK = 12;
const DAY_CHUNK = 8;

const dayOf = (iso: string) => iso.slice(0, 10);
const entryPath = (day: string, id: string) => `${LOG_PREFIX}/${day}/${id}.json`;

async function putEntry(row: Entry): Promise<void> {
  const body = new Blob([JSON.stringify(row)], { type: "application/json" });
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(entryPath(dayOf(row.eaten_at), row.id), body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });
  if (error) throw new Error(`Kayıt yazılamadı: ${error.message}`);
}

async function getEntry(path: string): Promise<Entry | null> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as Entry;
  } catch {
    console.error(`[fitmatik] ${path} bozuk JSON, atlandı.`);
    return null;
  }
}

async function listNames(prefix: string, limit: number): Promise<string[]> {
  const { data, error } = await db()
    .storage.from(BUCKET)
    .list(prefix, { limit, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(`Kayıtlar listelenemedi: ${error.message}`);
  return (data || []).map((f) => f.name);
}

/** Gün klasörleri, yeniden eskiye. */
async function listDays(): Promise<string[]> {
  const names = await listNames(LOG_PREFIX, DAY_SCAN_LIMIT);
  return names
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n))
    .sort((a, b) => (a < b ? 1 : -1));
}

/** Bir günün kayıtlarını paralel çeker. */
async function readDayEntries(day: string): Promise<Entry[]> {
  const files = (await listNames(`${LOG_PREFIX}/${day}`, 1000)).filter((n) => n.endsWith(".json"));
  const out: Entry[] = [];
  for (let i = 0; i < files.length; i += FETCH_CHUNK) {
    const batch = await Promise.all(
      files.slice(i, i + FETCH_CHUNK).map((f) => getEntry(`${LOG_PREFIX}/${day}/${f}`)),
    );
    out.push(...batch.filter((e): e is Entry => !!e));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Genel API                                                           */
/* ------------------------------------------------------------------ */

export async function insertEntry(e: NewEntry): Promise<Entry> {
  const d = await driver();

  if (d === "table") {
    const { data, error } = await db().from(TABLE).insert(e).select().single();
    if (error) throw new Error(`Kayıt yazılamadı: ${error.message}`);
    return normalize(data as Entry);
  }

  const row: Entry = { ...e, id: crypto.randomUUID(), created_at: new Date().toISOString() };

  if (d === "memory") {
    memory.unshift(row);
    return row;
  }

  await putEntry(row);
  return row;
}

export async function listEntries(opts: { from?: string; to?: string; limit?: number } = {}): Promise<Entry[]> {
  const limit = clampLimit(opts.limit);
  const inRange = (e: Entry) =>
    (!opts.from || e.eaten_at >= opts.from) && (!opts.to || e.eaten_at <= opts.to);
  const newestFirst = (a: Entry, b: Entry) => (a.eaten_at < b.eaten_at ? 1 : -1);
  const d = await driver();

  if (d === "table") {
    let q = db().from(TABLE).select("*").order("eaten_at", { ascending: false }).limit(limit);
    if (opts.from) q = q.gte("eaten_at", opts.from);
    if (opts.to) q = q.lte("eaten_at", opts.to);
    const { data, error } = await q;
    if (error) throw new Error(`Kayıtlar okunamadı: ${error.message}`);
    return (data || []).map(normalize);
  }

  if (d === "memory") return memory.filter(inRange).sort(newestFirst).slice(0, limit);

  const days = (await listDays()).filter(
    (day) => (!opts.from || day >= dayOf(opts.from)) && (!opts.to || day <= dayOf(opts.to)),
  );

  // Günleri sırayla değil öbekler hâlinde paralel çek; panelde 14+ gün var.
  const out: Entry[] = [];
  for (let i = 0; i < days.length; i += DAY_CHUNK) {
    const batches = await Promise.all(days.slice(i, i + DAY_CHUNK).map(readDayEntries));
    for (const rows of batches) out.push(...rows.filter(inRange));
    if (out.length >= limit) break; // günler yeniden eskiye; yeterince topladık
  }
  return out.sort(newestFirst).slice(0, limit).map(normalize);
}

export async function deleteEntry(id: string, dayHint?: string): Promise<void> {
  const d = await driver();
  let removed: Entry | undefined;

  if (d === "table") {
    const { data, error } = await db().from(TABLE).delete().eq("id", id).select().maybeSingle();
    if (error) throw new Error(`Kayıt silinemedi: ${error.message}`);
    removed = (data as Entry) || undefined;
  } else if (d === "memory") {
    const i = memory.findIndex((e) => e.id === id);
    if (i >= 0) removed = memory.splice(i, 1)[0];
  } else {
    // Gün ipucu varsa tek istekte bul; yoksa en yeni günden başlayarak tara.
    const days = dayHint ? [dayHint, ...(await listDays()).filter((d) => d !== dayHint)] : await listDays();
    for (const day of days) {
      const path = entryPath(day, id);
      const found = await getEntry(path);
      if (!found) continue;
      const { error } = await db().storage.from(BUCKET).remove([path]);
      if (error) throw new Error(`Kayıt silinemedi: ${error.message}`);
      removed = found;
      break;
    }
  }

  if (removed?.image_url) await deleteImage(removed.image_url);
}

/** Kayıt silinince görseli de sil; yoksa kova yetim dosyalarla dolar. */
async function deleteImage(publicUrl: string): Promise<void> {
  const marker = `/object/public/${BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i < 0) return;
  const path = decodeURIComponent(publicUrl.slice(i + marker.length).split("?")[0]);
  const { error } = await db().storage.from(BUCKET).remove([path]);
  if (error) console.error(`[fitmatik] görsel silinemedi (${path}): ${error.message}`);
}

/* --- Genel JSON nesne yardımcıları (hesaplar, profil, hedefler) ---------- */

export async function getJsonObject<T>(path: string): Promise<T | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    console.error(`[fitmatik] ${path} bozuk JSON.`);
    return null;
  }
}

export async function putJsonObject(path: string, value: unknown): Promise<void> {
  if (!supabaseConfigured()) throw new Error("Depolama yapılandırılmamış.");
  const body = new Blob([JSON.stringify(value)], { type: "application/json" });
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(path, body, { contentType: "application/json", cacheControl: "0", upsert: true });
  if (error) throw new Error(`Kayıt yazılamadı: ${error.message}`);
}

export async function removeObject(path: string): Promise<void> {
  if (!supabaseConfigured()) return;
  await db().storage.from(BUCKET).remove([path]);
}

/** Görseli Storage'a yükler, public URL döndürür. Yapılandırma yoksa null. */
export async function uploadImage(dataUrl: string): Promise<string | null> {
  if (!supabaseConfigured()) return null;
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const [, mime, b64] = m;
  const ext = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const bytes = Buffer.from(b64, "base64");
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const client = db();
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    console.error("[fitmatik] görsel yüklenemedi:", error.message);
    return null;
  }
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || null;
}

export function clampLimit(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return 500;
  return Math.min(n, 1000);
}

/** Postgres numeric alanları JS'e string olarak dönebilir; toplamlar bozulmasın. */
function normalize(e: Entry): Entry {
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const int = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };
  return {
    ...e,
    items: (Array.isArray(e.items) ? e.items : []).map((i) => ({
      ...i,
      grams: num((i as { grams?: unknown }).grams),
      protein_g: num((i as { protein_g?: unknown }).protein_g),
      carbs_g: num((i as { carbs_g?: unknown }).carbs_g),
      fat_g: num((i as { fat_g?: unknown }).fat_g),
      barcode: (i as { barcode?: string | null }).barcode ?? null,
    })),
    sources: Array.isArray(e.sources) ? e.sources : [],
    kcal_min: int(e.kcal_min),
    kcal_max: int(e.kcal_max),
    kcal_best: int(e.kcal_best),
    protein_g: num(e.protein_g),
    carbs_g: num(e.carbs_g),
    fat_g: num(e.fat_g),
  };
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Entry } from "./types";

/** New private bucket. Do not point this at the legacy public `fitmatik` bucket. */
export const BUCKET = process.env.SUPABASE_BUCKET || "fitmatik-private";
const ENTRIES_TABLE = "app_entries";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const SIGNED_IMAGE_TTL_SECONDS = 60 * 60;

export class StoreConfigurationError extends Error {
  constructor(message = "Supabase yapılandırılmamış.") {
    super(message);
    this.name = "StoreConfigurationError";
  }
}

export class AccountScopeError extends Error {
  constructor(message = "Hesap kapsamı geçersiz.") {
    super(message);
    this.name = "AccountScopeError";
  }
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;

/** Service-role client; this module is imported only by server code. */
export function supabase(): SupabaseClient {
  if (!supabaseConfigured()) throw new StoreConfigurationError();
  if (!cached) {
    cached = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Compatibility for the health endpoint: there is no Storage or memory fallback. */
export type Driver = "postgres";
export async function driver(): Promise<Driver> {
  const { error } = await supabase().from(ENTRIES_TABLE).select("id").limit(1);
  if (error) throw new Error(`Postgres doğrulanamadı: ${error.message}`);
  return "postgres";
}

export type NewEntry = Omit<Entry, "id" | "created_at" | "image_url"> & {
  /** Private Storage object path, produced by uploadImage. */
  image_path?: string | null;
  /** Transitional input shape; ignored so a public URL can never be persisted. */
  image_url?: string | null;
};

type EntryRow = Omit<Entry, "image_url"> & { account_id: string; image_path: string | null };

function assertAccountId(accountId: string): void {
  if (!UUID.test(accountId)) throw new AccountScopeError();
}

function assertObjectPath(accountId: string, path: string): void {
  if (!path.startsWith(`${accountId}/`) || path.includes("..")) {
    throw new AccountScopeError("Görsel hesabın kapsamı dışında.");
  }
}

/** A signed URL is created only after the entry has already been account-scoped in Postgres. */
async function signedImageUrl(accountId: string, path: string): Promise<string> {
  assertObjectPath(accountId, path);
  const { data, error } = await supabase().storage.from(BUCKET).createSignedUrl(path, SIGNED_IMAGE_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(`Görsel bağlantısı oluşturulamadı: ${error?.message || "bilinmeyen hata"}`);
  return data.signedUrl;
}

async function hydrate(row: EntryRow): Promise<Entry> {
  const image_url = row.image_path ? await signedImageUrl(row.account_id, row.image_path) : null;
  return normalize({ ...row, image_url });
}

/**
 * Insert a meal into the caller's account only. The one-argument signature is
 * retained temporarily so a stale route still type-checks, but it always
 * throws at runtime rather than falling back to a global entry store.
 */
export function insertEntry(entry: NewEntry): Promise<never>;
export function insertEntry(accountId: string, entry: NewEntry): Promise<Entry>;
export async function insertEntry(accountIdOrEntry: string | NewEntry, maybeEntry?: NewEntry): Promise<Entry> {
  if (typeof accountIdOrEntry !== "string" || !maybeEntry) {
    throw new AccountScopeError("Kayıt eklemek için doğrulanmış hesap gerekli.");
  }
  const accountId = accountIdOrEntry;
  const entry = maybeEntry;
  assertAccountId(accountId);
  if (entry.image_path) assertObjectPath(accountId, entry.image_path);
  const { image_url, image_path, ...columns } = entry;
  void image_url;
  const { data, error } = await supabase()
    .from(ENTRIES_TABLE)
    .insert({ ...columns, account_id: accountId, image_path: image_path || null })
    .select("*")
    .single();
  if (error) throw new Error(`Kayıt yazılamadı: ${error.message}`);
  return hydrate(data as EntryRow);
}

export async function listEntries(
  accountId: string,
  opts: { from?: string; to?: string; limit?: number } = {},
): Promise<Entry[]> {
  assertAccountId(accountId);
  let query = supabase()
    .from(ENTRIES_TABLE)
    .select("*")
    .eq("account_id", accountId)
    .order("eaten_at", { ascending: false })
    .limit(clampLimit(opts.limit));
  if (opts.from) query = query.gte("eaten_at", opts.from);
  if (opts.to) query = query.lte("eaten_at", opts.to);
  const { data, error } = await query;
  if (error) throw new Error(`Kayıtlar okunamadı: ${error.message}`);
  return Promise.all((data || []).map((row) => hydrate(row as EntryRow)));
}

/** Returns a single entry only when it belongs to the verified account. */
export async function getEntry(accountId: string, id: string): Promise<Entry | null> {
  assertAccountId(accountId);
  if (!UUID.test(id)) throw new AccountScopeError("Kayıt kimliği geçersiz.");
  const { data, error } = await supabase()
    .from(ENTRIES_TABLE)
    .select("*")
    .eq("account_id", accountId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Kayıt okunamadı: ${error.message}`);
  return data ? hydrate(data as EntryRow) : null;
}

/** Delete only a row owned by the caller. A foreign ID behaves as not found. */
export async function deleteEntry(accountId: string, id: string): Promise<boolean> {
  assertAccountId(accountId);
  if (!UUID.test(id)) throw new Error("Geçersiz kayıt kimliği.");
  const { data, error } = await supabase()
    .from(ENTRIES_TABLE)
    .delete()
    .eq("account_id", accountId)
    .eq("id", id)
    .select("image_path")
    .maybeSingle();
  if (error) throw new Error(`Kayıt silinemedi: ${error.message}`);
  if (!data) return false;

  const imagePath = (data as { image_path?: string | null }).image_path;
  if (imagePath) {
    try {
      assertObjectPath(accountId, imagePath);
      const { error: imageError } = await supabase().storage.from(BUCKET).remove([imagePath]);
      if (imageError) console.error("[fitmatik] yetim görsel silinemedi:", imageError.message);
    } catch (error) {
      console.error("[fitmatik] yetim görsel silinemedi:", error instanceof Error ? error.message : error);
    }
  }
  return true;
}

/**
 * Uploads a data URL to a private per-account key. The returned value is an
 * object path, not a URL and therefore cannot accidentally become public.
 */
/** As above, a stale one-argument caller fails closed instead of uploading globally. */
export function uploadImage(dataUrl: string): Promise<never>;
export function uploadImage(accountId: string, dataUrl: string): Promise<string>;
export async function uploadImage(accountIdOrDataUrl: string, maybeDataUrl?: string): Promise<string> {
  if (!maybeDataUrl) throw new AccountScopeError("Görsel yüklemek için doğrulanmış hesap gerekli.");
  const accountId = accountIdOrDataUrl;
  const dataUrl = maybeDataUrl;
  assertAccountId(accountId);
  const match = /^data:(image\/(?:jpeg|png|webp|avif|heic));base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("Geçerli bir görsel yükle.");
  const [, mime, base64] = match;
  const bytes = Buffer.from(base64.replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Görsel çok büyük. Daha küçük bir fotoğraf dene.");

  const ext = mime.toLowerCase().replace("image/", "").replace("jpeg", "jpg");
  const path = `${accountId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage.from(BUCKET).upload(path, bytes, {
    contentType: mime.toLowerCase(),
    cacheControl: "private, max-age=0",
    upsert: false,
  });
  if (error) throw new Error(`Görsel yüklenemedi: ${error.message}`);
  return path;
}

/** Removes a private upload which was never linked to an entry transaction. */
export async function discardUnlinkedImage(accountId: string, path: string): Promise<void> {
  assertAccountId(accountId);
  assertObjectPath(accountId, path);
  const { error } = await supabase().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Yetim görsel silinemedi: ${error.message}`);
}

export function clampLimit(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 500;
  return Math.min(n, 1000);
}

/** PostgREST can return Postgres numerics as strings; UI totals expect numbers. */
function normalize(entry: Entry): Entry {
  const numberOrNull = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
  const integer = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  };
  return {
    ...entry,
    items: (Array.isArray(entry.items) ? entry.items : []).map((item) => ({
      ...item,
      grams: numberOrNull((item as { grams?: unknown }).grams),
      protein_g: numberOrNull((item as { protein_g?: unknown }).protein_g),
      carbs_g: numberOrNull((item as { carbs_g?: unknown }).carbs_g),
      fat_g: numberOrNull((item as { fat_g?: unknown }).fat_g),
      barcode: (item as { barcode?: string | null }).barcode ?? null,
    })),
    sources: Array.isArray(entry.sources) ? entry.sources : [],
    kcal_min: integer(entry.kcal_min),
    kcal_max: integer(entry.kcal_max),
    kcal_best: integer(entry.kcal_best),
    protein_g: numberOrNull(entry.protein_g),
    carbs_g: numberOrNull(entry.carbs_g),
    fat_g: numberOrNull(entry.fat_g),
  };
}

/* ------------------------------------------------------------------ */
/* Fitcoin data helpers for protected routes and /api/analyze          */
/* ------------------------------------------------------------------ */

export type FitcoinWallet = {
  available_fitcoin: number;
  reserved_fitcoin: number;
  lifetime_spent_fitcoin: number;
  created_at: string;
  updated_at: string;
};

export type FitcoinLedgerItem = {
  id: string;
  analysis_run_id: string | null;
  kind: "initial_grant" | "reservation" | "settlement" | "release" | "adjustment";
  available_delta_fitcoin: number;
  reserved_delta_fitcoin: number;
  available_balance_fitcoin: number;
  reserved_balance_fitcoin: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

const toNumber = (value: unknown) => Number(value ?? 0);

function walletFromRow(row: Record<string, unknown>): FitcoinWallet {
  return {
    available_fitcoin: toNumber(row.available_fitcoin),
    reserved_fitcoin: toNumber(row.reserved_fitcoin),
    lifetime_spent_fitcoin: toNumber(row.lifetime_spent_fitcoin),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getWallet(accountId: string): Promise<FitcoinWallet> {
  assertAccountId(accountId);
  const { data, error } = await supabase()
    .from("fitcoin_wallets")
    .select("available_fitcoin,reserved_fitcoin,lifetime_spent_fitcoin,created_at,updated_at")
    .eq("account_id", accountId)
    .single();
  if (error) throw new Error(`Fitcoin bakiyesi okunamadı: ${error.message}`);
  return walletFromRow(data as Record<string, unknown>);
}

export async function listLedger(accountId: string, limit = 50): Promise<FitcoinLedgerItem[]> {
  assertAccountId(accountId);
  const { data, error } = await supabase()
    .from("fitcoin_ledger")
    .select("id,analysis_run_id,kind,available_delta_fitcoin,reserved_delta_fitcoin,available_balance_fitcoin,reserved_balance_fitcoin,metadata,created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Math.floor(limit), 1), 100));
  if (error) throw new Error(`Fitcoin geçmişi okunamadı: ${error.message}`);
  return (data || []).map((row) => {
    const value = row as Record<string, unknown>;
    return {
      id: String(value.id),
      analysis_run_id: value.analysis_run_id ? String(value.analysis_run_id) : null,
      kind: value.kind as FitcoinLedgerItem["kind"],
      available_delta_fitcoin: toNumber(value.available_delta_fitcoin),
      reserved_delta_fitcoin: toNumber(value.reserved_delta_fitcoin),
      available_balance_fitcoin: toNumber(value.available_balance_fitcoin),
      reserved_balance_fitcoin: toNumber(value.reserved_balance_fitcoin),
      metadata: (value.metadata || {}) as Record<string, unknown>,
      created_at: String(value.created_at),
    };
  });
}

export type AnalysisRun = {
  id: string;
  status: "reserved" | "processing" | "succeeded" | "failed" | "rejected";
  reserved_fitcoin: number;
  charged_fitcoin: number;
  entry_id: string | null;
  result_json: unknown;
  error: string | null;
  provider_cost_status: string | null;
  created_at: string;
  updated_at: string;
};

function analysisRunFromRow(row: Record<string, unknown>): AnalysisRun {
  return {
    id: String(row.id),
    status: row.status as AnalysisRun["status"],
    reserved_fitcoin: toNumber(row.reserved_fitcoin),
    charged_fitcoin: toNumber(row.charged_fitcoin),
    entry_id: row.entry_id ? String(row.entry_id) : null,
    result_json: row.result_json ?? null,
    error: row.error ? String(row.error) : null,
    provider_cost_status: row.provider_cost_status ? String(row.provider_cost_status) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getAnalysisRun(accountId: string, runId: string): Promise<AnalysisRun | null> {
  assertAccountId(accountId);
  if (!UUID.test(runId)) throw new AccountScopeError("Analiz kimliği geçersiz.");
  const { data, error } = await supabase()
    .from("analysis_runs")
    .select("id,status,reserved_fitcoin,charged_fitcoin,entry_id,result_json,error,provider_cost_status,created_at,updated_at")
    .eq("account_id", accountId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`Analiz kaydı okunamadı: ${error.message}`);
  return data ? analysisRunFromRow(data as Record<string, unknown>) : null;
}

export type BeginAnalysis = {
  analysis_run_id: string;
  run_status: AnalysisRun["status"];
  sufficient: boolean;
  replayed: boolean;
  available_fitcoin: number;
  reserved_fitcoin: number;
  reserved_amount_fitcoin: number;
};

export async function beginAnalysis(
  accountId: string,
  idempotencyKey: string,
  requestDigest: string,
  reserveFitcoin: number,
): Promise<BeginAnalysis> {
  assertAccountId(accountId);
  const { data, error } = await supabase().rpc("fitcoin_begin_analysis", {
    p_account_id: accountId,
    p_idempotency_key: idempotencyKey,
    p_request_digest: requestDigest,
    p_reserve_fitcoin: reserveFitcoin,
  });
  if (error) throw new Error(`Fitcoin rezervasyonu yapılamadı: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Fitcoin rezervasyonu boş yanıt döndü.");
  const value = row as Record<string, unknown>;
  return {
    analysis_run_id: String(value.analysis_run_id),
    run_status: value.run_status as AnalysisRun["status"],
    sufficient: Boolean(value.sufficient),
    replayed: Boolean(value.replayed),
    available_fitcoin: toNumber(value.available_fitcoin),
    reserved_fitcoin: toNumber(value.reserved_fitcoin),
    reserved_amount_fitcoin: toNumber(value.reserved_amount_fitcoin),
  };
}

export async function claimAnalysis(accountId: string, runId: string): Promise<{ claimed: boolean; run_status: AnalysisRun["status"] }> {
  assertAccountId(accountId);
  const { data, error } = await supabase().rpc("fitcoin_claim_analysis", {
    p_account_id: accountId,
    p_analysis_run_id: runId,
  });
  if (error) throw new Error(`Analiz başlatılamadı: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Analiz başlatma yanıtı boş.");
  return { claimed: Boolean(row.claimed), run_status: row.run_status as AnalysisRun["status"] };
}

export type FinalizedAnalysis = {
  entry_id: string | null;
  run_status: AnalysisRun["status"];
  charged_fitcoin: number;
  available_fitcoin: number;
  reserved_fitcoin: number;
};

/**
 * Atomic success path for `/api/analyze`: receipt evidence, optional scoped
 * entry, wallet settlement, run result, and immutable ledger move together.
 */
export async function finalizeAnalysis(
  accountId: string,
  runId: string,
  chargedFitcoin: number,
  entry: NewEntry | null,
  receipts: UsageReceiptInput[],
  result: unknown,
  providerCostStatus = "recorded",
): Promise<FinalizedAnalysis> {
  assertAccountId(accountId);
  let entryPayload: Record<string, unknown> | null = null;
  if (entry) {
    if (entry.image_path) assertObjectPath(accountId, entry.image_path);
    const { image_url, ...privateEntry } = entry;
    void image_url;
    entryPayload = privateEntry;
  }
  const { data, error } = await supabase().rpc("fitcoin_finalize_analysis", {
    p_account_id: accountId,
    p_analysis_run_id: runId,
    p_charged_fitcoin: chargedFitcoin,
    p_entry: entryPayload,
    p_receipts: receipts,
    p_result_json: result,
    p_provider_cost_status: providerCostStatus,
  });
  if (error) throw new Error(`Analiz sonucu kaydedilemedi: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Analiz sonuçlandırma yanıtı boş.");
  return {
    entry_id: row.entry_id ? String(row.entry_id) : null,
    run_status: row.run_status as AnalysisRun["status"],
    charged_fitcoin: toNumber(row.charged_fitcoin),
    available_fitcoin: toNumber(row.available_fitcoin),
    reserved_fitcoin: toNumber(row.reserved_fitcoin),
  };
}

export async function failAnalysis(
  accountId: string,
  runId: string,
  errorMessage: string,
  providerCostStatus = "not_charged",
): Promise<{ run_status: AnalysisRun["status"]; available_fitcoin: number; reserved_fitcoin: number }> {
  assertAccountId(accountId);
  const { data, error } = await supabase().rpc("fitcoin_fail_analysis", {
    p_account_id: accountId,
    p_analysis_run_id: runId,
    p_error: errorMessage,
    p_provider_cost_status: providerCostStatus,
  });
  if (error) throw new Error(`Fitcoin rezervasyonu iade edilemedi: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) throw new Error("Fitcoin iade yanıtı boş.");
  return {
    run_status: row.run_status as AnalysisRun["status"],
    available_fitcoin: toNumber(row.available_fitcoin),
    reserved_fitcoin: toNumber(row.reserved_fitcoin),
  };
}

export type UsageReceiptInput = {
  stage: "parse" | "research";
  response_id?: string | null;
  requested_model: string;
  model: string;
  tool_type?: string | null;
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  total_tokens?: number;
  web_search_calls?: number;
  cost_nano_usd: number;
  fitcoin_units: number;
  rate_card_version: string;
  metadata?: Record<string, unknown>;
};

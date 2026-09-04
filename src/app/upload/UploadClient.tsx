"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, PencilLine, Sparkles } from "lucide-react";
import RangeBar from "@/components/RangeBar";
import ItemLines from "@/components/ItemLines";
import TokenMeter from "@/components/TokenMeter";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
import { ShiningText } from "@/components/ui/shining-text";
import { confidenceLabel, currentDayStart, kcal, todayKey, dayKey } from "@/lib/format";
import type { AnalyzeResult, Entry, TokenUsage } from "@/lib/types";

type Mode = "text" | "image";
type Phase = "idle" | "parsing" | "researching";

const EXAMPLES = [
  "iki dilim ekmek, bir haşlanmış yumurta ve çay",
  "orta boy tavuk döner dürüm + ayran",
  "bir avuç ceviz ve bir muz",
];

/** iPhone fotoğrafları büyük gelir; yollamadan önce küçült. */
async function compress(file: File, maxEdge = 1400, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("Fotoğraf okunamadı."));
      r.readAsDataURL(file);
    });
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export default function UploadClient() {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string>("");
  const [todayTotal, setTodayTotal] = useState<number | null>(null);
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [sessionUsage, setSessionUsage] = useState<TokenUsage>({ input: 0, output: 0, total: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const busy = phase !== "idle";

  useEffect(() => {
    void refreshToday();
  }, []);

  async function refreshToday() {
    try {
      // Yalnızca içinde bulunduğumuz günlük bloğu iste.
      const start = currentDayStart();
      const res = await fetch(`/api/entries?from=${encodeURIComponent(start.toISOString())}&limit=100`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const { entries } = (await res.json()) as { entries: Entry[] };
      const today = todayKey();
      setTodayTotal(entries.filter((e) => dayKey(e.eaten_at) === today).reduce((a, e) => a + e.kcal_best, 0));
    } catch {
      /* toplam gösterilemezse ekleme akışı yine de çalışır */
    }
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      setImage(await compress(file));
      setMode("image");
    } catch {
      setError("Bu fotoğraf okunamadı. Başka bir kare dene.");
    }
  }

  async function submit() {
    if (busy) return;
    setError("");
    setResult(null);
    setEntry(null);
    setPhase("parsing");
    const toResearch = setTimeout(() => setPhase("researching"), 5000);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: mode, text, image: mode === "image" ? image : undefined }),
        signal: AbortSignal.timeout(280_000),
      });
      // Ara katman HTML hata sayfası döndürebilir; res.json() tek başına güvenli değil.
      const raw = await res.text();
      let data: { result?: AnalyzeResult; entry?: Entry | null; error?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Sunucudan beklenmeyen yanıt geldi (${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error || `İstek başarısız (${res.status}).`);
      setResult(data.result!);
      setEntry(data.entry ?? null);
      const u = data.result?.usage;
      if (u) {
        setLastUsage(u);
        setSessionUsage((prev) => ({
          input: prev.input + u.input,
          output: prev.output + u.output,
          total: prev.total + u.total,
        }));
      }
      if (data.entry) void refreshToday();
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
      setError(isTimeout ? "Araştırma çok uzun sürdü, tekrar dene." : e instanceof Error ? e.message : "Bir şeyler ters gitti.");
    } finally {
      clearTimeout(toResearch);
      setPhase("idle");
    }
  }

  async function removeEntry() {
    if (!entry) return;
    const res = await fetch(`/api/entries?id=${entry.id}&day=${entry.eaten_at.slice(0, 10)}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Kayıt silinemedi. Günlük sekmesinden tekrar dene.");
      return;
    }
    reset();
    void refreshToday();
  }

  function reset() {
    setResult(null);
    setEntry(null);
    setError("");
    setText("");
    setImage("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const canSubmit = mode === "text" ? text.trim().length > 1 : !!image;

  return (
    <div className="meal-workspace">
      <TokenMeter last={lastUsage} session={sessionUsage} />

      <section className="meal-hero rise" aria-labelledby="meal-title">
        <div className="meal-hero__copy">
          <p className="meal-eyebrow"><Sparkles size={13} strokeWidth={1.8} aria-hidden /> BESLENME GÜNLÜĞÜ</p>
          <h1 id="meal-title">Yemeğini ekle.<br /><span>Ritmin sende kalsın.</span></h1>
          <p>Ne yediğini yaz ya da paketin fotoğrafını yükle. Fit-matik kalan işi senin için araştırsın.</p>
        </div>
        <div className="meal-total" aria-live="polite">
          <p>BUGÜN</p>
          <strong>{todayTotal === null ? "—" : kcal(todayTotal)}</strong>
          <span>kcal kaydedildi</span>
        </div>
      </section>

      <section className="meal-composer rise" aria-label="Yeni beslenme kaydı">
        <div className="meal-composer__heading">
          <div>
            <p className="eyebrow">YENİ KAYIT</p>
            <h2>Ne yedin?</h2>
          </div>
          <p>Yazıyla anlat ya da paket bilgisini ekle.</p>
        </div>

        <div className="meal-mode-switch" role="tablist" aria-label="Kayıt yöntemi">
          {([
            ["text", "Yazıyla"],
            ["image", "Paket fotoğrafı"],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              disabled={busy}
              className={mode === m ? "is-active" : ""}
            >
              {m === "text" ? <PencilLine size={16} strokeWidth={1.8} aria-hidden /> : <Camera size={16} strokeWidth={1.8} aria-hidden />}
              {label}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <div className="meal-entry">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              disabled={busy}
              placeholder="Örn: iki dilim ekmek, bir haşlanmış yumurta ve çay"
              className="meal-textarea"
            />
            <div className="meal-examples" aria-label="Örnek kayıtlar">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setText(ex)} disabled={busy}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="meal-entry">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickFile} className="hidden" />
            {image ? (
              <div className="meal-photo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Yüklenen paket fotoğrafı" />
                <div>
                  <span><Camera size={15} strokeWidth={1.8} aria-hidden /> FOTOĞRAF HAZIR</span>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>Değiştir</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="meal-photo-picker">
                <span><Camera size={22} strokeWidth={1.6} aria-hidden /></span>
                <strong>Paketin fotoğrafını çek</strong>
                <small>Besin değerleri tablosu net görünsün.</small>
              </button>
            )}
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              placeholder="Not (isteğe bağlı): yarısını yedim, 2 paket…"
              className="meal-note"
            />
          </div>
        )}

        <div className="meal-action">
          <p>{canSubmit ? "Hazır olduğunda hesaplamayı başlat." : mode === "text" ? "Yemeğini birkaç kelimeyle anlat." : "Önce paket fotoğrafını ekle."}</p>
          <LiquidMetalButton
            label={busy ? "Hesaplanıyor…" : "Kalorini hesapla"}
            onClick={submit}
            disabled={!canSubmit || busy}
            fullWidth
          />
        </div>
      </section>

      <div className="meal-feedback">
        {busy && (
          <div className="meal-thinking rise">
            <ShiningText text={phase === "parsing" ? "Yemeğin analiz ediliyor…" : "Kalori aralığı araştırılıyor…"} />
            <Step active={phase === "parsing"} done={phase === "researching"} label="Ne yediğin ayrıştırılıyor" />
            <Step active={phase === "researching"} done={false} label="İnternetten kalori aralığı toplanıyor" />
          </div>
        )}

        {error && (
          <div className="rise rounded-[14px] border border-[var(--accent-border)] bg-[var(--accent-wash)] p-4">
            <p className="eyebrow mb-1 text-[var(--red)]">Olmadı</p>
            <p className="text-[14px] leading-snug">{error}</p>
          </div>
        )}

        {result && (
          <div ref={resultRef}>
            {result.rejected ? (
              <div className="card rise space-y-3 p-4">
                <p className="eyebrow">Kaydedilmedi</p>
                <p className="text-[15px] leading-snug">{result.rejected.reason}</p>
                <button type="button" onClick={() => setMode("text")} className="btn btn-ghost w-full py-2.5 text-sm">
                  Yazıyla gir
                </button>
              </div>
            ) : (
              <ResultCard result={result} saved={!!entry} onDelete={removeEntry} onNew={reset} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          done ? "bg-[var(--red-ink)]" : active ? "bg-[var(--ink)] pulse" : "bg-[var(--rule)]"
        }`}
      />
      <span className={`text-[13px] ${active ? "text-[var(--ink)]" : done ? "text-[var(--muted)]" : "text-[var(--faint)]"}`}>
        {label}
      </span>
    </div>
  );
}

function ResultCard({
  result,
  saved,
  onDelete,
  onNew,
}: {
  result: AnalyzeResult;
  saved: boolean;
  onDelete: () => void;
  onNew: () => void;
}) {
  return (
    <div className="card rise divide-y divide-[var(--rule)]">
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{result.title}</p>
            <p className="figure mt-1.5 text-[54px]">
              {kcal(result.kcal_best)}
              <span className="mono ml-2 align-top text-[12px] font-normal text-[var(--muted)]">kcal</span>
            </p>
          </div>
          <span className="eyebrow rounded-full border border-[var(--rule)] px-2 py-1">
            {confidenceLabel(result.confidence)}
          </span>
        </div>

        <RangeBar min={result.kcal_min} max={result.kcal_max} best={result.kcal_best} />

        <p className="text-[15px] leading-snug text-[var(--ink)]">{result.verdict}</p>
      </div>

      {result.items.length > 0 && <ItemLines items={result.items} />}

      {(result.macros.protein_g !== null || result.macros.carbs_g !== null || result.macros.fat_g !== null) && (
        <div className="grid grid-cols-3 divide-x divide-[var(--rule)]">
          {([
            ["Protein", result.macros.protein_g],
            ["Karbonhidrat", result.macros.carbs_g],
            ["Yağ", result.macros.fat_g],
          ] as const).map(([label, v]) => (
            <div key={label} className="px-3 py-3 text-center">
              <p className="eyebrow">{label}</p>
              <p className="mono mt-1 text-[15px]">{v === null ? "—" : `${(Math.round(v * 10) / 10).toLocaleString("tr-TR")} g`}</p>
            </div>
          ))}
        </div>
      )}

      {result.sources.length > 0 && (
        <div className="space-y-1.5 p-4">
          <p className="eyebrow">Kaynaklar</p>
          {result.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block truncate text-[12px] text-[var(--red-ink)] underline underline-offset-2"
            >
              {s.title}
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 p-3">
        <span className="eyebrow pl-1">{saved ? "Günlüğe yazıldı" : "Kaydedilmedi"}</span>
        <div className="flex gap-2">
          {saved && (
            <button onClick={onDelete} className="btn btn-quiet text-[13px]">
              Sil
            </button>
          )}
          <button onClick={onNew} className="btn btn-ghost px-3 py-2 text-[13px]">
            Yeni kayıt
          </button>
        </div>
      </div>
    </div>
  );
}

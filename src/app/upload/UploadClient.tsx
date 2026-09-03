"use client";

import { useEffect, useRef, useState } from "react";
import RangeBar from "@/components/RangeBar";
import { confidenceLabel, kcal, todayKey, dayKey } from "@/lib/format";
import type { AnalyzeResult, Entry } from "@/lib/types";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const busy = phase !== "idle";

  useEffect(() => {
    void refreshToday();
  }, []);

  async function refreshToday() {
    try {
      // Yalnızca bugünü iste — depolama sürücüsünde iş yükünü sınırlar.
      const start = new Date();
      start.setHours(0, 0, 0, 0);
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
    <div className="space-y-5 pb-10">
      {/* Bugünkü toplam — kayıt eklemenin neden önemli olduğunu hep göster */}
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Bugün</p>
        <p className="mono text-sm text-[var(--muted)]">
          {todayTotal === null ? "—" : `${kcal(todayTotal)} kcal`}
        </p>
      </div>

      <div className="flex gap-1 rounded-md border border-[var(--rule)] bg-[var(--sunk)] p-1">
        {([
          ["text", "Yazıyla"],
          ["image", "Paket fotoğrafı"],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={busy}
            className={`btn flex-1 rounded-[5px] py-2.5 text-sm ${
              mode === m ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "text" ? (
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            disabled={busy}
            placeholder="Ne yedin? Örn: iki dilim ekmek, bir haşlanmış yumurta ve çay"
            className="resize-none text-[16px]"
          />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setText(ex)}
                disabled={busy}
                className="btn btn-ghost shrink-0 whitespace-nowrap px-3 py-1.5 text-[12px] font-normal text-[var(--muted)]"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pickFile} className="hidden" />
          {image ? (
            <div className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Yüklenen paket fotoğrafı" className="max-h-64 w-full object-contain bg-[var(--sunk)]" />
              <div className="flex items-center justify-between border-t border-[var(--rule)] px-3 py-2">
                <span className="eyebrow">Fotoğraf hazır</span>
                <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn btn-quiet text-[12px]">
                  Değiştir
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="card flex w-full flex-col items-center gap-1.5 px-4 py-10 text-center"
            >
              <span className="display text-[15px]">Paketin fotoğrafını çek</span>
              <span className="max-w-[34ch] text-[13px] leading-snug text-[var(--muted)]">
                Besin değerleri tablosu görünsün. Tabak yemeği yerine yazı sekmesini kullan.
              </span>
            </button>
          )}
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            placeholder="Not (isteğe bağlı): yarısını yedim, 2 paket…"
            className="text-[16px]"
          />
        </div>
      )}

      <button onClick={submit} disabled={!canSubmit || busy} className="btn btn-primary w-full">
        {busy ? "Hesaplanıyor…" : "Kalorisini hesapla"}
      </button>

      {busy && (
        <div className="card rise space-y-2.5 p-4">
          <Step active={phase === "parsing"} done={phase === "researching"} label="Ne yediğin ayrıştırılıyor" />
          <Step active={phase === "researching"} done={false} label="İnternetten kalori aralığı toplanıyor" />
        </div>
      )}

      {error && (
        <div className="rise rounded-[14px] border border-[var(--red)]/40 bg-[var(--red)]/10 p-4">
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
              <button onClick={() => setMode("text")} className="btn btn-ghost w-full py-2.5 text-sm">
                Yazıyla gir
              </button>
            </div>
          ) : (
            <ResultCard result={result} saved={!!entry} onDelete={removeEntry} onNew={reset} />
          )}
        </div>
      )}
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

      {result.items.length > 0 && (
        <ul className="divide-y divide-[var(--rule)]">
          {result.items.map((it, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px]">{it.name}</p>
                <p className="mt-0.5 text-[12px] text-[var(--faint)]">
                  {it.qty}
                  {it.note ? ` · ${it.note}` : ""}
                </p>
              </div>
              <p className="mono shrink-0 text-[14px] text-[var(--ink)]">{kcal(it.kcal_best)}</p>
            </li>
          ))}
        </ul>
      )}

      {(result.macros.protein_g !== null || result.macros.carbs_g !== null || result.macros.fat_g !== null) && (
        <div className="grid grid-cols-3 divide-x divide-[var(--rule)]">
          {([
            ["Protein", result.macros.protein_g],
            ["Karbonhidrat", result.macros.carbs_g],
            ["Yağ", result.macros.fat_g],
          ] as const).map(([label, v]) => (
            <div key={label} className="px-3 py-3 text-center">
              <p className="eyebrow">{label}</p>
              <p className="mono mt-1 text-[15px]">{v === null ? "—" : `${Math.round(v)} g`}</p>
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

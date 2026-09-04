"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RangeBar from "@/components/RangeBar";
import ItemLines from "@/components/ItemLines";
import DailyProgress from "@/components/DailyProgress";
import { readTargets, type Targets, DEFAULT_TARGETS } from "@/lib/targets";
import { confidenceLabel, dayKey, dayLabel, kcal, shiftKey, timeLabel, todayKey } from "@/lib/format";
import type { Entry } from "@/lib/types";

const gram = (v: number | null) =>
  v === null ? "—" : `${(Math.round(v * 10) / 10).toLocaleString("tr-TR")} g`;

type Day = { key: string; entries: Entry[]; best: number; min: number; max: number };

export default function DashboardClient() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);

  useEffect(() => setTargets(readTargets()), []);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      // Son 60 günü iste; panelde gösterilen her şeyi kapsar, iş yükünü sınırlar.
      const from = new Date();
      from.setDate(from.getDate() - 60);
      from.setHours(0, 0, 0, 0);
      const res = await fetch(`/api/entries?from=${encodeURIComponent(from.toISOString())}&limit=400`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { entries?: Entry[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Kayıtlar okunamadı.");
      setEntries(data.entries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıtlar okunamadı.");
      setEntries([]);
    }
  }

  async function remove(id: string, eatenAt: string) {
    const before = entries;
    setEntries((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    const res = await fetch(`/api/entries?id=${id}&day=${eatenAt.slice(0, 10)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setEntries(before); // silme başarısız — satırı geri koy
      setError("Kayıt silinemedi.");
    }
  }

  const days: Day[] = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries || []) {
      const k = dayKey(e.eaten_at);
      const arr = map.get(k);
      if (arr) arr.push(e);
      else map.set(k, [e]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({
        key,
        entries: list.sort((a, b) => (a.eaten_at < b.eaten_at ? 1 : -1)),
        best: list.reduce((s, e) => s + e.kcal_best, 0),
        min: list.reduce((s, e) => s + e.kcal_min, 0),
        max: list.reduce((s, e) => s + e.kcal_max, 0),
      }));
  }, [entries]);

  const today = days.find((d) => d.key === todayKey());
  const todayTotals = {
    kcal: today?.best ?? 0,
    protein_g: sumOf(today, "protein_g"),
    carbs_g: sumOf(today, "carbs_g"),
    fat_g: sumOf(today, "fat_g"),
  };
  const chart = useMemo(() => lastDays(days, 14), [days]);
  const peak = Math.max(1, ...chart.map((d) => d.best));

  if (entries === null) {
    return <p className="mono pt-8 text-center text-[13px] text-[var(--faint)]">Yükleniyor…</p>;
  }

  const previous = days.filter((d) => d.key !== todayKey());

  return (
    <div className="space-y-6 pb-12">
      {/* Bugünün toplamı — aynı imza çubuğuyla, çünkü bir gün de bir aralıktır */}
      <section className="space-y-3">
        <div className="card space-y-4 p-4">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Bugün</p>
            <p className="mono text-[11px] text-[var(--faint)]">
              {today ? `${today.entries.length} kayıt` : "kayıt yok"}
            </p>
          </div>
          <p className="figure text-[62px]">
            {kcal(today?.best ?? 0)}
            <span className="mono ml-2 align-top text-[12px] font-normal text-[var(--muted)]">kcal</span>
          </p>
          <RangeBar
            min={today?.min ?? 0}
            max={today?.max ?? 0}
            best={today?.best ?? 0}
            scaleMax={Math.max(peak, today?.max ?? 0)}
          />
        </div>

        <DailyProgress totals={todayTotals} targets={targets} onChange={setTargets} />

        {today ? (
          <DayList day={today} onDelete={remove} open={open} setOpen={setOpen} />
        ) : (
          <div className="card space-y-3 px-4 py-8 text-center">
            <p className="text-[13px] leading-snug text-[var(--muted)]">
              Bugün henüz kayıt yok. Ne yediğini yaz ya da bir paketin fotoğrafını çek.
            </p>
            <Link href="/upload" className="btn btn-primary inline-flex px-5 py-2.5 text-sm">
              Kayıt ekle
            </Link>
          </div>
        )}
      </section>

      {error && <p className="text-[13px] text-[var(--red)]">{error}</p>}

      <section className="space-y-2.5">
        <p className="eyebrow">Son 14 gün</p>
        <div className="flex h-28 gap-[3px]">
          {chart.map((d) => (
            <div key={d.key} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-[3px] ${
                    d.key === todayKey() ? "bg-[var(--red)]" : d.best ? "bg-[var(--ink)]/25" : "bg-[var(--sunk)]"
                  }`}
                  style={{ height: `${Math.max(2, (d.best / peak) * 100)}%` }}
                  title={`${dayLabel(d.key)} · ${kcal(d.best)} kcal`}
                />
              </div>
              <span className="mono text-[9px] text-[var(--faint)]">{d.key.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      {previous.map((d) => (
        <section key={d.key} className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <p className="eyebrow">{dayLabel(d.key)}</p>
            <p className="mono text-[12px] text-[var(--muted)]">{kcal(d.best)} kcal</p>
          </div>
          <DayList day={d} onDelete={remove} open={open} setOpen={setOpen} />
        </section>
      ))}

      {days.length === 0 && (
        <p className="pt-2 text-center text-[12px] text-[var(--faint)]">Geçmiş kayıt yok.</p>
      )}
    </div>
  );
}

/** Bir günün kayıtları. Çubuklar günün en yüksek üst sınırına göre ölçeklenir,
 *  böylece satırlar birbiriyle karşılaştırılabilir olur. */
function DayList({
  day,
  onDelete,
  open,
  setOpen,
}: {
  day: Day;
  onDelete: (id: string, eatenAt: string) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
}) {
  const scale = Math.max(1, ...day.entries.map((e) => e.kcal_max));
  return (
    <div className="card divide-y divide-[var(--rule)]">
      {day.entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          scaleMax={scale}
          open={open === e.id}
          onToggle={() => setOpen(open === e.id ? null : e.id)}
          onDelete={() => onDelete(e.id, e.eaten_at)}
        />
      ))}
    </div>
  );
}

function EntryRow({ entry, scaleMax, open, onToggle, onDelete }: { entry: Entry; scaleMax: number; open: boolean; onToggle: () => void; onDelete: () => void }) {
  return (
    <div>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="mono w-[42px] shrink-0 text-[12px] text-[var(--faint)]">{timeLabel(entry.eaten_at)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{entry.title}</span>
          <span className="mt-1 block max-w-[180px]">
            <RangeBar min={entry.kcal_min} max={entry.kcal_max} best={entry.kcal_best} scaleMax={scaleMax} compact />
          </span>
        </span>
        <span className="mono shrink-0 text-[15px] text-[var(--ink)]">{kcal(entry.kcal_best)}</span>
      </button>

      {open && (
        <div className="rise space-y-3 border-t border-[var(--rule)] bg-[var(--sunk)] px-4 py-3">
          <p className="text-[13px] leading-snug">{entry.verdict}</p>

          {entry.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.image_url} alt="" className="max-h-40 rounded-lg border border-[var(--rule)] object-contain" />
          )}
          {entry.raw_input && <p className="text-[12px] italic text-[var(--faint)]">“{entry.raw_input}”</p>}

          <div className="-mx-4 border-y border-[var(--rule)] bg-[var(--card)]">
            <ItemLines items={entry.items} />
          </div>

          {(entry.protein_g !== null || entry.carbs_g !== null || entry.fat_g !== null) && (
            <div className="mono flex gap-4 text-[11px] text-[var(--muted)]">
              <span><span className="text-[var(--faint)]">Toplam</span></span>
              <span><span className="text-[var(--faint)]">P</span> {gram(entry.protein_g)}</span>
              <span><span className="text-[var(--faint)]">K</span> {gram(entry.carbs_g)}</span>
              <span><span className="text-[var(--faint)]">Y</span> {gram(entry.fat_g)}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="eyebrow">
              {confidenceLabel(entry.confidence)}
              {entry.sources?.length ? ` · ${entry.sources.length} kaynak` : ""}
            </span>
            <button onClick={onDelete} className="btn btn-quiet text-[12px] text-[var(--red)]">
              Sil
            </button>
          </div>

          {entry.sources?.length > 0 && (
            <div className="space-y-1">
              {entry.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="block truncate text-[11px] text-[var(--red-ink)] underline underline-offset-2">
                  {s.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Bir günün makro toplamı; kayıt düzeyindeki değerler null olabilir. */
function sumOf(day: Day | undefined, key: "protein_g" | "carbs_g" | "fat_g"): number {
  if (!day) return 0;
  return day.entries.reduce((a, e) => a + (typeof e[key] === "number" ? (e[key] as number) : 0), 0);
}

/** Kayıt olmayan günler de çubukta yer alsın; boşluk da bilgidir. */
function lastDays(days: Day[], n: number) {
  const byKey = new Map(days.map((d) => [d.key, d]));
  const today = todayKey();
  const out: { key: string; best: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = shiftKey(today, -i);
    out.push({ key, best: byKey.get(key)?.best ?? 0 });
  }
  return out;
}

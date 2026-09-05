"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ItemLines from "@/components/ItemLines";
import MacroDonut from "@/components/MacroDonut";
import type { Targets } from "@/lib/accounts";
import { confidenceLabel, dayKey, dayLabel, kcal, timeLabel, todayKey } from "@/lib/format";
import type { Entry } from "@/lib/types";


type Day = { key: string; entries: Entry[]; best: number; min: number; max: number };

export default function DashboardClient() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Hedefler hesaba bağlı; tarayıcıda değil sunucuda duruyor.
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.account && setTargets(d.account.targets))
      .catch(() => {});
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

  useEffect(() => {
    void load();
  }, []);


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

  if (entries === null) {
    return <p className="mono pt-8 text-center text-[13px] text-[var(--faint)]">Yükleniyor…</p>;
  }

  const previous = days.filter((d) => d.key !== todayKey());
  const shownPrevious = previous.slice(0, historyOpen ? previous.length : 5);
  const target = targets?.kcal ?? 0;
  const left = Math.max(0, target - (today?.best ?? 0));
  const over = target > 0 && (today?.best ?? 0) > target;

  return (
    <div className="space-y-5 pb-12">
      {error && (
        <p className="rounded-md border border-[var(--red)]/40 px-3 py-2 text-[13px] text-[var(--red-ink)]">{error}</p>
      )}

      {/* Bugün — tek blok. Aynı sayı daha önce dört ayrı yerde tekrar ediyordu. */}
      <section className="card space-y-3 p-4">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">Bugün</p>
          <p className="mono text-[11px] text-[var(--faint)]">
            {today ? `${today.entries.length} kayıt` : "kayıt yok"}
          </p>
        </div>

        <p className="figure text-[58px]">
          {kcal(today?.best ?? 0)}
          <span className="mono ml-2 align-top text-[12px] font-normal text-[var(--muted)]">kcal</span>
        </p>

        {target > 0 && (
          <>
            <div className="h-[6px] overflow-hidden rounded-full bg-[var(--sunk)]">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.min(100, ((today?.best ?? 0) / target) * 100)}%`,
                  background: over ? "var(--red)" : "var(--ink)",
                }}
              />
            </div>
            <p className="mono text-[11px] text-[var(--muted)]">
              {over
                ? `${kcal((today?.best ?? 0) - target)} kcal aşıldı · hedef ${kcal(target)}`
                : `${kcal(left)} kcal kaldı · hedef ${kcal(target)}`}
            </p>
          </>
        )}
      </section>

      {/* Kalorinin hangi makrodan geldiği */}
      {(today?.entries.length ?? 0) > 0 && <MacroDonut totals={todayTotals} />}

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

      {/* Geçmiş — katlanmış. Açılınca o günün kayıtları geliyor. */}
      {previous.length > 0 && (
        <section className="space-y-2">
          <p className="eyebrow px-1">Geçmiş</p>
          <div className="card divide-y divide-[var(--rule)]">
            {shownPrevious.map((d) => {
              const isOpen = openDay === d.key;
              return (
                <div key={d.key}>
                  <button
                    onClick={() => setOpenDay(isOpen ? null : d.key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-baseline justify-between px-4 py-3 text-left"
                  >
                    <span className="text-[14px]">{dayLabel(d.key)}</span>
                    <span className="mono text-[13px] text-[var(--muted)]">{kcal(d.best)} kcal</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[var(--rule)]">
                      <DayList day={d} onDelete={remove} open={open} setOpen={setOpen} bare />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {previous.length > 5 && (
            <button onClick={() => setHistoryOpen((v) => !v)} className="btn btn-quiet w-full text-[12px]">
              {historyOpen ? "Daha az göster" : `${previous.length - 5} gün daha`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** Bir günün kayıtları. Çubuklar günün en yüksek üst sınırına göre ölçeklenir. */
function DayList({
  day,
  onDelete,
  open,
  setOpen,
  bare = false,
}: {
  day: Day;
  onDelete: (id: string, eatenAt: string) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
  bare?: boolean;
}) {
  return (
    <div className={`divide-y divide-[var(--rule)] ${bare ? "" : "card"}`}>
      {day.entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          open={open === e.id}
          onToggle={() => setOpen(open === e.id ? null : e.id)}
          onDelete={() => onDelete(e.id, e.eaten_at)}
        />
      ))}
    </div>
  );
}

function EntryRow({ entry, open, onToggle, onDelete }: { entry: Entry; open: boolean; onToggle: () => void; onDelete: () => void }) {
  return (
    <div>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="mono w-[42px] shrink-0 text-[12px] text-[var(--faint)]">{timeLabel(entry.eaten_at)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{entry.title}</span>
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


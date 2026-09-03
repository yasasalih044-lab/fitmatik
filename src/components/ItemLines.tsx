"use client";

import type { Basis, FoodItem } from "@/lib/types";
import { kcal } from "@/lib/format";

/** "1 paket (36 g)" gibi bir metin zaten gramajı söylüyorsa tekrar etme. */
function hasGramsInQty(qty: string, grams: number): boolean {
  const m = qty.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|ml)\b/i);
  return !!m && Math.abs(Number(m[1].replace(",", ".")) - grams) < 1;
}

const g = (v: number | null) =>
  v === null ? null : `${(Math.round(v * 10) / 10).toLocaleString("tr-TR")} g`;

/** Sayının nereden geldiği. Kullanıcı buna bakıp güvenini ayarlıyor. */
const BASIS_LABEL: Record<Basis, string> = {
  etiket: "ETİKET",
  barkod: "BARKOD",
  veritabani: "VERİTABANI",
  web: "WEB",
  tahmin: "TAHMİN",
};

function BasisTag({ basis }: { basis: Basis }) {
  // Bu alan eklenmeden önce yazılmış kayıtlarda yok; uydurma etiket gösterme.
  if (!basis || !(basis in BASIS_LABEL)) return null;
  const strong = basis === "etiket" || basis === "barkod";
  const mid = basis === "veritabani";
  return (
    <span
      className={`mono shrink-0 rounded-[3px] px-1.5 py-0.5 text-[9px] tracking-[0.1em] ${
        strong
          ? "bg-[var(--ink)] text-[var(--paper)]"
          : mid
            ? "border border-[var(--rule)] text-[var(--muted)]"
            : "text-[var(--faint)]"
      }`}
      title={
        strong
          ? "Ambalajın kendi besin değerlerinden hesaplandı"
          : mid
            ? "Gıda veritabanındaki ürün kaydından hesaplandı"
            : "İnternet kaynaklarından tahmin edildi"
      }
    >
      {BASIS_LABEL[basis]}
    </span>
  );
}

/** Öğünün kalemleri: miktar, gramaj, makrolar ve dayanak. */
export default function ItemLines({ items }: { items: FoodItem[] }) {
  if (!items?.length) return null;

  return (
    <ul className="divide-y divide-[var(--rule)]">
      {items.map((it, i) => {
        const macros = [
          ["P", it.protein_g],
          ["K", it.carbs_g],
          ["Y", it.fat_g],
        ] as const;
        const hasMacros = macros.some(([, v]) => v !== null);

        return (
          <li key={i} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-[14px] leading-snug">{it.name}</p>
              <p className="mono shrink-0 text-[14px]">{kcal(it.kcal_best)}</p>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <p className="mono min-w-0 flex-1 truncate text-[11px] text-[var(--faint)]">
                {it.qty}
                {it.grams !== null && !hasGramsInQty(it.qty, it.grams) ? ` · ${it.grams} g` : ""}
              </p>
              <BasisTag basis={it.basis} />
            </div>

            {hasMacros && (
              <div className="mono mt-1.5 flex gap-3 text-[11px] text-[var(--muted)]">
                {macros.map(([label, v]) => (
                  <span key={label}>
                    <span className="text-[var(--faint)]">{label}</span> {g(v) ?? "—"}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

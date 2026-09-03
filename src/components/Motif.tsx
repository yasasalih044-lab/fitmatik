"use client";

import { useEffect, useState } from "react";

const COUNT = 10;

/**
 * Her sayfa açılışında motiflerden biri köşede belirir. İstemcide seçilir:
 * sunucu HTML'i sabit kalır (hidrasyon uyuşmazlığı yok) ve görsel ilk boyamayı
 * geciktirmez.
 */
export default function Motif() {
  const [pick, setPick] = useState<{ n: number; left: boolean } | null>(null);

  useEffect(() => {
    const n = Math.floor(Math.random() * COUNT) + 1;
    setPick({ n, left: Math.random() < 0.35 });
  }, []);

  if (!pick) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/motif/${String(pick.n).padStart(2, "0")}.webp`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`motif${pick.left ? " motif--left" : ""}`}
    />
  );
}

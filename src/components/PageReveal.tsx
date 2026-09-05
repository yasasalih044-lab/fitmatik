"use client";

import { usePathname } from "next/navigation";

/**
 * Sayfa açılış animasyonu: doğrudan çocuklar sırayla, hafif bulanıklıktan
 * netleşerek belirir. Yol değişince `key` ile yeniden tetiklenir.
 *
 * CSS animasyonu tercih edildi — her blok için ayrı motion bileşeni açmak
 * bu iş için gereksiz yük olurdu. `prefers-reduced-motion` CSS'te kapatılıyor.
 */
export default function PageReveal({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="page-reveal">
      {children}
    </div>
  );
}

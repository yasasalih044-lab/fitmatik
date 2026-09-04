"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizeTheme, THEME_KEY } from "@/lib/theme";
import { useEffect, useState } from "react";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [storeWarning, setStoreWarning] = useState("");

  // Tema hesapta duruyor; açılışta localStorage yerine hesabı otorite say.
  // Başka cihazdan değiştirildiyse burada yakalanır.
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const t = normalizeTheme(d?.account?.theme);
        if (d?.account && document.documentElement.dataset.theme !== t) {
          document.documentElement.dataset.theme = t;
          try {
            localStorage.setItem(THEME_KEY, t);
          } catch {
            /* özel sekmede hatırlanmaz */
          }
        }
      })
      .catch(() => {});
  }, []);

  // Depolama düzgün bağlı değilse kayıtlar kalıcı olmaz — bunu saklama.
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((h) => setStoreWarning(h.store === "memory" ? "Kalıcı depolama bağlı değil. Kayıtlar sunucu yeniden başlayınca silinir." : ""))
      .catch(() => {});
  }, []);

  const tabs = [
    { href: "/upload", label: "Ekle" },
    { href: "/dashboard", label: "Günlük" },
    { href: "/ayarlar", label: "Ayarlar" },
  ];

  return (
    <>
      <div className="app-page-art" aria-hidden />
      <div className="app-shell">
        <header className="app-header safe-top">
          {/* Logo dosyası temayla değişiyor: yeşilli sürüm yalnızca siyah temada. */}
          <Link href="/upload" aria-label="Fit-matik" className="marka" />
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-0.5 rounded-md border border-[var(--rule)] bg-[var(--card)] p-0.5">
            {tabs.map((t) => {
              const active = path === t.href;
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`mono rounded-[4px] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                    active ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--faint)] hover:text-[var(--muted)]"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
            </nav>
          </div>
        </header>

        {storeWarning && (
          <p className="mb-4 rounded-md border border-[var(--accent-border)] bg-[var(--accent-wash)] px-3 py-2 text-[12px] leading-snug text-[var(--red-ink)]">
            {storeWarning}
          </p>
        )}

        <main className="app-main safe-bottom">{children}</main>
      </div>
    </>
  );
}

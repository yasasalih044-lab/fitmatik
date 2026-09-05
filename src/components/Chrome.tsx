"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BackgroundPicker from "./BackgroundPicker";
import PageReveal from "./PageReveal";
import { lastSeenStamp, normalizeTheme, rememberTheme } from "@/lib/theme";
import { useEffect, useState } from "react";

/** Tema eşitlemesi oturumda bir kez; her gezinmede tekrarlanmasın. */
let themeSynced = false;

export default function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [storeWarning, setStoreWarning] = useState("");

  // Tema hem cihazda hem hesapta duruyor. Cihazdaki seçim sahiptir; sunucu
  // kopyası yalnızca İSPATLANABİLİR şekilde daha yeniyse kazanır.
  //
  // Eskiden bu efekt koşulsuz "sunucu otorite" diyordu ve `Chrome` ortak bir
  // layout'ta olmadığı için her sayfa geçişinde yeniden çalışıyordu; nesne
  // deposundan gelen tek bir bayat okuma localStorage'a da yazılıp kalıcı hale
  // geliyordu. Karşılaştırma artık iki sunucu damgası arasında (saat farkından
  // etkilenmez) ve oturumda bir kez yapılıyor.
  useEffect(() => {
    if (themeSynced) return;
    themeSynced = true;

    const ctrl = new AbortController();
    fetch("/api/me", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const account = d?.account;
        if (!account?.updated_at) return;
        if (account.updated_at <= lastSeenStamp()) return; // bizim bildiğimiz daha yeni
        rememberTheme(normalizeTheme(account.theme), account.updated_at);
      })
      .catch(() => {});

    return () => ctrl.abort();
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
      <BackgroundPicker />
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

        <main className="app-main safe-bottom">
          <PageReveal>{children}</PageReveal>
        </main>
      </div>
    </>
  );
}

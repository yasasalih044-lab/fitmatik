"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PageReveal from "./PageReveal";
import TopoField from "./ui/topo-field";
import { lastSeenStamp, normalizeTheme, rememberTheme } from "@/lib/theme";
import { useEffect, useState } from "react";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [storeWarning, setStoreWarning] = useState("");

  // Sunucu damgası ve seçilen tema hesap kimliğiyle eşleştirilir. Böylece
  // aynı cihazda daha önce giriş yapılmış başka bir hesabın teması kazanmaz.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/me", { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const account = d?.account;
        if (!account?.id || !account.updated_at) return;
        const serverTheme = normalizeTheme(account.theme);
        // Login ve çıkış ekranları güvenle varsayılan temayla başlar. Aynı
        // hesabın damgası değişmemiş olsa bile bu ekrana dönerken sunucunun
        // temasını yeniden uygula; aksi halde siyah tema kalabilirdi.
        if (
          account.updated_at <= lastSeenStamp(account.id) &&
          document.documentElement.dataset.theme === serverTheme
        ) return;
        rememberTheme(serverTheme, account.updated_at, account.id);
      })
      .catch(() => {});

    return () => ctrl.abort();
  }, []);

  // Depolama düzgün bağlı değilse kayıtlar kalıcı olmaz — bunu saklama.
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((h) => setStoreWarning(h?.store === "postgres" && h?.session_configured ? "" : "Kalıcı depolama veya oturum imzası hazır değil. Yeni kayıtlar kaydedilemez."))
      .catch(() => setStoreWarning("Kalıcı depolama durumu okunamadı. Yeni kayıtlar kaydedilemez."));
  }, []);

  const tabs = [
    { href: "/upload", label: "Ekle" },
    { href: "/dashboard", label: "Günlük" },
    { href: "/ayarlar", label: "Ayarlar" },
  ];

  return (
    <>
      <TopoField className="topo-field" />
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

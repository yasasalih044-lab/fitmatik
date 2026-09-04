"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Motif from "./Motif";
import ThemeSwitch from "./ThemeSwitch";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [storeWarning, setStoreWarning] = useState("");

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
  ];

  return (
    <>
      <div className="app-page-art" aria-hidden />
      <Motif />
      <div className="app-shell">
        <header className="app-header safe-top">
          <Link href="/upload" className="flex items-center gap-2.5">
            <span className="block h-5 w-[5px] -skew-x-12 bg-[var(--red)]" />
            <span className="display text-[22px] uppercase tracking-[-0.01em]">Fit-matik</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitch />
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

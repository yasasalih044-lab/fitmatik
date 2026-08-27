"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [noStore, setNoStore] = useState(false);

  // Supabase bağlı değilse kayıtlar sunucu yeniden başlayınca kaybolur — bunu saklama.
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((h) => setNoStore(!h.supabase))
      .catch(() => {});
  }, []);

  const tabs = [
    { href: "/upload", label: "Ekle" },
    { href: "/dashboard", label: "Günlük" },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-4">
      <header className="safe-top flex items-center justify-between pb-5">
        <Link href="/upload" className="flex items-center gap-2">
          <span className="block h-4 w-1 rounded-sm bg-[var(--apricot)]" />
          <span className="display text-[17px] tracking-tight">Fit-matik</span>
        </Link>
        <nav className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--ink-2)] p-1">
          {tabs.map((t) => {
            const active = path === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`mono rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                  active ? "bg-[var(--surface-2)] text-[var(--text)]" : "text-[var(--faint)] hover:text-[var(--muted)]"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {noStore && (
        <p className="mb-4 rounded-[12px] border border-[var(--apricot)]/35 bg-[var(--apricot)]/10 px-3 py-2 text-[12px] leading-snug text-[var(--apricot)]">
          Supabase bağlı değil. Kayıtlar geçici tutuluyor ve sunucu yeniden başlayınca silinir.
        </p>
      )}
      <main className="safe-bottom flex-1">{children}</main>
    </div>
  );
}

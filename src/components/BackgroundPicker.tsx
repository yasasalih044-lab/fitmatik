"use client";

import { useEffect } from "react";
import { normalizeTheme } from "@/lib/theme";

type Manifest = Record<string, { desktop: string[]; mobile: string[] }>;

let cache: Manifest | null = null;

/**
 * Her sayfa açılışında temanın arka planlarından birini rastgele seçer.
 * Tek görsel varsa görünür bir değişiklik olmaz; klasöre görsel ekledikçe
 * çeşitlenir. Seçim istemcide yapılır, sunucu HTML'i sabit kalır.
 */
export default function BackgroundPicker() {
  useEffect(() => {
    let cancelled = false;

    const apply = (manifest: Manifest) => {
      if (cancelled) return;
      const theme = normalizeTheme(document.documentElement.dataset.theme);
      const set = manifest[theme];
      if (!set) return;
      const wide = window.matchMedia("(min-width: 768px)").matches;
      const list = (wide ? set.desktop : set.mobile).length
        ? wide
          ? set.desktop
          : set.mobile
        : [...set.desktop, ...set.mobile];
      if (!list.length) return;
      const pick = list[Math.floor(Math.random() * list.length)];
      document.documentElement.style.setProperty("--auth-art", `url("${pick}")`);
    };

    if (cache) {
      apply(cache);
      return;
    }
    fetch("/api/backgrounds", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Manifest | null) => {
        if (!m) return;
        cache = m;
        apply(m);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

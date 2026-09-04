"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, isTheme, THEMES, THEME_KEY, type ThemeId } from "@/lib/theme";

const labels: Record<ThemeId, string> = {
  kagit: "Pembe",
  pegasus: "Kırmızı",
  karbon: "Siyah",
};
const THEME_CHANGE_EVENT = "fitmatik:theme-change";

/** Temayı değiştirir ve seçimi hatırlar. Renkler tamamen CSS belirteçlerinden gelir. */
export default function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    const timer = isTheme(current) ? window.setTimeout(() => setTheme(current), 0) : undefined;
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isTheme(next)) setTheme(next);
    };
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
    };
  }, []);

  function pick(id: ThemeId) {
    // eslint-disable-next-line react-hooks/immutability -- Tema, React ağacının dışındaki belge tercihidir.
    document.documentElement.dataset.theme = id;
    setTheme(id);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--browser-theme").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: id }));
    try {
      localStorage.setItem(THEME_KEY, id);
    } catch {
      /* özel sekmede hatırlanmaz, sorun değil */
    }
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Tema">
      {THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => pick(t.id)}
          type="button"
          aria-pressed={theme === t.id}
          title={labels[t.id]}
          aria-label={`${labels[t.id]} temasını seç`}
          data-theme-option={t.id}
          className="theme-swatch"
        >
          <span className="sr-only">{labels[t.id]}</span>
        </button>
      ))}
    </div>
  );
}

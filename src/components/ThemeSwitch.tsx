"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, isTheme, THEMES, THEME_KEY, type ThemeId } from "@/lib/theme";

/** Temayı değiştirir ve seçimi hatırlar. Renkler tamamen CSS belirteçlerinden gelir. */
export default function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (isTheme(current)) setTheme(current);
  }, []);

  function pick(id: ThemeId) {
    document.documentElement.dataset.theme = id;
    setTheme(id);
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
          aria-pressed={theme === t.id}
          title={t.label}
          className={`h-5 w-5 rounded-full border transition-transform ${
            theme === t.id ? "scale-110 border-[var(--ink)]" : "border-[var(--rule)] hover:scale-105"
          }`}
          style={{
            background:
              t.id === "kagit" ? "#f2eee5" : t.id === "pegasus" ? "#07070a" : "#16181a",
            boxShadow:
              theme === t.id
                ? "inset 0 0 0 2px var(--paper), inset 0 0 0 3px var(--red)"
                : "inset 0 0 0 2px var(--paper)",
          }}
        >
          <span className="sr-only">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

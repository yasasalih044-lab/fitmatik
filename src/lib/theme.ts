export const THEMES = [
  { id: "kagit", label: "Kağıt" },
  { id: "pegasus", label: "Pegasus" },
  { id: "karbon", label: "Karbon" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "kagit";
export const THEME_KEY = "fitmatik.theme.v1";

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/**
 * Sayfa boyanmadan önce çalışır: kayıtlı tema uygulanmazsa ilk karede
 * varsayılan tema görünüp sonra sıçrar.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});var ok=${JSON.stringify(THEMES.map((t) => t.id))};document.documentElement.dataset.theme=ok.indexOf(t)>-1?t:${JSON.stringify(
  DEFAULT_THEME,
)};}catch(e){document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME)};}})();`;

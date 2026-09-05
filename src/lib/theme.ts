export const THEMES = [
  { id: "pembe", label: "Pembe" },
  { id: "kirmizi", label: "Kırmızı" },
  { id: "siyah", label: "Siyah" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
export const DEFAULT_THEME: ThemeId = "pembe";
export const THEME_KEY = "fitmatik.theme.v1";
/**
 * En son hangi sunucu sürümüyle eşitlendiğimizi tutar (hesabın `updated_at`
 * damgası). İstemci saatiyle karşılaştırma yapmıyoruz — iki damga da sunucudan
 * geldiği için saat farkı sorun çıkarmıyor.
 */
export const THEME_SEEN_KEY = "fitmatik.account.seen";

/** Temayı uygula ve hatırla. `serverStamp` verilirse eşitlenme noktası da işaretlenir. */
export function rememberTheme(id: ThemeId, serverStamp?: string) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(THEME_KEY, id);
    if (serverStamp) localStorage.setItem(THEME_SEEN_KEY, serverStamp);
  } catch {
    /* özel sekmede hatırlanmaz */
  }
}

/** Bilinen son sunucu damgası; yoksa boş dize (her damga bundan büyüktür). */
export function lastSeenStamp(): string {
  try {
    return localStorage.getItem(THEME_SEEN_KEY) || "";
  } catch {
    return "";
  }
}

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

/** Önceki sürümde temaların kimliği farklıydı; kayıtlı seçim kaybolmasın. */
const LEGACY: Record<string, ThemeId> = { kagit: "pembe", pegasus: "kirmizi", karbon: "siyah" };

export function normalizeTheme(v: unknown): ThemeId {
  if (isTheme(v)) return v;
  const legacy = typeof v === "string" ? LEGACY[v] : undefined;
  return legacy ?? DEFAULT_THEME;
}

/**
 * Sayfa boyanmadan önce çalışır: kayıtlı tema uygulanmazsa ilk karede
 * varsayılan tema görünüp sonra sıçrar.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_KEY)},ok=${JSON.stringify(THEMES.map((t) => t.id))},
lg=${JSON.stringify(LEGACY)},d=${JSON.stringify(DEFAULT_THEME)},t=localStorage.getItem(k);
if(lg[t]){t=lg[t];localStorage.setItem(k,t);}
document.documentElement.dataset.theme=ok.indexOf(t)>-1?t:d;
}catch(e){document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME)};}})();`;

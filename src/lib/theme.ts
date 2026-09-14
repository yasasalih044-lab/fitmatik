export const THEMES = [
  { id: "siyah", label: "Siyah" },
  { id: "kirmizi", label: "Kırmızı" },
  { id: "mor", label: "Mor" },
  { id: "pembe", label: "Pembe" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
/** Yeni hesapların sakin, yüksek kontrastlı başlangıç teması. */
export const DEFAULT_THEME: ThemeId = "siyah";
export const THEME_KEY = "fitmatik.theme.v1";
export const THEME_ACCOUNT_KEY = "fitmatik.theme.account-id.v1";
/**
 * En son hangi sunucu sürümüyle eşitlendiğimizi tutar (hesabın `updated_at`
 * damgası). İstemci saatiyle karşılaştırma yapmıyoruz — iki damga da sunucudan
 * geldiği için saat farkı sorun çıkarmıyor.
 */
export const THEME_SEEN_KEY = "fitmatik.account.seen";

/** Ayarlar'da sunucuya yazmadan önce yapılan canlı tema önizlemesi. */
export function previewTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--browser-theme").trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

/** Temayı uygula ve kalıcı sunucu sürümüyle birlikte hatırla. */
export function rememberTheme(id: ThemeId, serverStamp?: string, accountId?: string) {
  previewTheme(id);
  try {
    localStorage.setItem(THEME_KEY, id);
    if (serverStamp) localStorage.setItem(THEME_SEEN_KEY, serverStamp);
    if (accountId) localStorage.setItem(THEME_ACCOUNT_KEY, accountId);
  } catch {
    /* özel sekmede hatırlanmaz */
  }
}

/** Oturum kapanınca başka bir hesabın yerel tema önbelleğini kullanma. */
export function forgetTheme() {
  previewTheme(DEFAULT_THEME);
  try {
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem(THEME_SEEN_KEY);
    localStorage.removeItem(THEME_ACCOUNT_KEY);
  } catch {
    /* özel sekmede temizlenecek bir önbellek olmayabilir */
  }
}

/** Bilinen son sunucu damgası; yoksa boş dize (her damga bundan büyüktür). */
export function lastSeenStamp(accountId?: string): string {
  try {
    if (accountId && localStorage.getItem(THEME_ACCOUNT_KEY) !== accountId) return "";
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
lg=${JSON.stringify(LEGACY)},d=${JSON.stringify(DEFAULT_THEME)},
isAuth=/^\\/(?:login|kayit|auth)(?:\\/|$)/.test(location.pathname),t=isAuth?d:localStorage.getItem(k);
if(lg[t]){t=lg[t];localStorage.setItem(k,t);}
document.documentElement.dataset.theme=ok.indexOf(t)>-1?t:d;
}catch(e){document.documentElement.dataset.theme=${JSON.stringify(DEFAULT_THEME)};}})();`;

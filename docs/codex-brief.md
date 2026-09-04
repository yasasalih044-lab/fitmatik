# Fit-matik — Codex görev brifingi

Bu projeyi hiç görmedin. Aşağıda ihtiyacın olan her şey var. Sonunda **senin
görevin** bölümü geliyor; oraya kadar olan kısım bağlam.

Paralel çalışıyoruz: **backend'i başka bir ajan (Claude) yapıyor, sen arayüzü
yapıyorsun.** Dosya sahipliği bölümüne mutlaka uy, yoksa çakışırız.

---

## 1. Proje nedir

**Fit-matik** — tek kişilik (sahibi: Salih) kalori günlüğü. iPhone'da Safari ana
ekran kısayolu olarak kullanılıyor, ama masaüstünde de açılıyor.

Kullanıcı ne yediğini **yazıyor** ya da **paketli bir ürünün fotoğrafını** çekiyor;
uygulama kalorisini araştırıp günlüğe yazıyor.

- **Kod:** `~/Desktop/fitmatik`
- **Repo:** https://github.com/yasasalih044-lab/fitmatik (public, `main` dalı)
- **Canlı:** https://fitmatik.mavrosai.site (Coolify'da, kendi kendine barındırılan)
- **Dil:** Arayüz ve kod yorumları **Türkçe**. Böyle devam et.

**Ürün fikri:** tek bir kalori sayısı yalan söyler. Uygulama kaynakların söylediği
**aralığı** ve tek bir en iyi tahmini birlikte gösterir:
*"188-245 arası söyleniyor ama büyük ihtimalle 213 kalori"*.
İmza görsel öğe `RangeBar` — aralık çubuğu + en iyi tahmin iğnesi.

---

## 2. Hızlı başlangıç

```bash
cd ~/Desktop/fitmatik
npm install
npm run dev        # http://localhost:3000
```

`.env.local` **zaten dolu ve gitignore'da** — dokunma, içindeki anahtarları
kopyalama, log'a yazdırma.

```bash
npm run build      # teslim etmeden önce mutlaka geçmeli
npx tsc --noEmit   # tip kontrolü
```

> **`.next/` içinde " 2" ekli kopya dosyalar** oluşabiliyor (iCloud senkronu).
> `npx tsc --noEmit` sahte "duplicate identifier" hatası verirse:
> `find .next -name "* 2.*" -delete`

---

## 3. Stack

| | |
|---|---|
| Framework | **Next.js 16.3.3**, App Router, **Turbopack** |
| React | 19.2.8 |
| CSS | **Tailwind v4** (`@import "tailwindcss"`, `@theme inline`) |
| Dil | TypeScript |
| Veri | Supabase (aşağıda) |
| Model | OpenAI `gpt-5-mini`, Responses API |
| Deploy | Coolify + Dockerfile, `output: "standalone"` |

**Next 16 farkları — training verinden farklı olabilir:**
- `middleware.ts` **yok**; yerine `src/proxy.ts` + `export default function proxy()`
- `next.config.ts` içinde `eslint` anahtarı **geçersiz**
- `src/app/api/_xxx` gibi **alt çizgiyle başlayan klasörler route dışı** kalır
- Kök dizindeki `AGENTS.md` / `CLAUDE.md` dosyalarını `next dev` **kendisi üretiyor**,
  silme, düzenleme

---

## 4. Mimari — analiz boru hattı

`src/lib/openai.ts` içinde **üç aşama**:

1. **Ayrıştırma** — `gpt-5-mini`, strict `json_schema`.
   Metin modu: yemek kalemlerini çıkarır (ad, miktar, marka, gram tahmini, barkod).
   Görsel modu: **sadece paketli gıda** kabul eder; besin değerleri tablosunu ve
   **barkodu** okur. Tabak/ev yemeği fotoğrafını `accepted:false` ile reddeder.
2. **Veritabanı** — `src/lib/foodDb.ts` (Open Food Facts) ve `src/lib/fatsecret.ts`
   (FatSecret). Barkod varsa doğrudan ürün çekilir.
3. **Araştırma** — aynı model + `web_search` aracı. Veritabanı eşleşmesi varsa
   **bağlayıcıdır**, web sonucunu ezer.

**Aritmetik modelde değil kodda:** model porsiyonu/gramı tahmin eder, veritabanı ya
da etiket 100 g başına değeri verir, çarpmayı `settleItem()` yapar.

Her kalemin sayısının **dayanağı** kaydedilir (`Basis` tipi), öncelik sırasıyla:
`etiket` > `barkod` > `veritabani` > `web` > `tahmin`.
Arayüzde bu bir rozet olarak gösteriliyor — kullanıcı güvenini buna göre ayarlıyor.

---

## 5. Depolama — Supabase (DİKKAT: tablo yok)

**Supabase projesi:** ref `foogqcjnbqificzadzbm`
→ `https://foogqcjnbqificzadzbm.supabase.co`

Uygulama üç sürücüden birini **çalışma anında kendisi seçiyor**
(`src/lib/store.ts`, `driver()`):

| Sürücü | Ne zaman | Nerede |
|---|---|---|
| `table` | `public.entries` tablosu varsa | Postgres tablosu |
| `storage` | **şu an aktif olan bu** | `fitmatik` kovası, `log/<gün>/<id>.json` |
| `memory` | Supabase env yoksa (yerel) | RAM, kalıcı değil |

**`public.entries` tablosu HENÜZ OLUŞTURULMADI.** Şeması
`supabase/schema.sql` içinde duruyor ama kullanıcı SQL Editor'de çalıştırmadı.
Bu yüzden canlıda **Storage sürücüsü** işliyor: her kayıt kovada ayrı bir JSON
dosyası. Hangi sürücünün aktif olduğunu `GET /api/health` → `store` alanı söyler.

Kayıt başına tek (değişmez) dosya kullanılıyor — gün başına tek dosyaya
oku-değiştir-yaz yapmak, nesne depolarının üzerine yazmada bayat okuma döndürmesi
yüzünden araya giren kaydı sessizce kaybediyordu.

> ### ⚠️ EN ÖNEMLİ UYARI
> **Yerel geliştirme sunucusu da canlıyla AYNI Supabase kovasına yazıyor.**
> Yerelde oluşturduğun her kayıt kullanıcının **gerçek günlüğüne** düşer.
> - Test kaydı oluşturma; oluşturduysan hemen sil.
> - Kullanıcının mevcut kayıtlarını **asla silme**.
> - Arayüzü verisiz denemek için `/api/analyze`'a `{"source":"text","text":"__mock__"}`
>   gönder — geliştirme modunda gerçek model çağrısı yapmadan sahte sonuç döner.
>   Kaydetmeden denemek için gövdeye `"save": false` ekle.

---

## 6. Dosya haritası

```
src/
  app/
    layout.tsx              kök layout, fontlar, PWA metası, tema rengi
    globals.css             ⬅ TASARIM SİSTEMİ — tüm renk değişkenleri burada
    page.tsx                "/" → "/upload" yönlendirmesi
    upload/
      page.tsx              sunucu bileşeni sarmalayıcı
      UploadClient.tsx      ⬅ ana ekran: yazı/fotoğraf sekmesi, sonuç kartı
    dashboard/
      page.tsx              sarmalayıcı
      DashboardClient.tsx   ⬅ günlük: bugün toplamı, 14 gün grafiği, gün gün döküm
    login/page.tsx          PIN ekranı (APP_PIN tanımlıysa; şu an tanımlı değil)
    icon.tsx apple-icon.tsx next/og ile üretilen ikonlar
    manifest.ts             PWA manifesti
    api/
      analyze/route.ts      POST — analiz + kaydetme
      entries/route.ts      GET (liste) / DELETE (sil)
      health/route.ts       GET — yapılandırma durumu
      auth/route.ts         POST/DELETE — PIN oturumu
  components/
    Chrome.tsx              ⬅ başlık + sekme çubuğu + sayfa kabuğu
    ItemLines.tsx           ⬅ öğün kalemleri: gramaj, P/K/Y makro, dayanak rozeti
    RangeBar.tsx            ⬅ imza öğe: kalori aralığı çubuğu
    Motif.tsx               ⬅ köşedeki dövme motifi (her açılışta rastgele biri)
  lib/
    types.ts                tüm veri tipleri
    openai.ts               üç aşamalı boru hattı
    foodDb.ts               Open Food Facts istemcisi
    fatsecret.ts            FatSecret istemcisi (OAuth2)
    store.ts                Supabase sürücüleri (table/storage/memory)
    format.ts               kcal, dayKey, dayLabel, timeLabel
    auth.ts                 PIN çerezi
  proxy.ts                  Next 16 middleware karşılığı (PIN koruması)
public/motif/01..10.webp    10 kırmızı-siyah dövme motifi (~58 KB, alfa korunmuş)
supabase/schema.sql         entries tablosu şeması (henüz çalıştırılmadı)
Dockerfile                  standalone çıktı, port 3000
```

---

## 7. Veri modeli (`src/lib/types.ts`)

```ts
export type Source = "text" | "image";

/** Bir kalemin sayıları nereden geldi */
export type Basis = "etiket" | "barkod" | "veritabani" | "web" | "tahmin";

export type FoodItem = {
  name: string;            // "Eti Gong Çikolatalı"
  qty: string;             // "1 paket (36 g)"
  brand: string | null;
  packaged: boolean;
  kcal_min: number;
  kcal_max: number;
  kcal_best: number;
  grams: number | null;    // tüketilen gram
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  basis: Basis;
  barcode: string | null;
  note: string;            // "Eti Gong: 522 kcal/100 g × 36 g"
};

export type Macros = { protein_g: number|null; carbs_g: number|null; fat_g: number|null };
export type WebSource = { title: string; url: string };

export type AnalyzeResult = {
  title: string;
  source: Source;
  items: FoodItem[];
  kcal_min: number; kcal_max: number; kcal_best: number;
  macros: Macros;
  confidence: "low" | "medium" | "high";
  verdict: string;          // "188-245 arası söyleniyor ama büyük ihtimalle 213 kalori"
  sources: WebSource[];
  model: string;
  elapsed_ms: number;
  rejected?: { reason: string };   // görsel paketli gıda değilse
};

export type Entry = {
  id: string;
  created_at: string;       // ISO
  eaten_at: string;         // ISO — gün gruplaması bunun üzerinden
  source: Source;
  raw_input: string | null;
  image_url: string | null;
  title: string;
  items: FoodItem[];
  kcal_min: number; kcal_max: number; kcal_best: number;
  protein_g: number | null; carbs_g: number | null; fat_g: number | null;
  confidence: string;
  verdict: string;
  sources: WebSource[];
  model: string | null;
};
```

> **Geriye dönük uyumluluk:** kullanıcının eski kayıtlarında `grams`, `protein_g`,
> `carbs_g`, `fat_g`, `basis`, `barcode` alanları **yok**. Hepsini `null`/eksik
> olabilir varsay. `ItemLines.tsx` bunu zaten yapıyor (dayanak yoksa rozet
> gösterilmiyor) — bozma.

---

## 8. Mevcut API sözleşmeleri

```
GET  /api/health
     → { ok, app, model, openai_key, supabase, store, pin_protected, time }
       store: "table" | "storage" | "memory"

GET  /api/entries?from=<ISO>&to=<ISO>&limit=<1-1000>
     → { entries: Entry[] }            (eaten_at'a göre yeniden eskiye)

DELETE /api/entries?id=<uuid>&day=<YYYY-MM-DD>
     → { ok: true }                    day ipucu opsiyonel ama hızlandırır

POST /api/analyze
     body: { source: "text"|"image", text?: string, image?: <data URL>,
             eaten_at?: ISO, save?: boolean }
     → { result: AnalyzeResult, entry: Entry | null }
     hata → { error: string }  (kullanıcıya gösterilebilir Türkçe metin)
```

---

## 9. Tasarım dili (mevcut)

Şu anki tema **kağıt üstüne mürekkep**:

| Değişken | Değer | Ne |
|---|---|---|
| `--paper` | `#f2eee5` | sıcak kağıt zemin (+ satır içi SVG taneciği) |
| `--card` | `#fbf9f4` | kart yüzeyi |
| `--sunk` | `#e9e3d6` | çukur/pasif yüzey |
| `--ink` | `#17140f` | metin, mürekkep siyahı |
| `--muted` | `#6b6458` | ikincil metin |
| `--faint` | `#9c9384` | üçüncül metin |
| `--rule` | `#d8d1c0` | ince çizgi |
| `--red` | `#d2141f` | **vurgu** — ana buton, aralık iğnesi |
| `--red-ink` | `#8e0d15` | koyu kırmızı, bağlantılar |

**Yazı:** `Big_Shoulders` (başlık ve büyük sayılar, `.display` / `.figure`),
`Instrument_Sans` (gövde), `JetBrains_Mono` (mikro etiket ve sayılar, `.mono`).

**Motifler:** kullanıcının verdiği 10 kırmızı-siyah dövme çizimi
(`public/motif/`). Her sayfa açılışında istemcide rastgele biri seçilip köşede
beliriyor — `position: fixed`, `opacity .22`, radyal maskeyle kağıda eriyor,
`pointer-events: none`. Kullanıcı bunu "minimal" istedi, abartma.

---

## 10. ⬛ SENİN GÖREVİN

Dört iş. Hepsi **arayüz**. Backend'e dokunma.

### Görev 1 — Tema altyapısı + 3 tema

Kullanıcının isteği: *"sen her elementi renk değiştirebilir şekilde yap, sonra
temaları kurgularız"*.

- **Sabit renk bırakma.** Bileşenlerde `bg-black`, `text-white`, `#fff`, `rgb(...)`
  gibi doğrudan renk kalmasın; hepsi `var(--...)` üzerinden gelsin. Şu an bazı
  yerlerde `bg-[var(--ink)]/25` gibi opaklık varyantları var — bunları da
  değişkenleştir (örn. `--ink-25` ya da `color-mix()`).
- Eksik olan semantik değişkenleri ekle: başarı/uyarı, grafik çubuğu, rozet
  dolgusu, gölge, motif opaklığı vb. Amaç: **tek bir blok değiştirilince tüm
  uygulama değişsin.**
- **3 tema** kur:
  1. `kagit` — mevcut hâli (varsayılan)
  2. `gece` — siyah zemin + kırmızı vurgu (aşağıdaki Pegasus referansının dünyası)
  3. üçüncüsünü **sen öner** ve gerekçesini yaz
- Geçiş `<html data-theme="...">` ile olsun, seçim `localStorage`'da saklansın,
  **FOUC olmasın** (layout'ta küçük bir inline script ile ilk boyamadan önce uygula).
- Tema değiştirici küçük ve göze batmayan bir kontrol olsun (başlıkta ya da
  ayarlarda). Mobilde de erişilebilir olsun.
- `prefers-color-scheme` ile ilk açılışta makul bir varsayılan seç.

### Görev 2 — "Pegasus" tarzı giriş ekranı

Kullanıcı, başka bir projesindeki (Pegasus CRM) giriş ekranını referans verdi ve
*"Fit-matik'in girişinin de öyle olmasını istiyorum"* dedi.

Referansın tarifi: **siyah yıldızlı zemin**, arkada soluk tekrarlanan blackletter
marka dokusu, solda gri tonlu heykel/melek görseli, ortada çok büyük **kırmızı
bezemeli serif** yazı — *"Hoşgeldin, Patron"* — altında küçük blackletter marka adı.
Sinematik, karanlık, iddialı.

Fit-matik'e uyarlaman gereken:
- Uygulama açılışında görünen, **1.5–2 sn sonra kendiliğinden kaybolan** bir
  karşılama ekranı. Dokununca/tıklayınca hemen geçilebilsin.
- Günde bir kez göster (localStorage'da tarih tut) — her sayfa geçişinde değil.
- Metin: **"Hoşgeldin, Patron"** kalsın, altına `FIT-MATIK`.
- Heykel görselini kullanma (bizde yok). Onun yerine `public/motif/` içindeki
  dövme motiflerinden birini büyük ve dramatik kullan — zaten projenin görsel dili.
- `prefers-reduced-motion` açıksa animasyonu atla, doğrudan uygulamayı göster.
- Karşılama ekranı **tema değişkenlerini kullansın**, `gece` temasıyla uyumlu olsun.

### Görev 3 — Günlük hedef göstergesi

Kullanıcının isteği: *"günlük alman gereken kalorinin ne kadarını aldın, proteini
ne kadar aldın, yağ ve karb miktarını görebilelim"*.

- `/dashboard` üstünde **4 metrik**: kalori, protein, karbonhidrat, yağ —
  her biri *alınan / hedef* ve yüzde.
- Biçimi sana bırakıyorum (halka, bar, ya da ikisinin karışımı) ama:
  dört metrik bir bakışta okunmalı, mobilde 375 px'e sığmalı, hedef aşımı
  açıkça belli olmalı.
- Hedefler `GET /api/targets`'tan gelir (sözleşme aşağıda). Hedef yoksa
  bileşen "hedef belirle" durumunu göstersin ve `PUT /api/targets` ile kaydetsin.
- Küçük bir hedef düzenleme formu da senin işin.

### Görev 4 — Token kullanım rozeti

Kullanıcının isteği: *"her sorgu başı token kullanımını hafif gri şekilde sağ altta
laptopta göster, kaç token gitmiş sorgu başı onu bilmem lazım"*.

- Analiz bittikten sonra o sorgunun token kullanımı ve maliyeti.
- **Sağ altta sabit**, **soluk gri**, göze batmayan.
- **Sadece geniş ekranda** (Tailwind `md:` ve üstü) görünsün; telefonda gizli.
- Veri `AnalyzeResult.usage` içinden gelir (sözleşme aşağıda).
- Üstüne gelince/tıklayınca detay (giriş/çıkış token, kaç model çağrısı) açılabilir.

---

## 11. Benim (Claude'un) teslim edeceğim sözleşmeler

Bunları ben yazıyorum, sen **sadece tüketeceksin**. `main`'e kısa süre içinde
düşecek; başlamadan önce `git pull` yap. Henüz yoksa bu tiplere göre kodla,
şekil değişmeyecek.

```ts
// src/lib/day.ts  — GÜN SINIRI ARTIK 12:00
// Kullanıcı gece geç yiyor; gece yarısı sınırı yanlış güne yazıyordu.
export const DAY_START_HOUR = 12;
export function dayKey(iso: string): string;        // "YYYY-MM-DD"
export function currentDayKey(): string;
export function dayLabel(key: string): string;      // "Bugün" | "Dün" | "2 Eylül Sal"
export function dayRange(key: string): { from: string; to: string };  // ISO
```
> Gün gruplaması yapan her yerde `@/lib/format` yerine **`@/lib/day`** kullan.
> `format.ts` içindeki `dayKey`/`todayKey`/`dayLabel` kaldırılacak.

```ts
// src/lib/types.ts — AnalyzeResult ve Entry'ye eklenecek
export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  calls: number;          // kaç model çağrısı yapıldı (ayrıştırma + araştırma)
};
// AnalyzeResult.usage: TokenUsage
// Entry.usage: TokenUsage | null      (eski kayıtlarda null)

export type Targets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};
```

```
GET /api/targets            → { targets: Targets }
PUT /api/targets            body: Partial<Targets> → { ok: true, targets: Targets }
```

---

## 12. Dosya sahipliği — ÇAKIŞMA ÖNLEME

**Sen düzenleyebilirsin:**
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/components/**` (mevcutlar + yeni bileşenler)
- `src/app/upload/UploadClient.tsx`, `src/app/dashboard/DashboardClient.tsx`
  — **yalnızca sunum katmanı**: sınıflar, düzen, yeni görsel bileşen yerleştirme.
  Bu dosyalardaki `fetch` çağrılarını, state mantığını, hesaplamaları değiştirme.
- `public/**` (yeni tema varlıkları)
- Yeni sayfa/bileşen dosyaları

**Dokunma (benim):**
- `src/lib/**` — hepsi
- `src/app/api/**` — hepsi
- `src/proxy.ts`
- `supabase/**`
- `Dockerfile`, `next.config.ts`, `package.json`

**Yeni paket kurman gerekiyorsa önce sor** — `package.json` ortak dosya.

**Dal:** `codex/tema-arayuz` adında bir dal aç, orada çalış, bitince PR aç ya da
haber ver. `main`'e doğrudan push etme.

**Deploy etme.** Coolify'a dağıtımı ben yapıyorum.

---

## 13. Bilmen gereken tuzaklar

1. **Tailwind v4 katman sızıntısı — bu projede iki kez baş ağrıttı.**
   `globals.css`'te katman dışında yazılan her kural Tailwind yardımcı sınıflarını
   ezer. Özel bileşen sınıflarını (`.btn`, `.card`, `.rangebar`) **`@layer components`**,
   eleman kurallarını (`button, input { color: inherit }`) **`@layer base`** içine koy.
   Aksi hâlde `px-3 py-1.5` çalışmaz, `text-[var(--paper)]` siyah üstüne siyah çıkar.

2. **Türkçe büyük harf.** CSS `text-transform: uppercase` Türkçe `i` → `İ`
   dönüşümünü yapmıyor ("TAHMIN" çıkıyor). Etiketleri **veride büyük harf yaz**
   ("TAHMİN", "ETİKET", "VERİTABANI"), CSS ile büyütme.

3. **Ondalık ayracı.** Sayıları `toLocaleString("tr-TR")` ile biçimlendir
   (`2,3 g`, `1.886 kcal`). Karışık kullanma.

4. **Tarayıcı önizleme paneli** `requestAnimationFrame`'i sürekli çalıştırmıyor;
   animasyonlu geçişler "takılı" görünebilir. Her tıklamadan sonra 1-2 ekran
   görüntüsü alarak kare pompala, ya da durumu URL/`localStorage` üzerinden kur.

5. **git kilidi.** Yarıda kalan bir git komutu `.git/*.lock` bırakabiliyor;
   "Another git process seems to be running" görürsen
   `find .git -name "*.lock" -delete`.

6. **iOS.** Ana ekran kısayolu olarak çalışıyor: `env(safe-area-inset-*)`
   kullanan `.safe-top` / `.safe-bottom` sınıflarını bozma. Girdi alanlarında
   `font-size: 16px` altına inme (iOS otomatik yakınlaştırır).

---

## 14. Teslim ölçütleri

- `npm run build` ve `npx tsc --noEmit` temiz geçiyor
- 375 px genişlikte (iPhone) ve masaüstünde denendi, ekran görüntüsü var
- Üç tema da her ekranda denendi; okunabilirlik ve kontrast bozulmuyor
- Klavye odağı görünür, `prefers-reduced-motion` saygı görüyor
- Supabase'e test kaydı bırakılmadı
- Türkçe metinler doğal; sistem/teknik terim kullanıcıya sızmıyor

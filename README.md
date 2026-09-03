# Fit-matik

Ne yediğini yaz ya da paketli bir ürünün fotoğrafını çek; Fit-matik kalorisini
araştırıp günlüğüne yazar. iPhone'da Safari ana ekran kısayolu olarak kullanılmak
üzere tasarlandı.

## Nasıl çalışır

İki aşamalı bir boru hattı:

1. **Ayrıştırma** — `gpt-5-mini`, serbest metni ya da etiket fotoğrafını yapılandırılmış
   yemek kalemlerine çevirir (ad, miktar, marka, etiket besin değerleri).
   Fotoğraf modunda **yalnızca paketli gıda** kabul edilir; tabak yemeği reddedilir.
2. **Veritabanı eşleştirme** — paketli/markalı kalemler **Open Food Facts**'te aranır.
   Barkod varsa doğrudan o ürün çekilir (en güvenilir yol). Eşleştirme kasten katıdır:
   ürün adında bilmediğimiz ayırt edici bir kelime varsa ("Gong" ararken "Gong Pops")
   eşleşme sayılmaz — yanlış ürünü "veritabanı" damgasıyla sunmak, web tahmininden
   daha yanıltıcı olur.
3. **Araştırma** — aynı model, web arama aracıyla her kalemin kalorisini internetten
   toplar, kaynakların söylediği **aralığı** ve tek bir en iyi tahmini üretir:
   *"188-245 arası söyleniyor ama büyük ihtimalle 213 kalori"*. Veritabanı eşleşmesi
   varsa o bağlayıcıdır, web'i ezer.

Aritmetik modele bırakılmaz: **model porsiyonu tahmin eder, veritabanı/etiket 100 g
başına değeri verir, çarpmayı kod yapar.** Her kalemin yanında sayının nereden geldiği
yazar — `ETİKET` · `BARKOD` · `VERİTABANI` · `WEB` · `TAHMİN`.

Sonuç Supabase'e yazılır, `/dashboard`'da gün gün görünür.

## Sayfalar

| Yol | İş |
|---|---|
| `/upload` | Kayıt ekle — yazı veya paket fotoğrafı |
| `/dashboard` | Günlük: bugünün toplamı, son 14 gün, kayıt dökümü |
| `/login` | `APP_PIN` tanımlıysa PIN ekranı |
| `/api/health` | Yapılandırma durumu (anahtar, Supabase, PIN) |

## Kurulum

```bash
npm install
cp .env.example .env.local   # değerleri doldur
npm run dev
```

### Supabase

Uygulama iki depolama biçiminden birini **kendisi seçer**:

1. **Tablo** (tercih edilen) — `supabase/schema.sql` dosyasını Supabase panelindeki
   **SQL Editor**'de çalıştırırsan `public.entries` tablosu oluşur ve uygulama ona yazar.
2. **Storage** (yedek) — tablo yoksa kayıtlar `fitmatik` kovasına
   `log/<gün>/<id>.json` yolunda birer dosya olarak yazılır. Kayıt başına tek dosya
   kullanılır: nesne depoları üzerine yazmada bayat okuma dönebildiği için
   oku‑değiştir‑yaz deseni araya giren kayıtları sessizce kaybederdi.

Hangisinin etkin olduğunu `/api/health` içindeki `store` alanı söyler. Tablo sonradan
açılırsa uygulama bir dakika içinde kendiliğinden ona geçer (eski Storage kayıtları
taşınmaz). Uygulama sunucu tarafında `service_role` anahtarıyla yazar; RLS açıktır ve
politika tanımlı değildir, yani anon anahtarla dışarıdan erişilemez.

Kova `application/json` MIME tipine izin vermelidir (Storage sürücüsü için).

### Ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `OPENAI_API_KEY` | evet | OpenAI anahtarı |
| `OPENAI_MODEL` | hayır | Varsayılan `gpt-5-mini` |
| `SUPABASE_URL` | evet | Proje URL'i |
| `SUPABASE_SERVICE_ROLE_KEY` | evet | Service role anahtarı — asla istemciye gitmez |
| `SUPABASE_BUCKET` | hayır | Varsayılan `fitmatik` |
| `APP_PIN` | hayır | Boşsa site herkese açık olur |
| `APP_SECRET` | hayır | PIN çerezi için tuz |

Supabase tanımlı değilse uygulama çalışır ama kayıtları yalnızca bellekte tutar ve
arayüzde bunu söyleyen bir uyarı gösterir.

## Görünüm

Kağıt zemin, mürekkep siyahı metin, sinyal kırmızısı vurgu. Her sayfa açılışında
`public/motif/` içindeki dövme motiflerinden biri köşede beliriyor (WebP, ~58 KB,
tembel yüklenir, `pointer-events: none`).

## Dağıtım

`Dockerfile` Next.js standalone çıktısı üretir, 3000 portunu dinler. Coolify'da
build pack `dockerfile`, expose port `3000`, ortam değişkenleri yukarıdaki tablodan.

## iPhone kısayolu

Safari'de siteyi aç → Paylaş → **Ana Ekrana Ekle**. Uygulama tam ekran açılır,
`/upload` başlangıç sayfasıdır.

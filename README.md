# Fit-matik

Ne yediğini yaz ya da paketli bir ürünün fotoğrafını çek; Fit-matik kalorisini
araştırıp günlüğüne yazar. iPhone'da Safari ana ekran kısayolu olarak kullanılmak
üzere tasarlandı.

## Nasıl çalışır

İki aşamalı bir boru hattı:

1. **Ayrıştırma** — `gpt-5-mini`, serbest metni ya da etiket fotoğrafını yapılandırılmış
   yemek kalemlerine çevirir (ad, miktar, marka, etiket besin değerleri).
   Fotoğraf modunda **yalnızca paketli gıda** kabul edilir; tabak yemeği reddedilir.
2. **Araştırma** — aynı model, web arama aracıyla her kalemin kalorisini internetten
   toplar, kaynakların söylediği **aralığı** ve tek bir en iyi tahmini üretir:
   *"188-245 arası söyleniyor ama büyük ihtimalle 213 kalori"*.

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

`supabase/schema.sql` dosyasını Supabase panelindeki **SQL Editor**'de çalıştır.
`entries` tablosunu, indeksini ve görseller için `fitmatik` storage kovasını oluşturur.
Uygulama sunucu tarafında `service_role` anahtarıyla yazar; RLS açıktır ve politika
tanımlı değildir, yani anon anahtarla dışarıdan erişilemez.

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

## Dağıtım

`Dockerfile` Next.js standalone çıktısı üretir, 3000 portunu dinler. Coolify'da
build pack `dockerfile`, expose port `3000`, ortam değişkenleri yukarıdaki tablodan.

## iPhone kısayolu

Safari'de siteyi aç → Paylaş → **Ana Ekrana Ekle**. Uygulama tam ekran açılır,
`/upload` başlangıç sayfasıdır.

# Fit-matik

Fit-matik, yazıyla veya paket fotoğrafıyla öğün analizi yapan; sonucu hesaba
bağlı günlükte tutan ve her başarılı analiz için Fitcoin makbuzu gösteren bir
Next.js uygulamasıdır.

## Ana davranışlar

- Telefon numarası tek E.164 kimliğine normalize edilir. Şifre yalnızca
  ASCII harf/rakamdan oluşur ve 8–128 karakterdir; aynı kurallar istemci ve
  sunucuda uygulanır.
- Hesap, günlük kayıtları ve özel yemek görselleri ayrı kullanıcı kapsamına
  sahiptir. Her korumalı istekte imzalı oturum ve hesap sunucuda doğrulanır.
- Yeni hesaplar siyah/neon yeşil temayla ve bir kerelik 5.000 Fitcoin ile
  başlar.
- Dört kalıcı tema Ayarlar'dan seçilir: siyah/neon yeşil, kırmızı/açık
  turuncu, mor/neon pembe, pembe/beyaz-mor.
- WebGL desteklenmezse veya azaltılmış hareket açıksa Velaris, sade CSS renk
  zeminiyle çalışmaya devam eder.
- Google ile giriş, tema görsel seçicileri ve eski dokulu arka planlar yoktur.

## Fitcoin

Ölçek 10.000 FC = $1 şeklindedir. Analiz başlamadan önce üst maliyet kadar
Fitcoin atomik olarak rezerve edilir; başarılı analizde yalnız gerçekleşen
maliyet alınır, kalan tutar iade edilir. Aynı Idempotency-Key ile yapılan
tekrarlar ikinci kez ücretlendirilmez.

Her başarılı analiz, iki OpenAI aşamasının token kullanımını, gerçek web arama
sayısını, sürümlenmiş fiyat kartını ve değişmez muhasebe kaydını saklar.
Uygulamadaki gpt-5-mini kartı, OpenAI'nin [model fiyatları](https://developers.openai.com/api/docs/models/gpt-5-mini)
ve [araç fiyatları](https://developers.openai.com/api/docs/pricing) temel alınarak
$0.25/M giriş, $0.025/M önbellekli giriş, $2/M çıkış ve $10/1k
web araması olarak tanımlanmıştır.

Yetersiz bakiye, OpenAI çağrısından önce 402 döndürür. Başarısız veya
geçersiz bir analiz Fitcoin düşmez.

## Yerel kurulum

    npm install
    cp .env.example .env.local
    npm run dev

Gerekli ortam değişkenleri:

| Değişken | Açıklama |
|---|---|
| OPENAI_API_KEY | OpenAI sunucu anahtarı |
| OPENAI_MODEL | Varsayılan gpt-5-mini |
| SUPABASE_URL | Staging veya canlı Supabase proje URL'i |
| SUPABASE_SERVICE_ROLE_KEY | Sadece sunucuda kullanılan service-role anahtarı |
| SUPABASE_BUCKET | Varsayılan fitmatik-private |
| APP_SECRET | Üretimde zorunlu; sabit, rastgele ve en az 32 bayt |

FATSECRET_* değişkenleri isteğe bağlıdır. SUPABASE_URL veya
SUPABASE_SERVICE_ROLE_KEY yoksa uygulama veri yazmayı reddeder; bellek ya da
eski Storage yedeği yoktur.

## Supabase kurulumu

1. Ayrı bir **staging** Supabase projesi oluşturun.
2. supabase/migrations/20260914130000_account_scoped_fitcoin.sql dosyasını
   staging SQL Editor'de çalıştırın. supabase/schema.sql aynı içeriğin kolay
   çalıştırılabilir kopyasıdır.
3. Staging uygulamasına yalnızca staging Supabase değişkenlerini ve güçlü
   APP_SECRET değerini verin.
4. Kayıt → çıkış → yeniden giriş → Ayarlar → analiz makbuzu akışını
   doğrulayın. Özel görsellerin yalnızca imzalı URL ile yüklendiğini ve RLS/
   Storage politikalarının geniş erişim vermediğini kontrol edin.
5. Coolify/Traefik'in uygulama konteynerine doğrudan internet erişimi
   vermediğini; `X-Forwarded-For`, `X-Real-IP` ve varsa
   `CF-Connecting-IP` başlıklarını istemciden silip güvenilir istemci adresiyle
   yeniden yazdığını doğrulayın. Kayıt ve giriş deneme sınırları bu HMAClenmiş
   adresi telefon sınırıyla birlikte kullanır.
6. Staging doğrulanmadan canlıda hiçbir silme işlemi yapmayın.

supabase/reset-live-user-data.sql, kullanıcı onayıyla canlı geçiş anında
çalıştırılmak üzere hazırlanmış, geri alınamaz kullanıcı-verisi temizliğidir.
Bu dosya kaynak kodu, alan adı, ortam değişkenleri veya statik marka
varlıklarına dokunmaz. Komut dosyası bu depo tarafından otomatik çalıştırılmaz.

## Kontroller

    npm test
    npm run lint
    npx tsc --noEmit
    npm run build

Birim testleri telefon/şifre doğrulamasını, fiyatlandırma/yuvarlama
invariantlarını, rezervasyon üst sınırını ve OpenAI kullanım makbuzlarının
fail-closed davranışını kapsar. Gerçek eşzamanlı bakiye ve hesap-izolasyonu
senaryoları staging Supabase üzerinde doğrulanmalıdır.

## Dağıtım

Dockerfile, Next.js standalone çıktısı üretir ve 3000 portunu dinler.
Coolify'da önce ayrı staging uygulaması ve ayrı Supabase verisi kullanılmalı;
canlı fitmatik.mavrosai.site geçişi ancak staging kontrolleri ve canlı
kullanıcı-verisi temizliği için tekrar onay alındıktan sonra yapılmalıdır.

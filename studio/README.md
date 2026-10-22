# Mavros Studio

Mavros AI alan adında çalışan, **Jett Social Media** skill'inin
(omerucan0/jett-social-media) kurallarıyla sosyal medya tasarımı üreten
sihirbaz. Fit-matik'ten bağımsız bir Next.js uygulamasıdır; bu klasör kendi
`package.json`, `Dockerfile` ve ortam değişkenleriyle ayrı dağıtılır.

## Ne yapar?

Sırayla sorar:

1. **Ne yapıyoruz?** Ajans hizmeti mi, ürün mü, kişisel marka mı… ve paket:
   12 postluk kampanya, tam sosyal medya paketi (12 post + banner) veya sadece banner.
2. **Marka / kişi:** ad, sektör, teklif, hedef kitle, amaç, dil; isteğe bağlı
   ses tonu, CTA, onaylı kanıtlar ve yasaklı konular.
3. **Renk ve yazı:** marka renkleri ya da "sen öner" (teslimde *önerilen* diye işaretlenir).
4. **Referanslar:** logo, marka görselleri, ilham görselleri — rolleriyle.
5. **Banner türü** (tam pakette): üçlü Instagram sırası, platform kapağı veya ikisi.
6. **Tasarım yönü:** konuya özel 3 farklı görsel dünya; referans yoksa da önerir.
7. **Metin planı:** 12 postun metinleri; düzenlenebilir, Jett kurallarıyla doğrulanır.
8. **Üret ve indir:** yazısız arka planlar üretilir, metin ve logo tarayıcıda
   birebir basılır; teknik + gözle kontrol; ZIP paketi.

Jett kuralları korunur: sabit yerleşim matrisi, görsellerde yazı/logo yok,
kaynaksız kanıt/sonuç/garanti iddiası yok, görsel kontrol işaretlenene kadar
"doğrulanmadı". ZIP içinde Jett'in `brand.json` / `posts.json` manifest'i ve
1080×1350 arka planlar da bulunur; Codex'teki Jett renderer'ı aynı kampanyayı
yeniden basabilir.

## Üretici: şimdi OpenAI, sonra Hermes

| `STUDIO_PROVIDER` | Ne olur |
|---|---|
| `openai` (varsayılan) | Planlama `OPENAI_TEXT_MODEL`, görseller `OPENAI_IMAGE_MODEL` ile doğrudan OpenAI API'dan |
| `hermes` | Aynı istekler `HERMES_URL`'e gider; Hermes, Codex aboneliğiyle Jett skill'ini çalıştırır |

Hermes'in uygulaması gereken üç uç nokta: [docs/hermes-contract.md](docs/hermes-contract.md).
Geçiş için yalnız ortam değişkeni değişir; arayüz aynı kalır.

## Yerel çalıştırma

    cd studio
    npm install
    cp .env.example .env.local   # OPENAI_API_KEY'i doldur
    npm run dev                  # http://localhost:3100

Geliştirmede şifre yoksa stüdyo açık çalışır. Üretimde `STUDIO_PASSWORD` ve en
az 32 baytlık `STUDIO_SECRET` zorunludur; yoksa stüdyo kilitli kalır.

## Kontroller

    npm test
    npm run lint
    npx tsc --noEmit
    npm run build

## Dağıtım (Coolify)

Yeni uygulama → aynı depo → **Base Directory: `/studio`**, Dockerfile ile.
Alan adı örneği: `studio.mavrosai.site`. Ortam değişkenleri `.env.example`'da.
Görseller sunucuda saklanmaz; proje metni tarayıcıda taslak olarak tutulur,
görseller yalnız açık sekmede yaşar — indirmeden sekmeyi kapatma.

# Kimlik doğrulama — ön yüz sözleşmesi

Bu dosya, Fit-matik'in telefon/şifre ve Google ile giriş arayüzünün Claude
tarafındaki backend ile bağlantısını tanımlar. Ön yüz şifreyi veya kişisel
profil bilgisini `localStorage`'a yazmaz; veriler yalnızca aşağıdaki isteklerde
gönderilir.

## Google OAuth kurulumu

- Google OAuth istemci kimliği ve gizli anahtarı yalnızca sunucu ortam
  değişkenlerinde tutulmalı; repoya veya tarayıcıya girmemeli.
- Uygulamanın Google sağlayıcı ayarındaki yetkili yönlendirme adresi backend
  callback'i olmalı. Callback başarılı girişten sonra profil eksikse
  `/onboarding`, tamam ise `/upload` yoluna dönmeli.
- Ön yüz Google akışını `GET /api/auth/google?returnTo=/onboarding` veya
  `GET /api/auth/google?returnTo=/upload` ile başlatır. `returnTo` sadece site
  içi bir yol olarak doğrulanmalı.

## Telefon / şifre uçları

### `POST /api/auth/sign-in`

İstek:

```json
{ "phone": "+905XXXXXXXXX", "password": "yalnızca-istek-gövdesinde" }
```

Başarılı yanıt:

```json
{ "ok": true, "profileComplete": true, "next": "/upload" }
```

Profil eksikse `profileComplete: false` veya `next: "/onboarding"` dönmeli.
Telefon için E.164'e normalizasyon ve şifre hashleme backend sorumluluğundadır.

### `POST /api/auth/sign-up`

İstek:

```json
{
  "phone": "+905XXXXXXXXX",
  "password": "yalnızca-istek-gövdesinde",
  "profile": {
    "name": "Salih",
    "age": 30,
    "heightCm": 175,
    "weightKg": 72.5,
    "gender": "erkek"
  },
  "theme": "kagit"
}
```

`theme` değerleri mevcut ön yüz kimlikleriyle eşleşir: `kagit` = Pembe,
`pegasus` = Kırmızı, `karbon` = Siyah. Başarılı yanıtta HTTP-only oturum çerezi
ayarlanmalı ve `{ "ok": true, "next": "/upload" }` dönmelidir.

## Google sonrası profil tamamlama

Google ile giriş yapan kişinin kimliği zaten oturumdan alınır. Ön yüz sadece:

```http
PUT /api/auth/onboarding
Content-Type: application/json
```

ile aşağıdaki gövdeyi yollar:

```json
{
  "profile": {
    "name": "Salih",
    "age": 30,
    "heightCm": 175,
    "weightKg": 72.5,
    "gender": "erkek"
  },
  "theme": "kagit"
}
```

Profil alanları kullanıcı hesabına bağlı kalıcı bir profile yazılmalı; parola
asla bu profil tablosunda veya loglarda tutulmamalıdır. Tüm hata yanıtları
`{ "error": "Kullanıcıya gösterilebilecek Türkçe mesaj" }` biçiminde dönmelidir.

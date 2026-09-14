# Kimlik doğrulama — ön yüz sözleşmesi

Fit-matik yalnızca telefon/şifre ile oturum açar. Google OAuth, kayıt
sırasında tema seçimi ve ayrı bir onboarding akışı bu sürümde yoktur.
Tarayıcı şifreyi veya profil bilgisini `localStorage`'a yazmaz; oturum yalnızca
sunucunun ayarladığı HTTP-only `fm_session` çerezidir.

## Ortak doğrulama

- Telefon, API'ye gönderilmeden önce E.164 biçimine normalize edilir.
  `05XX XXX XX XX`, `5XXXXXXXXX` ve `+90 5XX XXX XX XX` aynı Türkçe numara
  için `+905XXXXXXXXX` olur.
- Şifre 8–128 karakterdir; yalnızca ASCII `A-Z`, `a-z` ve `0-9` kabul edilir.
  İstemci ve sunucu aynı kuralı uygular.
- Hata gövdesi kullanıcıya gösterilebilir Türkçe metinle
  `{ "error": "…" }` biçimindedir.

## `POST /api/auth/sign-in`

İstek:

```json
{ "phone": "+905XXXXXXXXX", "password": "yalnızca-istek-gövdesinde" }
```

Başarılı yanıt HTTP-only oturum çerezini ayarlar ve aşağıdaki biçimdedir:

```json
{ "ok": true, "next": "/upload", "account": { "id": "…" } }
```

Geçersiz telefon veya şifre ayrımı yapılmadan `401` ve `Numara ya da şifre
hatalı.` döner. Üretimde en az 32 baytlık sabit `APP_SECRET` yoksa `503`
döner; varsayılan/geliştirme gizlisi üretimde kullanılmaz.

## `POST /api/auth/sign-up`

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
  }
}
```

`gender` yalnızca `kadin`, `erkek` veya `belirtmek-istemiyorum` olabilir.
Başarılı kayıt atomik olarak hesabı, siyah/neon yeşil temayı, 5.000 Fitcoin
cüzdanını ve başlangıç muhasebe kaydını oluşturur; ardından aynı HTTP-only
oturum çerezini ve `{ "ok": true, "next": "/upload", "account": { … } }`
yanıtını döner.

## Oturumla korunan hesap ayarları

`GET /api/me` yalnızca oturumdaki hesabın güvenli profilini döner.
`PUT /api/me` profil, hedef ve temayı günceller. Geçerli tema değerleri
`siyah`, `kirmizi`, `mor` ve `pembe`dir. Tema Ayarlar ekranında önizlenebilir;
kalıcı olması için `PUT /api/me` başarılı olmalıdır.

`POST /api/auth/sign-out`, sunucudaki oturum çerezini siler. Ön yüz de önceki
hesabın yerel tema önbelleğini temizleyip varsayılan siyah temaya döner.

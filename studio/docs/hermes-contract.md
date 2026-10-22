# Hermes sözleşmesi

Stüdyo `STUDIO_PROVIDER=hermes` iken üretimi Hermes'e devreder. Hermes bu üç
uç noktayı sağladığında arayüzde hiçbir şey değişmez.

Hermes'in işi: isteği Codex'e (Codex aboneliğiyle) iletmek ve Codex'in
`jett-social-media` skill'ini kullanarak cevabı aynı JSON biçiminde döndürmek.
Model talimatı ve JSON şeması istekle birlikte gelir; Hermes'in istem yazması
gerekmez.

## Ortak kurallar

- Adres: `POST {HERMES_URL}/jett/<uç>`
- Kimlik: `Authorization: Bearer {HERMES_TOKEN}` — yanlışsa `401`.
- Gövde ve yanıt `application/json`.
- Hata: uygun HTTP kodu + `{ "error": "Türkçe açıklama" }`. Yoğunlukta `429`.
- Zaman aşımı (stüdyo tarafı): yönler/plan 10 dk, görsel 15 dk.

## 1. `POST /jett/directions`

İstek:

```json
{
  "brief": { "...": "Brief nesnesi (src/lib/types.ts)" },
  "briefText": "Brifin modele hazır metni",
  "instructions": "Sanat yönetmeni talimatı (Jett kuralları)",
  "schema": { "...": "Yanıtın JSON şeması" }
}
```

`brief.references[]` içinde `dataUrl` olarak küçültülmüş görseller gelir.
Yalnız `brand_reference` ve `visual_reference` rolündekiler modele görsel olarak
verilmeli; `logo_asset` yeniden çizilmez.

Yanıt: `{ "directions": [Direction, Direction, Direction] }` — `schema` ile birebir.

## 2. `POST /jett/plan`

İstek: `brief`, seçilen `direction`, `briefText`, `instructions`, `schema`.

Yanıt: `{ "plan": CampaignPlan }`. Stüdyo yanıtı yine de doğrular: sıra 1–12,
sabit yerleşim matrisi, benzersiz dosya adları ve kanıt kuralı sunucuda
zorlanır; kanıtsız `proof/result/guarantee` iddiası kullanıcıya hata olarak
gösterilir.

## 3. `POST /jett/image`

İstek:

```json
{ "prompt": "Tam görsel istemi (yazı yasağı ve negatif alan dahil)", "orientation": "portrait" }
```

- `portrait` → 2:3 dikey (stüdyo 4:5'e kırpar, 1080×1350).
- `landscape` → 3:2 yatay (üçlü sıra ve platform kapağı için kırpılır).

Yanıt: `{ "dataUrl": "data:image/png;base64,..." }` (png, jpeg veya webp).

Görselde **yazı, harf, rakam, logo, filigran olmamalı**: metin ve logo stüdyoda
deterministik olarak basılır. Codex'in yerleşik görsel aracı her çağrıda tek
görsel üretmeli; kolaj yok.

## Codex tarafı için kısa not

Codex'e verilecek görev şablonu:

> `$jett-social-media` skill'ini kullan. Aşağıdaki talimatı uygula ve yalnızca
> verilen JSON şemasına uyan JSON döndür. [instructions] [briefText] [schema]

Görsel için:

> `$jett-social-media` image-generation kurallarıyla tek bir görsel üret:
> [prompt]. Yön: [orientation]. Dosyayı base64 PNG olarak döndür.

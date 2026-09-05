#!/usr/bin/env python3
"""
Arka plan görsellerini içe aktarır.

Kullanım:
    python3 scripts/arkaplan-ekle.py <klasör> [--uygula]

Yaptığı iş:
  - Klasördeki görselleri tarar, yönüne göre desktop/mobile ayırır
  - Baskın renge göre temayı tahmin eder (pembe / kirmizi / siyah)
  - public/auth/backgrounds/<tema>-<yön>-<sıra>.webp olarak yazar
  - Boyutu 1920 (yatay) / 1080 (dikey) genişliğe indirir, WebP'ye çevirir

--uygula verilmezse yalnızca ne yapacağını yazar, dosyaya dokunmaz.
"""
import sys, os, glob
from collections import Counter
from PIL import Image

DEST = "public/auth/backgrounds"
EXTS = ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.PNG", "*.JPG", "*.JPEG")


def tema_tahmin(im: Image.Image) -> str:
    """Baskın renkten temayı çıkar: doygun pembe/magenta, kırmızı/altın, yoksa siyah."""
    kucuk = im.convert("RGB").resize((80, 80))
    pembe = kirmizi = renkli = 0
    for r, g, b in kucuk.getdata():
        mx, mn = max(r, g, b), min(r, g, b)
        if mx < 40 or mx - mn < 30:      # koyu ya da gri: temaya işaret etmiyor
            continue
        renkli += 1
        if r > 90 and b > 60 and b >= g and r - g > 40:
            pembe += 1                    # magenta/pembe ailesi
        elif r > 90 and r - b > 50 and g >= b:
            kirmizi += 1                  # kırmızı/turuncu/altın ailesi
    if renkli < 200:
        return "siyah"
    return "pembe" if pembe >= kirmizi else "kirmizi"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    kaynak = os.path.expanduser(sys.argv[1])
    uygula = "--uygula" in sys.argv

    dosyalar = sorted(f for p in EXTS for f in glob.glob(os.path.join(kaynak, "**", p), recursive=True))
    if not dosyalar:
        print(f"HATA: {kaynak} içinde görsel bulunamadı.")
        return 1

    sayac = Counter()
    # Var olan dosyalar korunsun; sıra numarası onların üstünden devam etsin.
    for mevcut in glob.glob(f"{DEST}/*"):
        ad = os.path.basename(mevcut)
        for tema in ("pembe", "kirmizi", "siyah"):
            for yon in ("desktop", "mobile"):
                if ad.startswith(f"{tema}-{yon}"):
                    sayac[(tema, yon)] += 1

    plan = []
    for yol in dosyalar:
        try:
            im = Image.open(yol)
        except Exception as e:
            print(f"  atlandı ({e}): {os.path.basename(yol)}")
            continue
        yon = "desktop" if im.width >= im.height else "mobile"
        tema = tema_tahmin(im)
        sayac[(tema, yon)] += 1
        n = sayac[(tema, yon)]
        hedef = f"{DEST}/{tema}-{yon}-{n}.webp"
        plan.append((yol, hedef, tema, yon, im))

    print(f"{len(plan)} görsel:")
    for yol, hedef, tema, yon, im in plan:
        print(f"  {os.path.basename(yol):<44} {im.width}x{im.height} → {os.path.basename(hedef)}")

    if not uygula:
        print("\n(deneme modu — yazmak için --uygula ekle)")
        return 0

    os.makedirs(DEST, exist_ok=True)
    toplam = 0
    for yol, hedef, tema, yon, im in plan:
        im = im.convert("RGB")
        genislik = 1920 if yon == "desktop" else 1080
        if im.width > genislik:
            oran = genislik / im.width
            im = im.resize((genislik, round(im.height * oran)), Image.LANCZOS)
        im.save(hedef, "WEBP", quality=82, method=6)
        boyut = os.path.getsize(hedef)
        toplam += boyut
        print(f"  yazıldı {os.path.basename(hedef)}  {boyut/1024:.0f} KB")
    print(f"\ntoplam {toplam/1024/1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

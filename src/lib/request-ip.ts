/**
 * Coolify/Traefik'in dış istemci adresiyle doldurduğu başlıklar. Canlıda
 * reverse proxy, istemciden gelen aynı adlı başlıkları mutlaka silip yeniden
 * yazmalıdır; bu değerler yalnızca HMAClenmiş rate-limit anahtarında kullanılır.
 */
export function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    // Traefik tipik olarak doğrulanmış istemci adresini listenin sonuna ekler.
    if (parts.length) return parts[parts.length - 1].slice(0, 128);
  }

  const direct = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip");
  if (direct) return direct.trim().slice(0, 128);

  return "unknown";
}

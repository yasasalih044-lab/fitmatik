import { hermesProvider } from "./hermes";
import { openaiProvider } from "./openai";
import { StudioError, type StudioProvider } from "./types";

export { StudioError } from "./types";

/** STUDIO_PROVIDER=openai (varsayılan) veya hermes. */
export function getProvider(): StudioProvider {
  const name = (process.env.STUDIO_PROVIDER || "openai").toLowerCase();
  if (name === "openai") return openaiProvider;
  if (name === "hermes") return hermesProvider;
  throw new StudioError(`Bilinmeyen STUDIO_PROVIDER: ${name}`, 500);
}

/** Route handler'lar için ortak hata yanıtı. */
export function errorResponse(err: unknown): Response {
  if (err instanceof StudioError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return Response.json({ error: "Üretici zamanında yanıt vermedi; tekrar deneyin." }, { status: 504 });
  }
  console.error(err);
  return Response.json({ error: "Beklenmeyen bir hata oluştu." }, { status: 500 });
}

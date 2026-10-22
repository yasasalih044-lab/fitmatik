export function GET() {
  return Response.json({ ok: true, provider: (process.env.STUDIO_PROVIDER || "openai").toLowerCase() });
}

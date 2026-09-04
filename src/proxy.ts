import { NextResponse, type NextRequest } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/accounts";

/** Oturum gerektirmeyen yollar. */
const PUBLIC = [
  "/login", "/kayit",
  "/api/auth", "/api/health",
  "/manifest.webmanifest", "/icon", "/apple-icon", "/favicon.ico",
  "/marka", "/auth",
];

const isPublic = (p: string) => PUBLIC.some((x) => p === x || p.startsWith(`${x}/`));

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const userId = readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  // Girişten sonra kullanıcıyı geldiği yere geri götür; yalnızca site içi yollar.
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

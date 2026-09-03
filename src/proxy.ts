import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, expectedToken, pinRequired } from "@/lib/auth";

const PUBLIC = ["/login", "/api/auth", "/api/health", "/manifest.webmanifest", "/icon", "/apple-icon", "/favicon.ico", "/motif"];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pinRequired()) return NextResponse.next();
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (token && token === (await expectedToken())) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, verifySession } from "@/lib/auth";

/** Oturum gerektirmeyen yollar. */
const PUBLIC = ["/giris", "/api/auth", "/api/health", "/icon"];

const isPublic = (p: string) => PUBLIC.some((x) => p === x || p.startsWith(`${x}/`));

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const mode = authMode();
  if (mode === "open") return NextResponse.next();
  if (mode === "misconfigured") {
    return new NextResponse("Stüdyo kilitli: STUDIO_PASSWORD ve en az 32 baytlık STUDIO_SECRET tanımlanmalı.", { status: 503 });
  }
  if (verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/giris";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

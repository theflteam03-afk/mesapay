import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIES, verifySession } from "@mesapay/auth/session";

/** Barreira rápida (sem banco): sem sessão válida → /login. O layout revalida no banco. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIES.owner)?.value, "owner");

  if (pathname.startsWith("/login")) {
    return session ? NextResponse.redirect(new URL("/mesas", req.url)) : NextResponse.next();
  }
  if (!session) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|api/health).*)"],
};

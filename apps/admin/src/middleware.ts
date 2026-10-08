import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIES, verifySession } from "@mesapay/auth/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const admin = await verifySession(req.cookies.get(SESSION_COOKIES.admin)?.value, "admin");

  if (pathname === "/login/2fa") {
    if (admin) return NextResponse.redirect(new URL("/", req.url));
    const mfa = await verifySession(req.cookies.get(SESSION_COOKIES["admin-mfa"])?.value, "admin-mfa");
    return mfa ? NextResponse.next() : NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname.startsWith("/login")) {
    return admin ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (!admin) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.svg|api/health).*)"],
};

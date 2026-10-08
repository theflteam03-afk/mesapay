import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIES, verifySession } from "@mesapay/auth/session";
import { prisma } from "@mesapay/db";

export const getAdminSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIES.admin)?.value;
  const session = await verifySession(token, "admin");
  if (!session) return null;
  const user = await prisma.saasUser.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true, active: true, totpSecret: true },
  });
  // Conta desativada ou sem 2FA ativo → sessão inválida.
  if (!user?.active || !user.totpSecret) return null;
  const { totpSecret: _omit, ...safe } = user;
  return safe;
});

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}

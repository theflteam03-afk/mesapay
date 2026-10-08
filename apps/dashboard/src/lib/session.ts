import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIES, verifySession } from "@mesapay/auth/session";
import { prisma } from "@mesapay/db";

/**
 * Sessão do dispositivo do restaurante. Revalida no banco a cada pedido: se o dono for
 * removido ou o restaurante suspenso, o cookie deixa de servir mesmo antes de expirar.
 */
export const getOwnerSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIES.owner)?.value;
  const session = await verifySession(token, "owner");
  if (!session?.rid) return null;
  const owner = await prisma.ownerUser.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      name: true,
      email: true,
      restaurant: {
        select: { id: true, name: true, slug: true, theme: true, primaryColor: true, status: true, plan: true, logoUrl: true },
      },
    },
  });
  if (!owner || owner.restaurant.id !== session.rid) return null;
  if (owner.restaurant.status === "SUSPENDED" || owner.restaurant.status === "DISABLED") return null;
  return owner;
});

export type OwnerSession = NonNullable<Awaited<ReturnType<typeof getOwnerSession>>>;

export async function requireOwnerSession(): Promise<OwnerSession> {
  const session = await getOwnerSession();
  if (!session) redirect("/login");
  return session;
}

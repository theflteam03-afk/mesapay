import "server-only";
import { cache } from "react";
import { prisma } from "@mesapay/db";

/**
 * Resolve o QR da mesa. O token é aleatório (16+ caracteres) e é a única coisa que dá acesso à mesa;
 * o slug na URL tem de corresponder ao restaurante do token.
 */
export const resolveTable = cache(async (slug: string, qrToken: string) => {
  if (!/^[A-Za-z0-9]{16,64}$/.test(qrToken)) return null;
  const table = await prisma.table.findUnique({
    where: { qrToken },
    select: {
      id: true,
      number: true,
      label: true,
      active: true,
      restaurant: {
        select: { id: true, slug: true, name: true, logoUrl: true, theme: true, primaryColor: true, status: true, locales: true },
      },
    },
  });
  if (!table || !table.active || table.restaurant.slug !== slug) return null;
  return table;
});

export type ResolvedTable = NonNullable<Awaited<ReturnType<typeof resolveTable>>>;

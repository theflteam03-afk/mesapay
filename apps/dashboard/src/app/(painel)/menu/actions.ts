"use server";

import { revalidatePath } from "next/cache";
import { withTenant } from "@mesapay/db";
import { publish } from "@mesapay/realtime/events";
import { requireOwnerSession } from "@/lib/session";

/**
 * Liga/desliga "Esgotado" num prato. Efeito imediato em todos os celulares abertos no menu
 * (evento menu.updated em tempo real) e o servidor passa a recusar pedidos desse prato.
 * Na Fase 4 esta ação passa a pedir o PIN de um funcionário com permissão "menu".
 */
export async function setSoldOut(menuItemId: string, soldOut: boolean): Promise<{ ok: boolean }> {
  const { restaurant } = await requireOwnerSession();
  const ok = await withTenant(restaurant.id, async (tx) => {
    const r = await tx.menuItem.updateMany({ where: { id: menuItemId }, data: { soldOut } });
    if (r.count === 0) return false;
    await publish(tx, { type: "menu.updated", restaurantId: restaurant.id, menuItemId, soldOut });
    return true;
  });
  revalidatePath("/menu");
  return { ok };
}

"use server";

import { ServiceError } from "@mesapay/db/services";
import { reprintOrder, retryFailedJobs, setOrderStatus, type SettableOrderStatus } from "@mesapay/db/print";
import { requireOwnerSession } from "@/lib/session";

/**
 * Ações da tela Cozinha. Na Fase 4 passam a exigir o PIN de um funcionário com permissão.
 * Devolvem { ok } em vez de lançar: um toque duplo ou um pedido já avançado noutro ecrã
 * não deve mostrar erro, só recarregar.
 */
const ALLOWED: SettableOrderStatus[] = ["SENT", "PREPARING", "READY", "DELIVERED", "CANCELLED", "PRINTED"];

export async function changeOrderStatus(orderId: string, status: SettableOrderStatus): Promise<{ ok: boolean }> {
  const { restaurant } = await requireOwnerSession();
  if (!ALLOWED.includes(status)) return { ok: false };
  try {
    await setOrderStatus(restaurant.id, orderId, status);
    return { ok: true };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false };
    throw err;
  }
}

export async function reprint(orderId: string): Promise<{ ok: boolean; tickets: number }> {
  const { restaurant } = await requireOwnerSession();
  try {
    return { ok: true, tickets: await reprintOrder(restaurant.id, orderId) };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, tickets: 0 };
    throw err;
  }
}

export async function retryFailed(printerId: string): Promise<{ ok: boolean }> {
  const { restaurant } = await requireOwnerSession();
  await retryFailedJobs(restaurant.id, printerId);
  return { ok: true };
}

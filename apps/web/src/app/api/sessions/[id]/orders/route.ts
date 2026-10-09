import { NextResponse } from "next/server";
import type { CartLineInput } from "@mesapay/core";
import { createGuestOrder, findOrderByClientRef, findSessionRestaurant } from "@mesapay/db/services";
import { readDeviceId } from "@/lib/device";
import { clientIp, errorResponse, fail, noStore, readJson } from "@/lib/http";
import { limits } from "@/lib/limits";

export const dynamic = "force-dynamic";

function parseLines(raw: unknown): CartLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 30) return null;
  const lines: CartLineInput[] = [];
  for (const l of raw) {
    if (!l || typeof l !== "object") return null;
    const o = l as Record<string, unknown>;
    if (typeof o.menuItemId !== "string" || typeof o.quantity !== "number") return null;
    const optionIds = o.optionIds ?? [];
    if (!Array.isArray(optionIds) || optionIds.length > 20 || !optionIds.every((x) => typeof x === "string")) return null;
    if (o.note != null && typeof o.note !== "string") return null;
    lines.push({ menuItemId: o.menuItemId, quantity: o.quantity, optionIds: optionIds as string[], note: (o.note as string | null) ?? null });
  }
  return lines;
}

/**
 * POST { clientRef, lines: [{ menuItemId, quantity, optionIds, note }], note }
 * Novo pedido do cliente. `clientRef` (UUID gerado no celular) torna o envio idempotente.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deviceId = await readDeviceId();
  if (!deviceId) return fail("NOT_A_GUEST", 403);

  const body = (await readJson(req)) as { clientRef?: unknown; lines?: unknown; note?: unknown } | null;
  const lines = parseLines(body?.lines);
  if (!body || typeof body.clientRef !== "string" || !lines || (body.note != null && typeof body.note !== "string")) {
    return fail("INVALID_REQUEST", 400);
  }

  const s = await findSessionRestaurant(id);
  if (!s) return fail("SESSION_NOT_FOUND", 404);

  try {
    // Reenvio do mesmo carrinho (rede fraca): devolve o pedido já criado, sem contar no anti-spam.
    const dup = await findOrderByClientRef(s.restaurantId, body.clientRef);
    if (dup) return NextResponse.json(dup, { headers: noStore });

    const ipHit = await limits.orderPerIp.hit(await clientIp());
    if (!ipHit.ok) return fail("RATE_LIMITED", 429, { retryAfterMs: ipHit.retryAfterMs });
    const devHit = await limits.orderPerDevice.hit(deviceId);
    if (!devHit.ok) return fail("RATE_LIMITED", 429, { retryAfterMs: devHit.retryAfterMs });

    const order = await createGuestOrder(s.restaurantId, id, {
      deviceId,
      clientRef: body.clientRef,
      lines,
      note: (body.note as string | null | undefined) ?? null,
    });
    return NextResponse.json(order, { status: order.duplicate ? 200 : 201, headers: noStore });
  } catch (err) {
    // Pedido recusado (esgotado, opção em falta…): não gasta a vez de 10 s do celular.
    await limits.orderPerDevice.reset(deviceId);
    return errorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { findSessionRestaurant, getBill } from "@mesapay/db/services";
import { readDeviceId } from "@/lib/device";
import { errorResponse, fail, noStore } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Conta da mesa: itens por pessoa, total, pago e em falta. Só para quem está na mesa. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deviceId = await readDeviceId();
  if (!deviceId) return fail("NOT_A_GUEST", 403);
  const s = await findSessionRestaurant(id);
  if (!s) return fail("SESSION_NOT_FOUND", 404);
  try {
    return NextResponse.json(await getBill(s.restaurantId, id, deviceId), { headers: noStore });
  } catch (err) {
    return errorResponse(err);
  }
}

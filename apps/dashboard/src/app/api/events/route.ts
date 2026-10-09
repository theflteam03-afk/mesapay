import { NextResponse } from "next/server";
import { sseResponse } from "@mesapay/realtime/server";
import { getOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Avisos em tempo real do restaurante para o painel (pedidos, impressão, mesas, menu). */
export async function GET(req: Request) {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const restaurantId = session.restaurant.id;
  return sseResponse((e) => e.restaurantId === restaurantId, { signal: req.signal, maxDurationMs: 270_000 });
}

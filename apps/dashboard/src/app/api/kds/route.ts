import { NextResponse } from "next/server";
import { getKitchenBoard } from "@mesapay/db/print";
import { getOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Dados da tela Cozinha (KDS): pedidos abertos e estado das impressoras. */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json(await getKitchenBoard(session.restaurant.id), { headers: { "Cache-Control": "no-store" } });
}

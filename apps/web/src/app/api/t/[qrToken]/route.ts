import { NextResponse } from "next/server";
import { findTableByToken, loadMenu } from "@mesapay/db/services";
import { fail, noStore, tableLocale } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Menu atual da mesa (o celular volta a pedi-lo quando recebe "menu.updated", ex.: esgotado). */
export async function GET(_req: Request, { params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const table = await findTableByToken(qrToken);
  if (!table) return fail("TABLE_NOT_FOUND", 404);
  if (table.restaurant.status !== "ACTIVE") return fail("RESTAURANT_UNAVAILABLE", 423);
  const locale = await tableLocale(table.restaurant.locales);
  const menu = await loadMenu(table.restaurant.id, locale);
  return NextResponse.json({ menu }, { headers: noStore });
}

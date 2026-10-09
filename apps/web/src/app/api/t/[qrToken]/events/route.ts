import { findTableByToken } from "@mesapay/db/services";
import { prisma } from "@mesapay/db";
import { isSessionEvent } from "@mesapay/realtime/events";
import { sseResponse } from "@mesapay/realtime/server";
import { readDeviceId } from "@/lib/device";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel: a ligação SSE dura até ~5 min e o navegador religa sozinho.
export const maxDuration = 300;

/**
 * Avisos em tempo real para um celular na mesa (SSE):
 *  - mudanças no menu do restaurante (esgotado, preço);
 *  - eventos da comanda `?session=` — só se este celular estiver nessa comanda.
 */
export async function GET(req: Request, { params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const table = await findTableByToken(qrToken);
  if (!table) return fail("TABLE_NOT_FOUND", 404);
  const restaurantId = table.restaurant.id;

  const sessionId = new URL(req.url).searchParams.get("session");
  let allowedSession: string | null = null;
  const deviceId = await readDeviceId();
  if (sessionId && deviceId) {
    const guest = await prisma.guest.findUnique({
      where: { deviceId_sessionId: { deviceId, sessionId } },
      select: { session: { select: { tableId: true } } },
    });
    if (guest?.session.tableId === table.id) allowedSession = sessionId;
  }

  return sseResponse(
    (e) => {
      if (e.restaurantId !== restaurantId) return false;
      if (e.type === "menu.updated") return true;
      return allowedSession !== null && isSessionEvent(e) && e.sessionId === allowedSession;
    },
    { signal: req.signal, maxDurationMs: 270_000 },
  );
}

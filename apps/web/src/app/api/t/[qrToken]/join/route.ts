import { NextResponse } from "next/server";
import { findTableByToken, joinTable } from "@mesapay/db/services";
import { readDeviceId, writeDeviceId } from "@/lib/device";
import { clientIp, errorResponse, fail, noStore, readJson } from "@/lib/http";
import { limits } from "@/lib/limits";

export const dynamic = "force-dynamic";

/**
 * POST { deviceId?, name } → entra na comanda aberta da mesa (cria se não houver).
 * O deviceId vem do localStorage; se o navegador o perdeu, usa o cookie.
 */
export async function POST(req: Request, { params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const body = (await readJson(req)) as { deviceId?: unknown; name?: unknown } | null;
  if (!body || typeof body.name !== "string") return fail("INVALID_NAME", 400);

  const fromBody = typeof body.deviceId === "string" ? body.deviceId : null;
  const deviceId = fromBody ?? (await readDeviceId());
  if (!deviceId) return fail("INVALID_DEVICE", 400);

  const ipHit = await limits.joinPerIp.hit(await clientIp());
  const devHit = await limits.joinPerDevice.hit(deviceId);
  if (!ipHit.ok || !devHit.ok) return fail("RATE_LIMITED", 429, { retryAfterMs: Math.max(ipHit.retryAfterMs, devHit.retryAfterMs) });

  const table = await findTableByToken(qrToken);
  if (!table) return fail("TABLE_NOT_FOUND", 404);

  try {
    const result = await joinTable(table, { deviceId, name: body.name });
    await writeDeviceId(deviceId);
    return NextResponse.json({ ...result, deviceId }, { headers: noStore });
  } catch (err) {
    return errorResponse(err);
  }
}

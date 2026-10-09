import { NextResponse } from "next/server";
import { completeJob, getBrowserPrinter } from "@mesapay/db/print";
import { getOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ printerId: string; jobId: string }> }) {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { printerId, jobId } = await params;
  const printer = await getBrowserPrinter(session.restaurant.id, printerId);
  if (!printer) return NextResponse.json({ error: "UNKNOWN_PRINTER" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { ok?: unknown; error?: unknown } | null;
  const r = await completeJob(printer, jobId, body?.ok === false ? { ok: false, error: String(body.error ?? "Erro ao imprimir") } : { ok: true });
  return NextResponse.json(r, { status: r.found ? 200 : 404 });
}

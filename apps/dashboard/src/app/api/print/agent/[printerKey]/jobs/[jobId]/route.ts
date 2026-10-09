import { NextResponse } from "next/server";
import { authenticatePrinter, completeJob } from "@mesapay/db/print";

export const dynamic = "force-dynamic";

/** Resultado de um ticket enviado pelo agente local: { ok: true } ou { ok: false, error }. */
export async function POST(req: Request, { params }: { params: Promise<{ printerKey: string; jobId: string }> }) {
  const { printerKey, jobId } = await params;
  const printer = await authenticatePrinter(printerKey);
  if (!printer || printer.type !== "LOCAL_AGENT") return NextResponse.json({ error: "UNKNOWN_PRINTER" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { ok?: unknown; error?: unknown } | null;
  if (!body || typeof body.ok !== "boolean") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const result = body.ok ? ({ ok: true } as const) : ({ ok: false, error: typeof body.error === "string" ? body.error : "Erro na impressora" } as const);
  const r = await completeJob(printer, jobId, result);
  return NextResponse.json(r, { status: r.found ? 200 : 404 });
}

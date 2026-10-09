import { NextResponse } from "next/server";
import { authenticatePrinter, claimNextJob } from "@mesapay/db/print";
import { toEscPos } from "@mesapay/print";

export const dynamic = "force-dynamic";

/**
 * Agente local (MesaPay Print) pede o próximo ticket desta impressora.
 * Resposta: { job: { id, escpos (base64), text }, address } ou { job: null }.
 * Cada pedido também conta como "sinal de vida" (lastSeenAt) para o alerta de offline.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ printerKey: string }> }) {
  const { printerKey } = await params;
  const printer = await authenticatePrinter(printerKey);
  if (!printer || printer.type !== "LOCAL_AGENT") return NextResponse.json({ error: "UNKNOWN_PRINTER" }, { status: 401 });
  const job = await claimNextJob(printer);
  return NextResponse.json(
    {
      printer: { name: printer.name, address: printer.address },
      job: job ? { id: job.id, attempt: job.attempt, text: job.payload, escpos: Buffer.from(toEscPos(job.payload)).toString("base64") } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

import { NextResponse } from "next/server";
import { authenticatePrinter, claimNextJob, completeJob } from "@mesapay/db/print";
import { eposPrintRequestXml, parseEpsonResponse } from "@mesapay/print";

export const dynamic = "force-dynamic";

/**
 * Epson Server Direct Print (TM-m30III / TM-m30II). URL a configurar na impressora:
 *   https://app.mesapay.com.br/api/print/epson/{printerKey}
 * A impressora faz POST (form) com ConnectionType=GetRequest para pedir trabalho e
 * ConnectionType=SetResponse (ResponseFile = XML) para devolver o resultado.
 */
export async function POST(req: Request, { params }: { params: Promise<{ printerKey: string }> }) {
  const { printerKey } = await params;
  const p = await authenticatePrinter(printerKey);
  if (!p || p.type !== "EPSON_SDP") return new NextResponse(null, { status: 401 });

  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("ConnectionType") ?? "GetRequest");

  if (kind === "SetResponse") {
    for (const r of parseEpsonResponse(String(form?.get("ResponseFile") ?? ""))) {
      await completeJob(p, r.jobId, r.success ? { ok: true } : { ok: false, error: `Epson: ${r.code || "erro"}` });
    }
    return new NextResponse(null, { status: 200 });
  }

  const job = await claimNextJob(p);
  // Sem trabalho: resposta vazia (a impressora volta a perguntar no próximo intervalo).
  if (!job) return new NextResponse("", { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  return new NextResponse(eposPrintRequestXml(job.payload, job.id), {
    headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}

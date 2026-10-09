import { NextResponse } from "next/server";
import { authenticatePrinter, claimNextJob, completeJob, peekNextJob } from "@mesapay/db/print";
import { CLOUDPRNT_MEDIA_TYPE, cloudPrntPoll, cloudPrntSucceeded } from "@mesapay/print";

export const dynamic = "force-dynamic";

/**
 * Star CloudPRNT. URL a configurar na impressora (Server URL):
 *   https://app.mesapay.com.br/api/print/cloudprnt/{printerKey}
 * Intervalo de polling recomendado: 2–5 s.
 */
type Ctx = { params: Promise<{ printerKey: string }> };

async function printer(ctx: Ctx) {
  const { printerKey } = await ctx.params;
  const p = await authenticatePrinter(printerKey);
  return p && p.type === "CLOUDPRNT" ? p : null;
}

/** 1) "Há trabalho?" */
export async function POST(_req: Request, ctx: Ctx) {
  const p = await printer(ctx);
  if (!p) return new NextResponse(null, { status: 401 });
  return NextResponse.json(cloudPrntPoll(await peekNextJob(p)), { headers: { "Cache-Control": "no-store" } });
}

/** 2) Descarrega o ticket. */
export async function GET(req: Request, ctx: Ctx) {
  const p = await printer(ctx);
  if (!p) return new NextResponse(null, { status: 401 });
  const token = new URL(req.url).searchParams.get("token");
  const job = (token ? await claimNextJob(p, { jobId: token }) : null) ?? (await claimNextJob(p));
  if (!job) return new NextResponse(null, { status: 404 });
  return new NextResponse(job.payload, {
    headers: { "Content-Type": `${CLOUDPRNT_MEDIA_TYPE}; charset=utf-8`, "Cache-Control": "no-store", "X-Star-Cut": "partial; feed=true" },
  });
}

/** 3) Resultado: code=200 OK → impresso; outro código → volta para a fila. */
export async function DELETE(req: Request, ctx: Ctx) {
  const p = await printer(ctx);
  if (!p) return new NextResponse(null, { status: 401 });
  const q = new URL(req.url).searchParams;
  const code = q.get("code");
  await completeJob(p, q.get("token"), cloudPrntSucceeded(code) ? { ok: true } : { ok: false, error: `CloudPRNT: ${code ?? "sem código"}` });
  return new NextResponse(null, { status: 200 });
}

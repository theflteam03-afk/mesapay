import { NextResponse } from "next/server";
import { claimNextJob, getBrowserPrinter } from "@mesapay/db/print";
import { getOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Impressão pelo navegador (opção C): a tela Cozinha aberta neste computador pede o
 * próximo ticket da impressora "navegador" escolhida e imprime-o com window.print().
 */
export async function POST(_req: Request, { params }: { params: Promise<{ printerId: string }> }) {
  const session = await getOwnerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { printerId } = await params;
  const printer = await getBrowserPrinter(session.restaurant.id, printerId);
  if (!printer) return NextResponse.json({ error: "UNKNOWN_PRINTER" }, { status: 404 });
  const job = await claimNextJob(printer);
  return NextResponse.json({ job: job ? { id: job.id, text: job.payload } : null, width: printer.width }, { headers: { "Cache-Control": "no-store" } });
}

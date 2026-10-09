"use server";

import { revalidatePath } from "next/cache";
import { ServiceError } from "@mesapay/db/services";
import { createPrinter, regeneratePrinterKey, removePrinter, updatePrinter, type PrinterInput } from "@mesapay/db/print";
import { requireOwnerSession } from "@/lib/session";

export interface PrinterFormState {
  error?: string;
  ok?: boolean;
}

const TYPES = ["BROWSER", "LOCAL_AGENT", "CLOUDPRNT", "EPSON_SDP"] as const;

function readForm(form: FormData): PrinterInput | null {
  const type = String(form.get("type") ?? "");
  const station = String(form.get("station") ?? "");
  if (!TYPES.includes(type as (typeof TYPES)[number]) || (station !== "KITCHEN" && station !== "BAR")) return null;
  return {
    name: String(form.get("name") ?? ""),
    station,
    type: type as PrinterInput["type"],
    address: String(form.get("address") ?? ""),
    width: Number(form.get("width") ?? 48),
  };
}

/** Na Fase 4 as configurações passam a exigir o PIN de um funcionário com cargo de dono. */
export async function savePrinter(_prev: PrinterFormState, form: FormData): Promise<PrinterFormState> {
  const { restaurant } = await requireOwnerSession();
  const input = readForm(form);
  if (!input) return { error: "invalid" };
  const id = String(form.get("id") ?? "");
  try {
    if (id) await updatePrinter(restaurant.id, id, input);
    else await createPrinter(restaurant.id, input);
  } catch (err) {
    if (err instanceof ServiceError) return { error: "invalid" };
    throw err;
  }
  revalidatePath("/configuracoes");
  revalidatePath("/cozinha");
  return { ok: true };
}

export async function deletePrinter(printerId: string) {
  const { restaurant } = await requireOwnerSession();
  await removePrinter(restaurant.id, printerId);
  revalidatePath("/configuracoes");
}

export async function newPrinterKey(printerId: string) {
  const { restaurant } = await requireOwnerSession();
  await regeneratePrinterKey(restaurant.id, printerId);
  revalidatePath("/configuracoes");
}

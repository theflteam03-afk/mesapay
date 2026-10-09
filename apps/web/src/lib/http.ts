import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ServiceError } from "@mesapay/db/services";
import type { ServiceErrorDTO } from "@mesapay/db/types";
import { LOCALES, negotiateLocale, type Locale } from "@mesapay/i18n";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Idioma do celular, limitado aos idiomas ativos do restaurante. */
export async function tableLocale(restaurantLocales: string[]): Promise<Locale> {
  const allowed = LOCALES.filter((l) => restaurantLocales.includes(l));
  return negotiateLocale((await headers()).get("accept-language"), allowed.length ? allowed : ["pt-BR"]);
}

export function errorResponse(err: unknown): NextResponse<ServiceErrorDTO | { error: "INTERNAL" }> {
  if (err instanceof ServiceError) {
    return NextResponse.json({ error: err.code, ...err.extra }, { status: err.status, headers: noStore });
  }
  console.error("[api] erro inesperado:", err);
  return NextResponse.json({ error: "INTERNAL" }, { status: 500, headers: noStore });
}

export function fail(error: ServiceErrorDTO["error"], status: number, extra: Omit<ServiceErrorDTO, "error"> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: noStore });
}

export const noStore = { "Cache-Control": "no-store" } as const;

/** Lê JSON do corpo com limite de tamanho (pedidos têm no máximo 30 itens). */
export async function readJson(req: Request, maxBytes = 16_384): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

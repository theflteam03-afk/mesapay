import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { findTableByToken, loadMenu } from "@mesapay/db/services";
import { createTranslator, getDictionary } from "@mesapay/i18n";
import { brandStyle, themeMode } from "@mesapay/ui";
import { tableLocale } from "@/lib/http";
import { TableApp } from "./table-app";

type Params = { slug: string; qrToken: string };

export const dynamic = "force-dynamic";

async function resolve(slug: string, qrToken: string) {
  const table = await findTableByToken(qrToken);
  // O token é o que dá acesso; o slug na URL tem de corresponder ao restaurante do token.
  if (!table || table.restaurant.slug !== slug) return null;
  return table;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, qrToken } = await params;
  const table = await resolve(slug, qrToken);
  return {
    title: table ? table.restaurant.name : "Mesa não encontrada",
    robots: { index: false, follow: false },
  };
}

export async function generateViewport({ params }: { params: Promise<Params> }): Promise<Viewport> {
  const { slug, qrToken } = await params;
  const table = await resolve(slug, qrToken);
  return { themeColor: table?.restaurant.primaryColor ?? "#e11d48" };
}

export default async function TablePage({ params }: { params: Promise<Params> }) {
  const { slug, qrToken } = await params;
  const table = await resolve(slug, qrToken);
  if (!table) notFound();
  const r = table.restaurant;
  const locale = await tableLocale(r.locales);
  const theme = themeMode(r.theme);

  if (r.status !== "ACTIVE") {
    const t = createTranslator(locale);
    return (
      <div data-theme={theme} style={brandStyle(r.primaryColor)} className="min-h-dvh bg-bg text-fg" lang={locale}>
        <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-2xl font-semibold" data-testid="restaurant-name">
            {r.name}
          </h1>
          <p className="text-muted">{t("table.unavailable")}</p>
        </main>
      </div>
    );
  }

  const menu = await loadMenu(r.id, locale);
  const dict = getDictionary(locale);

  return (
    <div data-theme={theme} style={brandStyle(r.primaryColor)} className="min-h-dvh bg-bg text-fg" lang={locale}>
      <TableApp
        qrToken={qrToken}
        locale={locale}
        restaurant={{ name: r.name, logoUrl: r.logoUrl }}
        table={{ number: table.number, label: table.label }}
        initialMenu={menu}
        messages={{ ...dict.table, soldOut: dict.common.soldOut }}
      />
    </div>
  );
}

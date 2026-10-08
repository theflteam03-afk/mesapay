import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { formatBRL } from "@mesapay/core";
import { withTenant } from "@mesapay/db";
import { createTranslator, LOCALES, negotiateLocale, type Locale } from "@mesapay/i18n";
import { Badge, brandStyle, themeMode } from "@mesapay/ui";
import { resolveTable } from "@/lib/table";

type Params = { slug: string; qrToken: string };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, qrToken } = await params;
  const table = await resolveTable(slug, qrToken);
  return {
    title: table ? table.restaurant.name : "Mesa não encontrada",
    robots: { index: false, follow: false },
  };
}

function i18nValue(json: unknown, locale: Locale, fallback: string): string {
  if (locale === "pt-BR" || !json || typeof json !== "object") return fallback;
  const v = (json as Record<string, unknown>)[locale];
  return typeof v === "string" && v ? v : fallback;
}

export default async function TablePage({ params }: { params: Promise<Params> }) {
  const { slug, qrToken } = await params;
  const table = await resolveTable(slug, qrToken);
  if (!table) notFound();
  const r = table.restaurant;

  const allowed = LOCALES.filter((l) => r.locales.includes(l));
  const locale = negotiateLocale((await headers()).get("accept-language"), allowed.length ? allowed : ["pt-BR"]);
  const t = createTranslator(locale);

  const shell = (children: React.ReactNode) => (
    <div data-theme={themeMode(r.theme)} style={brandStyle(r.primaryColor)} className="min-h-dvh bg-bg text-fg" lang={locale}>
      <div className="mx-auto min-h-dvh max-w-md">{children}</div>
    </div>
  );

  if (r.status !== "ACTIVE") {
    return shell(
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-semibold">{r.name}</h1>
        <p className="text-muted">{t("table.unavailable")}</p>
      </main>,
    );
  }

  const categories = await withTenant(r.id, (tx) =>
    tx.category.findMany({
      where: { active: true, paused: false },
      orderBy: { position: "asc" },
      select: {
        id: true,
        name: true,
        nameI18n: true,
        items: {
          where: { active: true },
          orderBy: { position: "asc" },
          select: { id: true, name: true, description: true, priceCents: true, soldOut: true, photoUrl: true },
        },
      },
    }),
  );

  return shell(
    <>
      <header className="bg-brand px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-6 text-brand-fg">
        <p className="text-sm opacity-85" data-testid="table-number">
          {t("table.tableLabel", { number: table.number })}
          {table.label ? ` · ${table.label}` : ""}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold" data-testid="restaurant-name">
          {r.name}
        </h1>
      </header>
      <main className="px-4 pt-5 pb-16">
        <p className="mb-6 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{t("table.menuSoon")}</p>
        {categories.map((c) => (
          <section key={c.id} className="mb-7">
            <h2 className="mb-2.5 text-lg font-semibold">{i18nValue(c.nameI18n, locale, c.name)}</h2>
            <ul className="flex flex-col gap-2">
              {c.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3"
                  data-testid="menu-item"
                >
                  <div className="min-w-0 flex-1">
                    <p className={item.soldOut ? "font-medium text-muted" : "font-medium"}>{item.name}</p>
                    {item.description ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.description}</p> : null}
                    <p className="mt-1.5 text-sm font-medium tabular-nums">{formatBRL(item.priceCents)}</p>
                  </div>
                  {item.soldOut ? <Badge tone="neutral">{t("common.soldOut")}</Badge> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>,
  );
}

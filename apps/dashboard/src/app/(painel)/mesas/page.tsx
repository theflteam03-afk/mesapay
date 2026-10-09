import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { appUrls } from "@mesapay/config/env";
import { formatBRL } from "@mesapay/core";
import { withTenant } from "@mesapay/db";
import { Badge, Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireOwnerSession } from "@/lib/session";

export const metadata: Metadata = { title: "Mesas" };

export default async function MesasPage() {
  const { restaurant } = await requireOwnerSession();
  const tables = await withTenant(restaurant.id, (tx) =>
    tx.table.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      include: {
        sessions: {
          where: { status: { not: "CLOSED" } },
          select: { status: true, total: true, paidAmount: true, _count: { select: { guests: true } } },
        },
      },
    }),
  );
  const web = appUrls.web();

  return (
    <>
      <PageHeader title={t("dashboard.tables.title")} subtitle={t("dashboard.tables.count", { count: tables.length })} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="tables-grid">
        {tables.map((table) => {
          const open = table.sessions[0];
          return (
          <li key={table.id} data-testid="table-card" data-status={open ? open.status : "FREE"}>
            <Card className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-2xl font-semibold">{table.number}</p>
                  <p className="text-xs text-muted">
                    {table.label ? `${table.label}, ` : ""}
                    {t("dashboard.tables.seats", { seats: table.seats })}
                  </p>
                </div>
                {open ? (
                  <Badge tone={open.status === "PAYING" ? "info" : "warning"}>
                    {open.status === "PAYING" ? t("dashboard.tables.paying") : t("dashboard.tables.occupied")}
                  </Badge>
                ) : (
                  <Badge tone="success">{t("dashboard.tables.free")}</Badge>
                )}
              </div>
              {open ? (
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted">{t("dashboard.tables.guests", { count: open._count.guests })}</span>
                  <span className="font-semibold tabular-nums" data-testid="table-total">
                    {formatBRL(open.total)}
                  </span>
                </div>
              ) : null}
              <a
                href={`${web}/r/${restaurant.slug}/m/${table.qrToken}`}
                target="_blank"
                rel="noreferrer"
                className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
              >
                {t("dashboard.tables.openQr")}
                <ExternalLink className="size-3.5" />
              </a>
            </Card>
          </li>
          );
        })}
      </ul>
    </>
  );
}

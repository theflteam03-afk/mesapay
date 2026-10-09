import type { Metadata } from "next";
import { formatBRL } from "@mesapay/core";
import { withTenant } from "@mesapay/db";
import { Badge, Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireOwnerSession } from "@/lib/session";
import { SoldOutSwitch } from "./sold-out-switch";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  const { restaurant } = await requireOwnerSession();
  const categories = await withTenant(restaurant.id, (tx) =>
    tx.category.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      include: {
        items: {
          where: { active: true },
          orderBy: { position: "asc" },
          include: { optionGroups: { orderBy: { position: "asc" }, include: { options: { orderBy: { position: "asc" } } } } },
        },
      },
    }),
  );
  const itemCount = categories.reduce((n, c) => n + c.items.length, 0);

  return (
    <>
      <PageHeader title={t("dashboard.menu.title")} subtitle={t("dashboard.menu.count", { categories: categories.length, items: itemCount })} />
      <div className="flex flex-col gap-8">
        {categories.map((category) => (
          <section key={category.id} aria-labelledby={`cat-${category.id}`}>
            <h2 id={`cat-${category.id}`} className="mb-3 text-lg font-semibold">
              {category.name} <span className="text-sm font-normal text-muted">({category.items.length})</span>
            </h2>
            <Card className="divide-y divide-line">
              {category.items.map((item) => (
                <div key={item.id} className="flex items-start gap-4 px-4 py-3" data-testid="menu-item">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={item.soldOut ? "font-medium text-muted line-through" : "font-medium"}>{item.name}</p>
                      <Badge tone={item.station === "BAR" ? "info" : "neutral"}>
                        {item.station === "BAR" ? t("dashboard.menu.bar") : t("dashboard.menu.kitchen")}
                      </Badge>
                      {item.soldOut ? <Badge tone="danger">{t("common.soldOut")}</Badge> : null}
                    </div>
                    {item.description ? <p className="mt-0.5 text-sm text-muted">{item.description}</p> : null}
                    {item.optionGroups.map((g) => (
                      <p key={g.id} className="mt-1 text-xs text-muted">
                        <span className="font-medium text-fg">{g.name}:</span>{" "}
                        {g.options.map((o) => (o.priceCents ? `${o.name} (+${formatBRL(o.priceCents)})` : o.name)).join(", ")}
                      </p>
                    ))}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="font-medium tabular-nums">{formatBRL(item.priceCents)}</p>
                    <SoldOutSwitch itemId={item.id} itemName={item.name} soldOut={item.soldOut} label={t("common.soldOut")} />
                  </div>
                </div>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}

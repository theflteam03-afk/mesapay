import type { Metadata } from "next";
import { prisma } from "@mesapay/db";
import { Badge, Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/session";

export const metadata: Metadata = { title: "Nossos restaurantes" };

const STATUS_TONE = { ACTIVE: "success", ONBOARDING: "info", SUSPENDED: "warning", DISABLED: "neutral" } as const;
const PLAN_LABEL = { START: "Start", PRO: "Pro", BUSINESS: "Business" } as const;

export default async function RestaurantsPage() {
  await requireAdminSession();
  // Painel SaaS: leitura global, fora do RLS por desenho (cliente "de sistema").
  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      state: true,
      plan: true,
      status: true,
      theme: true,
      primaryColor: true,
      _count: { select: { tables: { where: { active: true } }, menuItems: { where: { active: true } } } },
    },
  });

  return (
    <>
      <PageHeader title={t("admin.restaurants.title")} subtitle={t("admin.restaurants.count", { count: restaurants.length })} />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">{t("admin.restaurants.name")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.restaurants.city")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.restaurants.plan")}</th>
              <th className="px-4 py-3 font-medium">{t("admin.restaurants.status")}</th>
              <th className="px-4 py-3 text-right font-medium">{t("admin.restaurants.tables")}</th>
              <th className="px-4 py-3 text-right font-medium">Pratos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {restaurants.map((r) => (
              <tr key={r.id} data-testid="restaurant-row">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg font-display text-sm font-semibold text-white"
                      style={{ background: r.primaryColor }}
                    >
                      {r.name.slice(0, 1)}
                    </span>
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted">
                        /{r.slug} · {r.theme === "DARK" ? t("common.themeDark") : t("common.themeLight")}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {r.city}
                  {r.state ? `/${r.state}` : ""}
                </td>
                <td className="px-4 py-3">{PLAN_LABEL[r.plan]}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[r.status]}>{t(`admin.restaurants.statuses.${r.status}`)}</Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{r._count.tables}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r._count.menuItems}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

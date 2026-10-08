import type { Metadata } from "next";
import { withTenant } from "@mesapay/db";
import { Badge, Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireOwnerSession } from "@/lib/session";

export const metadata: Metadata = { title: "Funcionários" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function FuncionariosPage() {
  const { restaurant } = await requireOwnerSession();
  const staff = await withTenant(restaurant.id, (tx) =>
    tx.staff.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      // Nunca selecionar pinHash/pinLookup para a interface.
      select: { id: true, name: true, role: true, active: true, lastSeenAt: true, permissions: true },
    }),
  );

  return (
    <>
      <PageHeader title={t("dashboard.staff.title")} subtitle={t("dashboard.staff.count", { count: staff.length })} />
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
              <th className="px-4 py-3 font-medium">{t("dashboard.staff.lastSeen")}</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {staff.map((s) => (
              <tr key={s.id} data-testid="staff-row">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3">{t(`dashboard.staff.roles.${s.role}`)}</td>
                <td className="px-4 py-3 text-muted">{s.lastSeenAt ? dateFmt.format(s.lastSeenAt) : t("dashboard.staff.never")}</td>
                <td className="px-4 py-3">
                  <Badge tone={s.active ? "success" : "neutral"}>{s.active ? t("common.active") : t("common.inactive")}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

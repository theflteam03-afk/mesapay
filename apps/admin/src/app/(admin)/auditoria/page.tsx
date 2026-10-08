import type { Metadata } from "next";
import { prisma } from "@mesapay/db";
import { Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/session";

export const metadata: Metadata = { title: "Auditoria" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export default async function AuditPage() {
  await requireAdminSession();
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { restaurant: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader title={t("admin.nav.audit")} subtitle="Últimos 200 eventos" />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Quando</th>
              <th className="px-4 py-3 font-medium">Ação</th>
              <th className="px-4 py-3 font-medium">Quem</th>
              <th className="px-4 py-3 font-medium">Restaurante</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted tabular-nums">{dateFmt.format(log.createdAt)}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-2.5 text-xs">
                  {log.actorType} · <span className="text-muted">{log.actorId}</span>
                </td>
                <td className="px-4 py-2.5">{log.restaurant?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted">{log.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

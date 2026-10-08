import { Card, PageHeader } from "@mesapay/ui";
import { t } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/session";

export default async function Page() {
  await requireAdminSession();
  return (
    <>
      <PageHeader title={t("admin.nav.testimonials")} />
      <Card className="max-w-xl p-6">
        <p className="font-medium">{t("dashboard.comingSoon", { phase: 7 })}</p>
        <p className="mt-1 text-sm text-muted">Depoimentos reais de restaurantes clientes, exibidos no site.</p>
      </Card>
    </>
  );
}
